from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.db.session import get_sessionmaker
from app.models import Notification, ScheduledPayment, Transaction
from app.modules.finance.recurring import auto_create_due
from tests.conftest import Actor


async def accounts(actor: Actor) -> dict[str, dict]:
    return {a["name"]: a for a in (await actor.get(actor.f("/finance/accounts"))).json()}


async def category(actor: Actor, name: str, kind: str = "expense") -> str:
    cats = (await actor.get(actor.f("/finance/categories"))).json()
    return next(c["id"] for c in cats if c["name"] == name and c["kind"] == kind)


async def add_tx(actor: Actor, **body) -> dict:  # type: ignore[no-untyped-def]
    r = await actor.post(actor.f("/finance/transactions"), body)
    assert r.status_code == 201, r.text
    return r.json()


async def test_shared_expense_visible_to_partner(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    card = (await accounts(alice))["Общая карта"]
    food = await category(alice, "Продукты")
    tx = await add_tx(
        alice,
        kind="expense",
        amount="45.50",
        account_id=card["id"],
        category_id=food,
        description="Biedronka",
    )
    assert tx["visibility"] == "family"

    listing = (await bob.get(bob.f("/finance/transactions"))).json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == tx["id"]
    summary = (await bob.get(bob.f("/finance/summary"))).json()
    assert Decimal(summary["family"]["expense"]) == Decimal("45.50")
    assert summary["by_category"][0]["name"] == "Продукты"
    assert Decimal((await accounts(bob))["Общая карта"]["balance"]) == Decimal("-45.50")


async def test_private_records_hidden_from_partner(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    r = await alice.post(
        alice.f("/finance/accounts"), {"name": "Моя карта", "kind": "card", "visibility": "private"}
    )
    private_acc = r.json()
    tx = await add_tx(
        alice,
        kind="expense",
        amount="99.99",
        account_id=private_acc["id"],
        description="Секретный подарок",
    )
    assert tx["visibility"] == "private"

    assert "Моя карта" not in await accounts(bob)
    assert (await bob.get(bob.f("/finance/transactions"))).json()["total"] == 0
    assert (await bob.get(bob.f(f"/finance/transactions/{tx['id']}"))).status_code == 404
    assert (
        await bob.patch(bob.f(f"/finance/transactions/{tx['id']}"), {"amount": "1"})
    ).status_code == 404
    assert (await bob.delete(bob.f(f"/finance/transactions/{tx['id']}"))).status_code == 404
    # Bob cannot spend from Alice's private account.
    r = await bob.post(
        bob.f("/finance/transactions"),
        {"kind": "expense", "amount": "1", "account_id": private_acc["id"]},
    )
    assert r.status_code == 404
    bob_summary = (await bob.get(bob.f("/finance/summary?scope=all"))).json()
    assert Decimal(bob_summary["family"]["expense"]) == 0
    assert Decimal(bob_summary["personal"]["expense"]) == 0
    search = (await bob.get(bob.f("/finance/transactions?q=Секрет"))).json()
    assert search["total"] == 0

    alice_summary = (await alice.get(alice.f("/finance/summary"))).json()
    assert Decimal(alice_summary["personal"]["expense"]) == Decimal("99.99")
    assert Decimal(alice_summary["family"]["expense"]) == 0


async def test_transfers_excluded_and_refunds_reduce_expense(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    accs = await accounts(alice)
    cash, card = accs["Наличные"]["id"], accs["Общая карта"]["id"]
    salary = await category(alice, "Зарплата", "income")
    await add_tx(alice, kind="income", amount="5000", account_id=card, category_id=salary)
    await add_tx(alice, kind="transfer", amount="300", account_id=card, to_account_id=cash)
    await add_tx(alice, kind="expense", amount="200", account_id=cash)
    await add_tx(alice, kind="refund", amount="50", account_id=cash)
    s = (await alice.get(alice.f("/finance/summary"))).json()
    assert Decimal(s["family"]["income"]) == 5000
    assert Decimal(s["family"]["expense"]) == 150
    assert Decimal(s["family"]["net"]) == 4850
    accs = await accounts(alice)
    assert Decimal(accs["Общая карта"]["balance"]) == Decimal("4700")
    assert Decimal(accs["Наличные"]["balance"]) == Decimal("150")
    # Transfer validation
    r = await alice.post(
        alice.f("/finance/transactions"), {"kind": "transfer", "amount": "1", "account_id": cash}
    )
    assert r.status_code == 422
    r = await alice.post(
        alice.f("/finance/transactions"),
        {"kind": "transfer", "amount": "1", "account_id": cash, "to_account_id": cash},
    )
    assert r.status_code == 422
    r = await alice.post(
        alice.f("/finance/transactions"), {"kind": "expense", "amount": "-5", "account_id": cash}
    )
    assert r.status_code == 422
    r = await alice.post(
        alice.f("/finance/transactions"), {"kind": "expense", "amount": "1.005", "account_id": cash}
    )
    assert r.status_code == 422


async def test_idempotent_create(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    card = (await accounts(alice))["Общая карта"]["id"]
    body = {"kind": "expense", "amount": "10", "account_id": card}
    h = {"Idempotency-Key": "retry-key-0001"}
    r1 = await alice.post(alice.f("/finance/transactions"), body, headers=h)
    r2 = await alice.post(alice.f("/finance/transactions"), body, headers=h)
    assert r1.status_code == r2.status_code == 201
    assert r1.json()["id"] == r2.json()["id"]
    assert (await alice.get(alice.f("/finance/transactions"))).json()["total"] == 1
    r3 = await alice.post(alice.f("/finance/transactions"), {**body, "amount": "11"}, headers=h)
    assert r3.status_code == 422
    # Keys are per user: Bob using the same key creates his own record.
    r4 = await bob.post(bob.f("/finance/transactions"), body, headers=h)
    assert r4.status_code == 201 and r4.json()["id"] != r1.json()["id"]


async def test_budgets_and_alerts(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    card = (await accounts(alice))["Общая карта"]["id"]
    food = await category(alice, "Продукты")
    month = date.today().replace(day=1).isoformat()
    r = await alice.put(alice.f("/finance/budgets"), {"month": month, "limit_amount": "1000"})
    assert r.status_code == 200
    r = await alice.put(
        alice.f("/finance/budgets"), {"month": month, "category_id": food, "limit_amount": "100"}
    )
    assert r.status_code == 200
    # Upsert replaces the limit instead of duplicating.
    r = await alice.put(
        alice.f("/finance/budgets"), {"month": month, "category_id": food, "limit_amount": "200"}
    )
    assert len(r.json()) == 2
    await add_tx(bob, kind="expense", amount="170", account_id=card, category_id=food)
    budgets = (await alice.get(alice.f("/finance/budgets"))).json()
    food_budget = next(b for b in budgets if b["category_id"] == food)
    assert food_budget["level"] == "warning" and food_budget["percent"] == 85.0
    s = (await alice.get(alice.f("/finance/summary"))).json()
    assert s["budget"]["remaining"] == "830.00"
    assert s["category_alerts"][0]["name"] == "Продукты"
    # Copy to next month
    nxt = (date.today().replace(day=1) + timedelta(days=32)).replace(day=1).isoformat()
    r = await alice.post(alice.f("/finance/budgets/copy"), {"from_month": month, "to_month": nxt})
    assert len(r.json()) == 2


async def test_recurring_payments_no_duplicates(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    card = (await accounts(alice))["Общая карта"]["id"]
    start = date.today() - timedelta(days=40)
    r = await alice.post(
        alice.f("/finance/recurring"),
        {
            "name": "Аренда",
            "amount": "2500",
            "account_id": card,
            "frequency": "monthly",
            "start_date": start.isoformat(),
        },
    )
    assert r.status_code == 201, r.text
    rule = r.json()
    scheduled = (await bob.get(bob.f("/finance/scheduled-payments"))).json()
    assert len(scheduled) >= 3
    overdue = [s for s in scheduled if s["overdue"]]
    assert len(overdue) == 2

    # Re-running materialization is a no-op.
    async with get_sessionmaker()() as db:
        from app.models import RecurringRule
        from app.modules.finance.recurring import materialize_rule

        rr = await db.get(RecurringRule, rule["id"])
        rr.materialized_until = None
        assert await materialize_rule(db, rr, date.today()) == 0
        await db.commit()

    sp = overdue[0]
    r1 = await bob.post(bob.f(f"/finance/scheduled-payments/{sp['id']}/pay"), {})
    r2 = await alice.post(alice.f(f"/finance/scheduled-payments/{sp['id']}/pay"), {})
    assert r1.json()["status"] == r2.json()["status"] == "paid"
    assert r1.json()["transaction_id"] == r2.json()["transaction_id"]
    assert (await alice.get(alice.f("/finance/transactions"))).json()["total"] == 1

    skip = await alice.post(alice.f(f"/finance/scheduled-payments/{overdue[1]['id']}/skip"))
    assert skip.json()["status"] == "skipped"

    # Changing the amount updates future pending occurrences only.
    await alice.patch(alice.f(f"/finance/recurring/{rule['id']}"), {"amount": "2600"})
    pending = (await alice.get(alice.f("/finance/scheduled-payments?status=pending"))).json()
    assert all(p["amount"] == "2600.00" for p in pending)


async def test_auto_create_recurring_is_idempotent(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    card = (await accounts(alice))["Общая карта"]["id"]
    start = date.today() - timedelta(days=3)
    await alice.post(
        alice.f("/finance/recurring"),
        {
            "name": "Netflix",
            "amount": "43",
            "account_id": card,
            "frequency": "weekly",
            "start_date": start.isoformat(),
            "auto_create": True,
        },
    )
    async with get_sessionmaker()() as db:
        created = await auto_create_due(db)
        await db.commit()
    async with get_sessionmaker()() as db:
        again = await auto_create_due(db)
        await db.commit()
        count = await db.scalar(select(func.count()).select_from(Transaction))
        paid = await db.scalar(
            select(func.count())
            .select_from(ScheduledPayment)
            .where(ScheduledPayment.status == "paid")
        )
    assert created == 1 and again == 0 and count == 1 and paid == 1


async def test_savings_goal_forecast_and_achievement(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    r = await alice.post(
        alice.f("/finance/goals"), {"name": "Отпуск", "target_amount": "3000", "emoji": "🏖"}
    )
    goal = r.json()
    r = await bob.post(bob.f(f"/finance/goals/{goal['id']}/contributions"), {"amount": "1000"})
    g = r.json()
    assert g["saved"] == "1000.00" and g["percent"] == 33.3
    assert g["forecast_date"] is not None
    r = await alice.post(alice.f(f"/finance/goals/{goal['id']}/contributions"), {"amount": "-2000"})
    assert r.status_code == 422
    r = await alice.post(alice.f(f"/finance/goals/{goal['id']}/contributions"), {"amount": "2000"})
    assert r.json()["status"] == "achieved"
    history = (await bob.get(bob.f(f"/finance/goals/{goal['id']}/contributions"))).json()
    assert len(history) == 2
    async with get_sessionmaker()() as db:
        n = await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.category == "goal_update")
        )
    assert n == 2  # both members


async def test_csv_import_dedupes(couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    card = (await accounts(alice))["Общая карта"]["id"]
    csv = "Дата;Сумма;Описание;Категория\n01.03.2026;-12,50;Кофе;Кафе и рестораны\n01.03.2026;-12,50;Кофе;Кафе и рестораны\n2026-03-02;3000;Зарплата;Зарплата\nbad;row;x;y\n"
    files = {"file": ("bank.csv", csv.encode(), "text/csv")}
    r = await alice.post(
        alice.f("/finance/import"), data={"account_id": card, "dry_run": "true"}, files=files
    )
    assert r.status_code == 200, r.text
    assert r.json()["created"] == 3 and len(r.json()["errors"]) == 1
    assert (await alice.get(alice.f("/finance/transactions"))).json()["total"] == 0
    r = await alice.post(
        alice.f("/finance/import"), data={"account_id": card, "dry_run": "false"}, files=files
    )
    assert r.json()["created"] == 3
    r = await alice.post(
        alice.f("/finance/import"), data={"account_id": card, "dry_run": "false"}, files=files
    )
    assert r.json()["created"] == 0 and r.json()["skipped_duplicates"] == 3
    txs = (await alice.get(alice.f("/finance/transactions?kind=expense"))).json()
    assert txs["total"] == 2 and txs["items"][0]["category_id"] is not None


async def test_other_family_isolation(couple: tuple[Actor, Actor], eve: Actor) -> None:
    alice, _ = couple
    card = (await accounts(alice))["Общая карта"]["id"]
    tx = await add_tx(alice, kind="expense", amount="5", account_id=card)
    for path in (
        "/finance/accounts",
        "/finance/transactions",
        "/finance/summary",
        "/finance/budgets",
    ):
        assert (await eve.get(alice.f(path))).status_code == 404
    # Using Alice's account id inside Eve's own family must fail.
    r = await eve.post(
        eve.f("/finance/transactions"), {"kind": "expense", "amount": "1", "account_id": card}
    )
    assert r.status_code == 404
    assert (await eve.get(eve.f(f"/finance/transactions/{tx['id']}"))).status_code == 404
    assert (await eve.get(eve.f("/finance/transactions"))).json()["total"] == 0
