"""Week planner: shopping items and tasks for a day, with a morning reminder that day."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.db.session import get_sessionmaker
from app.models import Notification
from app.models.enums import NotificationCategory
from app.workers.reminders import schedule_shopping_day, schedule_task_day
from tests.conftest import Actor

TZ = ZoneInfo("Europe/Warsaw")  # family default timezone in tests


def local(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, minute), tzinfo=TZ)


async def default_list(actor: Actor) -> str:
    return str((await actor.get(actor.f("/shopping/lists"))).json()[0]["id"])


async def day_notifications(category: NotificationCategory) -> list[Notification]:
    async with get_sessionmaker()() as db:
        return list(
            (
                await db.execute(
                    select(Notification)
                    .where(Notification.category == category)
                    .order_by(Notification.created_at)
                )
            ).scalars()
        )


async def run(job, now: datetime) -> int:  # type: ignore[no-untyped-def]
    async with get_sessionmaker()() as db:
        created = await job(db, now)
        await db.commit()
        return int(created)


async def test_shopping_items_planned_by_day(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    lid = await default_list(alice)
    today = datetime.now(TZ).date()
    tomorrow = today + timedelta(days=1)
    items = alice.f(f"/shopping/lists/{lid}/items")

    r = await alice.post(items, {"name": "Молоко", "planned_for": today.isoformat()})
    assert r.status_code == 201 and r.json()[0]["planned_for"] == today.isoformat()
    # The same item for another day is a separate line; for the same day it merges.
    await alice.post(items, {"name": "Молоко", "planned_for": tomorrow.isoformat()})
    await alice.post(items, {"name": "молоко", "quantity": "1", "planned_for": today.isoformat()})
    bulk = await bob.post(
        bob.f(f"/shopping/lists/{lid}/items/bulk"),
        {"text": "хлеб, яйца 10 шт", "planned_for": tomorrow.isoformat()},
    )
    assert bulk.status_code == 201
    assert {i["planned_for"] for i in bulk.json()} == {tomorrow.isoformat()}

    detail = (await bob.get(bob.f(f"/shopping/lists/{lid}"))).json()
    planned = sorted((i["name"], i["planned_for"]) for i in detail["items"])
    assert planned == [
        ("Молоко", today.isoformat()),
        ("Молоко", tomorrow.isoformat()),
        ("Хлеб", tomorrow.isoformat()),
        ("Яйца", tomorrow.isoformat()),
    ]

    # Moving an item to another day and back to "no day".
    egg = next(i for i in detail["items"] if i["name"] == "Яйца")
    moved = await bob.patch(
        bob.f(f"/shopping/lists/{lid}/items/{egg['id']}"), {"planned_for": today.isoformat()}
    )
    assert moved.json()["planned_for"] == today.isoformat()
    cleared = await bob.patch(
        bob.f(f"/shopping/lists/{lid}/items/{egg['id']}"), {"planned_for": None}
    )
    assert cleared.json()["planned_for"] is None


async def test_shopping_morning_reminder(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    lid = await default_list(alice)
    day = datetime.now(TZ).date() + timedelta(days=1)
    items = alice.f(f"/shopping/lists/{lid}/items")
    await alice.post(items, {"name": "Молоко", "planned_for": day.isoformat()})
    await alice.post(items, {"name": "Хлеб", "planned_for": day.isoformat()})
    await alice.post(items, {"name": "Сыр", "planned_for": (day + timedelta(days=1)).isoformat()})
    await alice.post(items, {"name": "Без дня"})
    bought = (await alice.post(items, {"name": "Кофе", "planned_for": day.isoformat()})).json()[0]
    await alice.patch(alice.f(f"/shopping/lists/{lid}/items/{bought['id']}"), {"status": "bought"})

    assert await run(schedule_shopping_day, local(day, 8, 30)) == 0  # before the morning
    assert await run(schedule_shopping_day, local(day, 9, 5)) == 2  # one per family member
    assert await run(schedule_shopping_day, local(day, 9, 30)) == 0  # once a day
    assert await run(schedule_shopping_day, local(day + timedelta(days=1), 22)) == 0  # too late

    sent = await day_notifications(NotificationCategory.shopping_reminder)
    assert {str(n.user_id) for n in sent} == {alice.user_id, bob.user_id}
    for n in sent:
        assert n.title == "🛒 Купить сегодня"
        assert n.body == "Молоко, Хлеб"
        assert n.link == f"/home/shopping/{lid}"


async def test_tasks_morning_reminder_per_member(couple: tuple[Actor, Actor]) -> None:
    alice, bob = couple
    day = datetime.now(TZ).date() + timedelta(days=1)
    due = local(day, 20).isoformat()
    tasks = alice.f("/tasks")
    await alice.post(tasks, {"title": "Вынести мусор", "due_at": due, "assignee_id": bob.user_id})
    await alice.post(tasks, {"title": "Полить цветы", "due_at": due})
    await alice.post(tasks, {"title": "Личное", "due_at": due, "visibility": "private"})
    await alice.post(
        tasks, {"title": "Завтра", "due_at": local(day + timedelta(days=1), 20).isoformat()}
    )
    done = (await alice.post(tasks, {"title": "Уже сделано", "due_at": due})).json()
    await alice.post(alice.f(f"/tasks/{done['id']}/complete"))

    assert await run(schedule_task_day, local(day, 8, 59)) == 0
    assert await run(schedule_task_day, local(day, 9, 1)) == 2
    assert await run(schedule_task_day, local(day, 12)) == 0

    sent = {str(n.user_id): n for n in await day_notifications(NotificationCategory.task_reminder)}
    assert sent[alice.user_id].body == "Полить цветы, Личное"
    assert sent[bob.user_id].body == "Вынести мусор, Полить цветы"
    assert sent[bob.user_id].title == "📝 Задачи на сегодня"
    assert sent[bob.user_id].link == "/home/tasks"
