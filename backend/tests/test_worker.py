from datetime import UTC, datetime, time, timedelta

from sqlalchemy import select, update

from app.db.session import get_sessionmaker
from app.integrations.telegram import (
    TelegramPermanentError,
    TelegramRateLimited,
    TelegramTemporaryError,
)
from app.models import Notification, NotificationSettings, User
from app.models.enums import NotificationStatus
from app.workers.dispatch import dispatch_due, in_quiet_hours
from app.workers.jobs import run_job
from tests.conftest import Actor


class FakeSender:
    def __init__(self, behaviour: list[object] | None = None) -> None:
        self.behaviour = behaviour or []
        self.sent: list[tuple[int, str]] = []

    async def send(self, chat_id: int, text: str, button_text: str | None, button_path: str | None) -> int:
        if self.behaviour:
            action = self.behaviour.pop(0)
            if isinstance(action, Exception):
                raise action
        self.sent.append((chat_id, text))
        return 1000 + len(self.sent)


async def start_bot(*actors: Actor) -> None:
    async with get_sessionmaker()() as db:
        await db.execute(update(User).where(User.id.in_([a.user_id for a in actors])).values(bot_started_at=datetime.now(UTC)))
        await db.commit()


async def notifications() -> list[Notification]:
    async with get_sessionmaker()() as db:
        return list((await db.execute(select(Notification).order_by(Notification.created_at))).scalars())


async def test_event_reminder_scheduled_once_and_delivered(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    await start_bot(alice, bob)
    start = datetime.now(UTC) + timedelta(minutes=45)
    await alice.post(alice.f("/calendar/events"), {"title": "Ужин", "starts_at": start.isoformat(), "reminder_minutes": [30]})
    sm = get_sessionmaker()
    r1 = await run_job(sm, "reminders")
    r2 = await run_job(sm, "reminders")
    assert r1["events"] == 2 and r2["events"] == 0  # both members, no duplicates on re-run
    rows = await notifications()
    assert all(abs((n.scheduled_for - (start - timedelta(minutes=30))).total_seconds()) < 1 for n in rows)

    sender = FakeSender()
    stats = await dispatch_due(sm, sender, "Europe/Warsaw")
    assert stats.sent == 0  # not due yet
    stats = await dispatch_due(sm, sender, "Europe/Warsaw", now=start - timedelta(minutes=29))
    assert stats.sent == 2 and len(sender.sent) == 2
    stats = await dispatch_due(sm, sender, "Europe/Warsaw", now=start - timedelta(minutes=20))
    assert stats.sent == 0
    assert {n.status for n in await notifications()} == {NotificationStatus.sent}

    inbox = (await bob.get("/api/v1/notifications")).json()
    assert inbox["unread"] == 1 and inbox["items"][0]["title"] == "📅 Ужин"


async def test_private_event_reminder_only_for_author(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    start = datetime.now(UTC) + timedelta(minutes=20)
    await alice.post(
        alice.f("/calendar/events"),
        {"title": "Сюрприз", "starts_at": start.isoformat(), "reminder_minutes": [10], "visibility": "private", "remind_all_members": True},
    )
    await run_job(get_sessionmaker(), "reminders")
    rows = await notifications()
    assert [str(n.user_id) for n in rows] == [alice.user_id]
    assert (await bob.get("/api/v1/notifications")).json()["items"] == []


async def test_telegram_errors_keep_state(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    await start_bot(alice, bob)
    past = (datetime.now(UTC) - timedelta(hours=1)).isoformat()
    await alice.post(alice.f("/tasks"), {"title": "Оплатить свет", "due_at": past, "assignee_id": alice.user_id})
    sm = get_sessionmaker()
    await run_job(sm, "reminders")
    overdue = [n for n in await notifications() if n.category == "task_overdue"]
    assert len(overdue) == 1

    now = datetime.now(UTC)
    sender = FakeSender([TelegramTemporaryError("network down")])
    stats = await dispatch_due(sm, sender, "Europe/Warsaw", now=now)
    assert stats.retried >= 1
    n = next(x for x in await notifications() if x.category == "task_overdue")
    assert n.status == NotificationStatus.pending and n.attempts == 1 and n.last_error
    assert n.scheduled_for > now  # backoff

    sender = FakeSender([TelegramRateLimited(5)])
    await dispatch_due(sm, sender, "Europe/Warsaw", now=n.scheduled_for + timedelta(seconds=1))
    n = next(x for x in await notifications() if x.category == "task_overdue")
    assert n.status == NotificationStatus.pending and n.attempts == 2

    sender = FakeSender()
    await dispatch_due(sm, sender, "Europe/Warsaw", now=n.scheduled_for + timedelta(seconds=1))
    n = next(x for x in await notifications() if x.category == "task_overdue")
    assert n.status == NotificationStatus.sent and n.telegram_message_id


async def test_blocked_bot_marks_failed(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    await start_bot(alice, bob)
    await alice.post(alice.f("/tasks"), {"title": "Задача", "assignee_id": bob.user_id})  # task_assigned for Bob
    sm = get_sessionmaker()
    sender = FakeSender([TelegramPermanentError("forbidden", blocked=True)])
    stats = await dispatch_due(sm, sender, "Europe/Warsaw")
    assert stats.failed == 1
    async with sm() as db:
        bob_user = await db.get(User, bob.user_id)
        assert bob_user.bot_blocked


async def test_crashed_sending_row_is_reclaimed(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    await start_bot(alice, bob)
    await alice.post(alice.f("/tasks"), {"title": "Задача", "assignee_id": bob.user_id})
    sm = get_sessionmaker()
    async with sm() as db:  # simulate a worker that died after claiming the row
        await db.execute(update(Notification).values(status=NotificationStatus.sending, locked_until=datetime.now(UTC) - timedelta(seconds=1)))
        await db.commit()
    stats = await dispatch_due(sm, FakeSender(), "Europe/Warsaw")
    assert stats.sent == 1


async def test_quiet_hours_postpone_and_preferences(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    await start_bot(alice, bob)
    r = await bob.put("/api/v1/notifications/settings", {"quiet_start": "22:00", "quiet_end": "08:00", "timezone": "Europe/Warsaw", "categories": {"task_assigned": True}})
    assert r.status_code == 200 and r.json()["categories"]["shopping_update"] is False
    await alice.post(alice.f("/tasks"), {"title": "Ночная задача", "assignee_id": bob.user_id})
    night = datetime(2026, 11, 3, 23, 30, tzinfo=UTC)  # 00:30 in Warsaw
    sm = get_sessionmaker()
    async with sm() as db:
        await db.execute(update(Notification).values(scheduled_for=night - timedelta(minutes=1)))
        await db.commit()
    stats = await dispatch_due(sm, FakeSender(), "Europe/Warsaw", now=night)
    assert stats.postponed == 1
    n = (await notifications())[0]
    assert n.status == NotificationStatus.pending and n.scheduled_for == datetime(2026, 11, 4, 7, 0, tzinfo=UTC)

    # Disabled category -> skipped.
    await bob.put("/api/v1/notifications/settings", {"categories": {"task_assigned": False}})
    stats = await dispatch_due(sm, FakeSender(), "Europe/Warsaw", now=n.scheduled_for)
    assert stats.skipped == 1


def test_quiet_hours_function() -> None:
    s = NotificationSettings(quiet_start=time(22), quiet_end=time(7), timezone="Europe/Warsaw")
    assert in_quiet_hours(datetime(2026, 7, 1, 12, tzinfo=UTC), s, "UTC") is None
    end = in_quiet_hours(datetime(2026, 7, 1, 21, 30, tzinfo=UTC), s, "UTC")  # 23:30 local (CEST)
    assert end == datetime(2026, 7, 2, 5, 0, tzinfo=UTC)


async def test_payment_reminder(couple: tuple[Actor, Actor]) -> None:
    alice, _bob = couple
    accs = (await alice.get(alice.f("/finance/accounts"))).json()
    tomorrow = (datetime.now(UTC) + timedelta(days=1)).date()
    await alice.post(
        alice.f("/finance/recurring"),
        {"name": "Интернет", "amount": "60", "account_id": accs[0]["id"], "start_date": tomorrow.isoformat(), "remind_days_before": 1},
    )
    sm = get_sessionmaker()
    result = await run_job(sm, "reminders")
    assert result["payments"] == 2
    assert await run_job(sm, "reminders") == {"events": 0, "tasks": 0, "custom": 0, "overdue": 0, "payments": 0, "documents": 0}
