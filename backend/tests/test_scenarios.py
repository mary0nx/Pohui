"""The 15 mandatory integration scenarios from the specification, end to end against a real
PostgreSQL database (no mocked persistence). Only Telegram and the LLM are replaced by
test doubles."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.ai.providers import set_provider
from app.ai.providers.scripted import ScriptedProvider, call, text
from app.db.session import get_sessionmaker
from app.integrations.telegram import TelegramTemporaryError
from app.models import Notification, User
from app.models.enums import NotificationStatus
from app.workers.dispatch import dispatch_due
from app.workers.jobs import run_job
from tests.conftest import Actor, create_family, login
from tests.test_worker import FakeSender


async def test_mandatory_scenarios(client) -> None:  # type: ignore[no-untyped-def]
    # 1. User A creates a family.
    a = await login(client, 5001, "Анна")
    await create_family(a, "Анна и Павел")
    # 2. User B joins by invitation.
    b = await login(client, 5002, "Павел")
    inv = (await a.post(a.f("/invitations"), {})).json()
    assert (
        await b.post("/api/v1/invitations/accept", {"token": inv["start_param"]})
    ).status_code == 200
    b.family_id = a.family_id

    # 3. A creates a shared expense; 4. B sees it.
    accounts = (await a.get(a.f("/finance/accounts"))).json()
    shared = (
        await a.post(
            a.f("/finance/transactions"),
            {
                "kind": "expense",
                "amount": "64.20",
                "account_id": accounts[0]["id"],
                "description": "Lidl",
            },
        )
    ).json()
    assert [t["id"] for t in (await b.get(b.f("/finance/transactions"))).json()["items"]] == [
        shared["id"]
    ]

    # 5. A creates a private record; 6. B cannot read it via UI/API or AI.
    priv = (
        await a.post(a.f("/life/items"), {"kind": "note", "title": "Подарок Павлу", "body": "часы"})
    ).json()
    assert (await b.get(b.f(f"/life/items/{priv['id']}"))).status_code == 404
    assert priv["id"] not in [i["id"] for i in (await b.get(b.f("/life/items"))).json()]
    set_provider(
        ScriptedProvider(
            [call("search_transactions", {"query": "Подарок"}), text("Ничего не нашёл")]
        )
    )
    try:
        r = (await b.post(b.f("/ai/chat"), {"message": "Что Анна купила мне в подарок?"})).json()
        assert "часы" not in r["reply"]
    finally:
        set_provider(None)

    # 7. A adds an item to the list; 8. B sees it.
    lid = (await a.get(a.f("/shopping/lists"))).json()[0]["id"]
    await a.post(a.f(f"/shopping/lists/{lid}/items"), {"name": "Кофе"})
    assert [i["name"] for i in (await b.get(b.f(f"/shopping/lists/{lid}"))).json()["items"]] == [
        "Кофе"
    ]

    # 9. A creates an event; 10. the system schedules a reminder.
    start = datetime.now(UTC) + timedelta(minutes=40)
    await a.post(
        a.f("/calendar/events"),
        {"title": "Театр", "starts_at": start.isoformat(), "reminder_minutes": [30]},
    )
    sm = get_sessionmaker()
    assert (await run_job(sm, "reminders"))["events"] == 2

    # 11. AI produces an allowed action; 12. only the authorized user can confirm it.
    await a.patch(a.f(), {"ai_auto_execute": False})
    set_provider(
        ScriptedProvider(
            [
                call("create_transaction", {"amount": "30", "category": "Транспорт"}),
                text("Нужно подтверждение"),
            ]
        )
    )
    try:
        res = (await a.post(a.f("/ai/chat"), {"message": "Такси 30 злотых"})).json()
    finally:
        set_provider(None)
    pid = res["proposals"][0]["id"]
    assert (await b.post(b.f(f"/ai/proposals/{pid}/confirm"))).status_code == 404
    assert (await a.post(a.f(f"/ai/proposals/{pid}/confirm"))).json()["status"] == "executed"

    # 13. A repeated request does not create a duplicate.
    h = {"Idempotency-Key": "scenario-13-key"}
    body = {"kind": "expense", "amount": "5", "account_id": accounts[0]["id"]}
    first = (await a.post(a.f("/finance/transactions"), body, headers=h)).json()
    second = (await a.post(a.f("/finance/transactions"), body, headers=h)).json()
    assert first["id"] == second["id"]
    assert (await a.post(a.f(f"/ai/proposals/{pid}/confirm"))).json()["status"] == "executed"
    assert (await a.get(a.f("/finance/transactions"))).json()["total"] == 3  # 64.20, 30 (AI), 5

    # 14. A Telegram API error does not lose the job: state is recorded and retried.
    async with sm() as db:
        await db.execute(update(User).values(bot_started_at=datetime.now(UTC)))
        await db.commit()
    fire = start - timedelta(minutes=29)
    stats = await dispatch_due(
        sm,
        FakeSender([TelegramTemporaryError("timeout"), TelegramTemporaryError("timeout")]),
        "Europe/Warsaw",
        now=fire,
    )
    assert stats.retried == 2
    async with sm() as db:
        pending = (
            (
                await db.execute(
                    select(Notification).where(Notification.category == "event_reminder")
                )
            )
            .scalars()
            .all()
        )
    assert {n.status for n in pending} == {NotificationStatus.pending} and all(
        n.last_error for n in pending
    )
    later = max(n.scheduled_for for n in pending) + timedelta(seconds=1)
    assert (await dispatch_due(sm, FakeSender(), "Europe/Warsaw", now=later)).sent == 2

    # 15. One family's data is not accessible to another family.
    e = await login(client, 5003, "Ева")
    await create_family(e, "Другие")
    for path in (
        "",
        "/finance/transactions",
        "/shopping/lists",
        "/calendar/occurrences",
        "/tasks",
        "/life/items",
        "/documents",
        "/dashboard",
        "/ai/proposals",
    ):
        assert (await e.get(a.f(path))).status_code == 404, path
    assert (await e.get(e.f(f"/finance/transactions/{shared['id']}"))).status_code == 404
    assert (await e.get(e.f(f"/shopping/lists/{lid}"))).status_code == 404
    assert isinstance(e, Actor)
