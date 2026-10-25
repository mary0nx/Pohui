"""Apple Pay transactions sent by an iPhone Shortcuts automation."""

from decimal import Decimal
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.errors import ValidationFailed
from app.modules.integrations.apple_pay import parse_amount
from tests.conftest import Actor

HOOK = "/api/v1/hooks/apple-pay"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("12,50 zł", (Decimal("12.50"), "PLN", False)),
        ("zł 1 234,56", (Decimal("1234.56"), "PLN", False)),
        ("1 234,56 zł", (Decimal("1234.56"), "PLN", False)),
        ("PLN 12.50", (Decimal("12.50"), "PLN", False)),
        ("1.234,56 zł", (Decimal("1234.56"), "PLN", False)),
        ("$1,234.56", (Decimal("1234.56"), "USD", False)),
        ("€3.20", (Decimal("3.20"), "EUR", False)),
        ("-3,20 €", (Decimal("3.20"), "EUR", True)),
        ("15 zł", (Decimal("15.00"), "PLN", False)),
        ("7.5", (Decimal("7.50"), None, False)),
        ("2 500 ₽", (Decimal("2500.00"), "RUB", False)),
    ],
)
def test_parse_amount(text: str, expected: tuple[Decimal, str | None, bool]) -> None:
    assert parse_amount(text) == expected


@pytest.mark.parametrize("text", ["abc", "0 zł", "zł"])
def test_parse_amount_rejects(text: str) -> None:
    with pytest.raises(ValidationFailed):
        parse_amount(text)


async def connect(actor: Actor, **body: Any) -> str:
    r = await actor.post(actor.f("/integrations/apple-pay"), body)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["token"].startswith("fos_") and data["hook_url"].endswith(HOOK)
    return str(data["token"])


async def send(client: AsyncClient, token: str, **body: Any) -> Any:
    return await client.post(HOOK, json=body, headers={"Authorization": f"Bearer {token}"})


async def transactions(actor: Actor) -> list[dict[str, Any]]:
    return list((await actor.get(actor.f("/finance/transactions"))).json()["items"])


async def categories(actor: Actor) -> dict[str, str]:
    return {c["id"]: c["name"] for c in (await actor.get(actor.f("/finance/categories"))).json()}


async def test_apple_pay_payment_becomes_an_expense(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    token = await connect(alice)
    r = await send(
        alice.client,
        token,
        amount="45,90 zł",
        merchant="Biedronka",
        card="Visa ••1234",
        location="ul. Marszałkowska 10, Warszawa",
    )
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/plain")
    assert r.text == "Записано: 45,90 PLN — Biedronka (Продукты)"

    [tx] = await transactions(alice)
    assert tx["kind"] == "expense" and Decimal(tx["amount"]) == Decimal("45.90")
    assert tx["merchant"] == "Biedronka" and tx["payment_method"] == "card"
    assert tx["created_by"] == alice.user_id
    assert (
        "Visa ••1234" in tx["description"]
        and "📍 ul. Marszałkowska 10, Warszawa" in tx["description"]
    )
    assert (await categories(alice))[tx["category_id"]] == "Продукты"
    # The default account is shared, so the partner sees the purchase too.
    assert [t["id"] for t in await transactions(bob)] == [tx["id"]]

    # Shortcuts firing twice for one payment does not duplicate it.
    again = await send(alice.client, token, amount="45,90 zł", merchant="Biedronka")
    assert again.text.startswith("Уже записано")
    assert len(await transactions(alice)) == 1


async def test_refund_foreign_currency_and_learned_category(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    token = await connect(alice)
    assert (await send(alice.client, token, amount="-12,00 zł", merchant="Zara")).text.startswith(
        "Возврат: 12,00 PLN — Zara"
    )
    eur = await send(alice.client, token, amount="€3.20", merchant="Café de Paris")
    assert eur.status_code == 200
    txs = {t["merchant"]: t for t in await transactions(alice)}
    assert txs["Zara"]["kind"] == "refund"
    # No EUR account in the family: recorded in the main account, with a note.
    assert "сумма в EUR" in txs["Café de Paris"]["description"]

    # Re-categorise a merchant once; the next payment there follows the family's choice.
    cats = {name: cid for cid, name in (await categories(alice)).items()}
    first = await send(alice.client, token, amount="20 zł", merchant="Moja Kawiarenka Pod Lipą")
    assert first.status_code == 200
    tx = next(t for t in await transactions(alice) if t["merchant"] == "Moja Kawiarenka Pod Lipą")
    await alice.patch(
        alice.f(f"/finance/transactions/{tx['id']}"), {"category_id": cats["Развлечения"]}
    )
    second = await send(alice.client, token, amount="21 zł", merchant="moja kawiarenka pod lipą")
    assert second.text.endswith("(Развлечения)")


async def test_keys_are_personal_and_revocable(couple: tuple[Actor, Actor], eve: Actor) -> None:
    alice, bob = couple
    client = alice.client
    assert (await client.post(HOOK, json={"amount": "1 zł"})).status_code == 401
    assert (await send(client, "fos_not-a-real-key", amount="1 zł")).status_code == 401

    token = await connect(alice)
    assert (await bob.get(bob.f("/integrations/apple-pay"))).json()["connected"] is False
    status = (await alice.get(alice.f("/integrations/apple-pay"))).json()
    assert status["connected"] is True and token.startswith(status["token_prefix"])
    assert "token" not in status  # the key is shown only once

    # Bad payloads are explained in plain text.
    bad = await send(client, token, merchant="X")
    assert bad.status_code == 422
    assert (await send(client, token, amount="zero", merchant="X")).status_code == 422

    # A new key replaces the old one; disconnecting stops the current one.
    new_token = await connect(alice)
    assert (await send(client, token, amount="1 zł")).status_code == 401
    assert (await send(client, new_token, amount="1 zł", merchant="Test")).status_code == 200
    assert (await alice.delete(alice.f("/integrations/apple-pay"))).status_code == 204
    assert (await send(client, new_token, amount="2 zł", merchant="Test")).status_code == 401

    # Another family's account cannot be chosen as the target.
    eve_account = (await eve.get(eve.f("/finance/accounts"))).json()[0]["id"]
    r = await alice.post(alice.f("/integrations/apple-pay"), {"account_id": eve_account})
    assert r.status_code == 422


async def test_chosen_account_is_used(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    acc = await alice.post(
        alice.f("/finance/accounts"),
        {"name": "Моя карта", "kind": "card", "currency": "PLN", "visibility": "private"},
    )
    assert acc.status_code == 201, acc.text
    token = await connect(alice, account_id=acc.json()["id"])
    await send(alice.client, token, amount="9,99 zł", merchant="Żabka")
    [tx] = await transactions(alice)
    assert tx["account_id"] == acc.json()["id"] and tx["visibility"] == "private"


class FakeSender:
    def __init__(self) -> None:
        self.sent: list[tuple[int, str]] = []

    async def send(
        self, chat_id: int, text: str, button_text: str | None, button_path: str | None
    ) -> int:
        self.sent.append((chat_id, text))
        return 1


async def test_key_can_be_sent_to_the_bot_chat(
    couple: tuple[Actor, Actor], monkeypatch: pytest.MonkeyPatch
) -> None:
    from datetime import UTC, datetime

    from sqlalchemy import update

    import app.modules.integrations.apple_pay as apple_pay
    from app.db.session import get_sessionmaker
    from app.models import User

    alice, _ = couple
    fake = FakeSender()
    monkeypatch.setattr(apple_pay, "make_sender", lambda: fake)

    # Without /start in the bot there is no chat to write to.
    r = await alice.post(alice.f("/integrations/apple-pay"), {"send_to_chat": True})
    assert r.json()["sent_to_chat"] is False and fake.sent == []

    async with get_sessionmaker()() as db:
        await db.execute(
            update(User).where(User.id == alice.user_id).values(bot_started_at=datetime.now(UTC))
        )
        await db.commit()
    r = await alice.post(alice.f("/integrations/apple-pay"), {"send_to_chat": True})
    assert r.json()["sent_to_chat"] is True
    [(chat_id, text)] = fake.sent
    assert chat_id == 1001
    assert f"<code>Bearer {r.json()['token']}</code>" in text and "/api/v1/hooks/apple-pay" in text
