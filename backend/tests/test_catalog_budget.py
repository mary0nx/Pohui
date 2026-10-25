"""Product catalogue + family shopping list, and the month budget (limit / spent / remaining)."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient

from app.core.errors import ValidationFailed
from app.db.session import get_sessionmaker
from app.modules.catalog import service as catalog
from app.modules.catalog.data import CATALOG
from app.modules.catalog.images import CachedImageSearch, ImageCandidate, validate_image_ref
from tests.conftest import Actor, create_family, login

FRONTEND_PRODUCTS = Path(__file__).resolve().parents[2] / "frontend" / "public" / "products"


@pytest.fixture(autouse=True)
async def seeded_catalog() -> None:
    catalog.invalidate_cache()
    async with get_sessionmaker()() as db:
        await catalog.sync_catalog(db)
        await db.commit()


async def catalog_rows() -> int:
    from sqlalchemy import func, select

    from app.models import ProductCatalog

    async with get_sessionmaker()() as db:
        return int(await db.scalar(select(func.count()).select_from(ProductCatalog)) or 0)


# --- 1–5. Catalogue ------------------------------------------------------------------------


async def test_catalogue_size_uniqueness_and_idempotent_seed() -> None:
    assert 150 <= len(CATALOG) <= 200
    assert len({e.id for e in CATALOG}) == len(CATALOG)
    assert len({catalog.normalize(e.name) for e in CATALOG}) == len(CATALOG)
    assert await catalog_rows() == len(CATALOG)
    async with get_sessionmaker()() as db:  # seeding again changes nothing
        await catalog.sync_catalog(db)
        await catalog.sync_catalog(db)
        await db.commit()
    assert await catalog_rows() == len(CATALOG)


def test_every_product_has_a_bundled_licensed_thumbnail() -> None:
    assert (FRONTEND_PRODUCTS / "LICENSE.md").exists()
    for image in catalog.KNOWN_IMAGES:
        svg = FRONTEND_PRODUCTS / f"{image}.svg"
        assert svg.exists(), image
        assert b"<script" not in svg.read_bytes()


@pytest.mark.parametrize(
    ("query", "expected"),
    [
        ("молоко", "milk"),
        ("Помидор", "tomatoes"),  # inflection
        ("томаты", "tomatoes"),  # synonym
        ("яйцо", "eggs"),
        ("ogorki", "cucumbers"),  # Polish, without diacritics
        ("Jabłka", "apples"),
        ("туалетка", "toilet-paper"),
        ("гречневая крупа", "buckwheat"),
        ("сёмга", "salmon"),
    ],
)
async def test_search_by_name_synonym_and_polish(query: str, expected: str) -> None:
    async with get_sessionmaker()() as db:
        found = await catalog.search(db, query, limit=5)
        assert found and found[0].id == expected, [p.id for p in found]
        assert (await catalog.match(db, query)) is not None


async def test_prefix_search_and_no_false_match() -> None:
    async with get_sessionmaker()() as db:
        assert "milk" in [p.id for p in await catalog.search(db, "мол")]
        assert await catalog.match(db, "молотый имбирь с лаймом") is None  # new product
        assert await catalog.search(db, "квантовый компьютер") == []


async def test_catalog_api(alice: Actor) -> None:
    await create_family(alice)
    r = await alice.get(alice.f("/catalog"), params={"q": "бананы"})
    assert r.status_code == 200
    body = r.json()
    assert body["external_enabled"] is False  # no external image source is configured
    first = body["items"][0]
    assert first["id"] == "bananas" and first["image"] == "local:1f34c"
    assert first["category_label"] == "Фрукты и ягоды"
    cats = (await alice.get(alice.f("/catalog/categories"))).json()
    assert len(cats) == 13 and sum(c["count"] for c in cats) == len(CATALOG)
    every = (await alice.get(alice.f("/catalog"), params={"limit": 250})).json()["items"]
    assert len(every) == len(CATALOG)


async def test_catalog_needs_a_family_member(client: AsyncClient, eve: Actor) -> None:
    other = await login(client, 4242, "Гость")
    r = await other.client.get(eve.f("/catalog"), headers=other.headers)
    assert r.status_code in (403, 404)


def test_image_references_are_allow_listed(monkeypatch: pytest.MonkeyPatch) -> None:
    assert validate_image_ref("local:1f95b") == "local:1f95b"
    for bad in ("local:../../etc/passwd", "local:ffffff", "javascript:alert(1)",
                "http://images.example/a.png", "https://evil.example/a.png"):  # fmt: skip
        with pytest.raises(ValidationFailed):
            validate_image_ref(bad)

    from app.config import get_settings

    monkeypatch.setenv("IMAGE_ALLOWED_HOSTS", "images.example")
    get_settings.cache_clear()
    try:
        assert validate_image_ref("https://images.example/a.png")
        with pytest.raises(ValidationFailed):
            validate_image_ref("https://user:pw@images.example/a.png")
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


async def test_external_image_search_is_cached_limited_and_filtered(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.config import get_settings

    monkeypatch.setenv("IMAGE_ALLOWED_HOSTS", "images.example")
    get_settings.cache_clear()

    class FakeSource:
        calls = 0

        async def search(self, query: str, limit: int) -> list[ImageCandidate]:
            FakeSource.calls += 1
            if query == "сломалось":
                raise RuntimeError("outage")
            return [
                ImageCandidate("https://images.example/1.png", query),
                ImageCandidate("https://tracker.example/2.png", query),  # not allow-listed
            ]

    now = [0.0]
    search = CachedImageSearch(FakeSource(), per_minute=2, clock=lambda: now[0])
    try:
        first = await search.search("fam", "Киноа")
        assert [c.url for c in first] == ["https://images.example/1.png"]
        await search.search("fam", "киноа ")  # cached: same normalised query
        assert FakeSource.calls == 1
        await search.search("fam", "булгур")
        assert await search.search("fam", "кускус") == []  # over 2 per minute
        assert FakeSource.calls == 2
        now[0] = 61.0
        assert await search.search("fam", "сломалось") == []  # outage → empty, no error
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()


# --- 6–10. Family shopping list on the real API --------------------------------------------


async def main_list(actor: Actor) -> str:
    r = await actor.post(actor.f("/shopping/lists"), {"name": "Продукты"})
    assert r.status_code == 201, r.text
    return str(r.json()["id"])


async def items(actor: Actor, list_id: str) -> list[dict[str, Any]]:
    r = await actor.get(actor.f(f"/shopping/lists/{list_id}"))
    assert r.status_code == 200, r.text
    return list(r.json()["items"])


async def test_catalogue_items_in_the_family_list(couple: tuple[Actor, Actor], eve: Actor) -> None:
    alice, bob = couple
    lid = await main_list(alice)

    # From the catalogue: thumbnail, category and unit come with the product.
    r = await alice.post(
        alice.f(f"/shopping/lists/{lid}/items"),
        {"name": "Молоко", "catalog_id": "milk", "quantity": "2"},
    )
    assert r.status_code == 201, r.text
    [milk] = r.json()
    assert (milk["catalog_id"], milk["image"]) == ("milk", "local:1f95b")
    assert milk["category"] == "Молочные продукты и яйца" and milk["unit"] == "л"

    # Typed text is matched on the server; a new product keeps working without a picture.
    r = await alice.post(
        alice.f(f"/shopping/lists/{lid}/items/bulk"), {"text": "яйца 10 шт, киноа красная"}
    )
    assert r.status_code == 201, r.text
    eggs, quinoa = r.json()
    assert eggs["catalog_id"] == "eggs" and eggs["image"] == "local:1f95a"
    assert eggs["unit"] == "шт"  # the typed unit wins
    assert quinoa["catalog_id"] is None and quinoa["image"] is None

    # Unknown catalogue id and foreign image URLs are refused.
    bad = await alice.post(
        alice.f(f"/shopping/lists/{lid}/items"), {"name": "X", "catalog_id": "nope"}
    )
    assert bad.status_code == 422
    bad = await alice.post(
        alice.f(f"/shopping/lists/{lid}/items"),
        {"name": "X", "image": "https://evil.example/x.png"},
    )
    assert bad.status_code == 422

    # Quantity, price and status changes are stored; the partner sees them (same family).
    r = await bob.patch(
        bob.f(f"/shopping/lists/{lid}/items/{milk['id']}"),
        {"quantity": "3", "estimated_price": "4.49", "status": "bought"},
    )
    assert r.status_code == 200, r.text
    saved = {i["id"]: i for i in await items(alice, lid)}  # a fresh read = after reload
    assert Decimal(saved[milk["id"]]["quantity"]) == Decimal("3")
    assert Decimal(saved[milk["id"]]["estimated_price"]) == Decimal("4.49")
    assert saved[milk["id"]]["status"] == "bought"
    assert {i["name"] for i in await items(bob, lid)} == {"Молоко", "Яйца", "Киноа красная"}

    # Renaming re-links the product.
    r = await alice.patch(
        alice.f(f"/shopping/lists/{lid}/items/{quinoa['id']}"), {"name": "Бананы"}
    )
    assert (r.json()["catalog_id"], r.json()["image"]) == ("bananas", "local:1f34c")

    # Delete.
    assert (
        await alice.delete(alice.f(f"/shopping/lists/{lid}/items/{eggs['id']}"))
    ).status_code == 204
    assert eggs["id"] not in {i["id"] for i in await items(alice, lid)}

    # Another family can neither read nor change the list.
    assert (await eve.get(alice.f(f"/shopping/lists/{lid}"))).status_code in (403, 404)
    foreign = alice.f(f"/shopping/lists/{lid}/items")
    assert (await eve.post(foreign, {"name": "Чужое"})).status_code in (403, 404)
    r = await eve.post(eve.f(f"/shopping/lists/{lid}/items"), {"name": "Чужое"})
    assert r.status_code == 404  # the list id from another family is not found in Eve's

    # The home screen shows the needed items with thumbnails.
    dash = (await alice.get(alice.f("/dashboard"))).json()["shopping"]
    assert dash["needed_total"] == 1
    assert [(e["name"], e["image"]) for e in dash["entries"]] == [("Бананы", "local:1f34c")]


# --- Budget: limit / spent / remaining --------------------------------------------------------


async def card_account(actor: Actor) -> str:
    accs = (await actor.get(actor.f("/finance/accounts"))).json()
    return str(accs[0]["id"])


async def spend(actor: Actor, amount: str, kind: str = "expense") -> None:
    r = await actor.post(
        actor.f("/finance/transactions"),
        {"kind": kind, "amount": amount, "account_id": await card_account(actor)},
    )
    assert r.status_code == 201, r.text


async def set_budget(actor: Actor, amount: str) -> Any:
    from datetime import date

    return await actor.put(
        actor.f("/finance/budgets"),
        {"month": date.today().replace(day=1).isoformat(), "limit_amount": amount},
    )


async def budget(actor: Actor) -> dict[str, Any] | None:
    d = (await actor.get(actor.f("/dashboard"))).json()
    return d["budget"]


def money(v: str) -> Decimal:
    return Decimal(v)


async def test_budget_scenarios_a_b_e(alice: Actor) -> None:
    await create_family(alice)
    # D: no budget → nothing invented.
    assert await budget(alice) is None

    # A: 500 limit, one 2.50 expense.
    assert (await set_budget(alice, "500")).status_code == 200
    await spend(alice, "2.50")
    b = await budget(alice)
    assert b is not None
    assert (money(b["limit"]), money(b["spent"]), money(b["remaining"])) == (
        Decimal("500"), Decimal("2.50"), Decimal("497.50"),
    )  # fmt: skip
    dash = (await alice.get(alice.f("/dashboard"))).json()
    assert money(dash["month_family"]["net"]) == Decimal("-2.50")  # balance = income − expense

    # B: three expenses in total 50.00; income never counts as spending.
    await spend(alice, "10.00")
    await spend(alice, "37.50")
    await spend(alice, "100.00", kind="income")
    b = await budget(alice)
    assert b is not None
    assert (money(b["spent"]), money(b["remaining"])) == (Decimal("50.00"), Decimal("450.00"))

    # E: the limit changes, the expenses stay, the remainder follows.
    assert (await set_budget(alice, "600")).status_code == 200
    b = await budget(alice)
    assert b is not None
    assert (money(b["limit"]), money(b["remaining"])) == (Decimal("600"), Decimal("550.00"))

    # Stored in PostgreSQL: a fresh read of the budgets list agrees with the dashboard.
    stored = (await alice.get(alice.f("/finance/budgets"))).json()
    overall = next(x for x in stored if x["category_id"] is None)
    assert money(overall["limit_amount"]) == Decimal("600")
    assert money(overall["spent"]) == Decimal("50.00")


async def test_budget_scenario_c_exceeded(alice: Actor) -> None:
    await create_family(alice)
    await set_budget(alice, "500")
    await spend(alice, "520.00")
    b = await budget(alice)
    assert b is not None
    assert money(b["remaining"]) == Decimal("-20.00")  # negative, not hidden at zero
    assert b["level"] == "exceeded"


async def test_budget_scenario_f_isolation_and_rights(
    client: AsyncClient, couple: tuple[Actor, Actor], eve: Actor
) -> None:
    alice, bob = couple
    await set_budget(alice, "500")
    await set_budget(eve, "100")
    a, e = await budget(alice), await budget(eve)
    assert a is not None and e is not None
    assert (money(a["limit"]), money(e["limit"])) == (Decimal("500"), Decimal("100"))

    # Eve cannot touch Alice's budget.
    r = await eve.put(alice.f("/finance/budgets"), {"month": "2026-10-01", "limit_amount": "1"})
    assert r.status_code in (403, 404)

    # Bob joined as admin (the invitation default) and may set it; a plain member may not.
    assert (await set_budget(bob, "550")).status_code == 200
    r = await alice.post(alice.f("/invitations"), {"role": "member"})
    carol = await login(client, 3003, "Карина")
    assert (
        await carol.post("/api/v1/invitations/accept", {"token": r.json()["token"]})
    ).status_code == 200
    carol.family_id = alice.family_id
    r = await set_budget(carol, "1")
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"
    b = await budget(alice)
    assert b is not None and money(b["limit"]) == Decimal("550")
    assert (await budget(carol)) == b  # members still see the shared budget


async def test_budget_scenario_g_precision(alice: Actor) -> None:
    await create_family(alice)
    await set_budget(alice, "0.30")
    for amount in ("0.10", "0.10", "0.10"):  # 0.1 + 0.1 + 0.1 != 0.3 in floats
        await spend(alice, amount)
    b = await budget(alice)
    assert b is not None
    assert b["spent"] == "0.30" and money(b["remaining"]) == Decimal("0.00")
    assert not b["remaining"].startswith("--")
