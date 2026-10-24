"""Turns reminder definitions and due dates into notification outbox rows.

Every row has a deterministic dedupe_key, so running this job any number of times (or in
parallel workers) never produces duplicate notifications.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    CalendarEvent,
    Document,
    EventAttendee,
    EventException,
    Family,
    FamilyMember,
    RecurringRule,
    Reminder,
    ScheduledPayment,
    Task,
)
from app.models.enums import (
    EventStatus,
    NotificationCategory,
    ReminderTarget,
    Rsvp,
    ScheduledPaymentStatus,
    TaskStatus,
    Visibility,
)
from app.modules.calendar.service import event_occurrences
from app.modules.notifications.service import enqueue

GRACE = timedelta(minutes=15)  # reminders older than this are dropped, not sent late
LOOKAHEAD = timedelta(hours=26)
MORNING = time(9, 0)
OVERDUE_LOOKBACK = timedelta(days=7)


def _fmt_local(dt: datetime, zone: str, all_day: bool = False) -> str:
    local = dt.astimezone(ZoneInfo(zone))
    return f"{local:%d.%m}" if all_day else f"{local:%d.%m в %H:%M}"


def _offset_text(minutes: int) -> str:
    if minutes == 0:
        return "сейчас"
    if minutes % 1440 == 0:
        days = minutes // 1440
        return f"через {days} дн."
    if minutes % 60 == 0:
        return f"через {minutes // 60} ч."
    return f"через {minutes} мин."


async def _members(db: AsyncSession, family_id: uuid.UUID) -> list[uuid.UUID]:
    return list(
        (
            await db.execute(
                select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)
            )
        ).scalars()
    )


def _recipients_for(
    obj: object, members: list[uuid.UUID], default: uuid.UUID | None
) -> list[uuid.UUID]:
    if getattr(obj, "visibility", Visibility.family) == Visibility.private:
        owner = getattr(obj, "created_by", None)
        return [owner] if owner in members else []
    return members if default is None else [default]


async def schedule_event_reminders(db: AsyncSession, now: datetime) -> int:
    created = 0
    rows = (
        await db.execute(
            select(Reminder, CalendarEvent)
            .join(CalendarEvent, CalendarEvent.id == Reminder.target_id)
            .where(
                Reminder.target_type == ReminderTarget.event,
                CalendarEvent.status == EventStatus.confirmed,
            )
        )
    ).all()
    for rem, event in rows:
        offset = timedelta(minutes=rem.offset_minutes or 0)
        occs = event_occurrences(event, now - GRACE + offset, now + LOOKAHEAD + offset)
        if not occs:
            continue
        skipped = set(
            (
                await db.execute(
                    select(EventException.occurrence_start).where(
                        EventException.event_id == event.id
                    )
                )
            ).scalars()
        )
        members = await _members(db, event.family_id)
        if rem.for_all_members and event.visibility == Visibility.family:
            declined = set(
                (
                    await db.execute(
                        select(EventAttendee.user_id).where(
                            EventAttendee.event_id == event.id, EventAttendee.rsvp == Rsvp.declined
                        )
                    )
                ).scalars()
            )
            recipients = [m for m in members if m not in declined]
        else:
            recipients = [rem.created_by] if rem.created_by in members else []
        version = int(event.updated_at.timestamp())
        for start, _ in occs:
            fire_at = start - offset
            if start in skipped or fire_at < now - GRACE or fire_at > now + LOOKAHEAD:
                continue
            for uid in recipients:
                created += await enqueue(
                    db,
                    user_id=uid,
                    family_id=event.family_id,
                    category=NotificationCategory.event_reminder,
                    title=f"📅 {event.title}",
                    body=f"{_fmt_local(start, event.timezone, event.all_day)} ({_offset_text(rem.offset_minutes or 0)})"
                    + (f"\n📍 {event.location}" if event.location else ""),
                    link=f"/calendar/{event.id}",
                    dedupe_key=f"rem:{rem.id}:{int(start.timestamp())}:{version}:{uid}",
                    scheduled_for=max(fire_at, now - GRACE),
                )
    return created


async def schedule_task_reminders(db: AsyncSession, now: datetime) -> int:
    created = 0
    rows = (
        await db.execute(
            select(Reminder, Task, Family)
            .join(Task, Task.id == Reminder.target_id)
            .join(Family, Family.id == Task.family_id)
            .where(
                Reminder.target_type == ReminderTarget.task,
                Task.status.in_([TaskStatus.todo, TaskStatus.in_progress]),
                Task.due_at.is_not(None),
            )
        )
    ).all()
    for rem, task, family in rows:
        assert task.due_at is not None
        fire_at = task.due_at - timedelta(minutes=rem.offset_minutes or 0)
        if not (now - GRACE <= fire_at <= now + LOOKAHEAD):
            continue
        members = await _members(db, task.family_id)
        target = task.assignee_id or rem.created_by
        for uid in _recipients_for(task, members, target if target in members else None):
            created += await enqueue(
                db,
                user_id=uid,
                family_id=task.family_id,
                category=NotificationCategory.task_reminder,
                title=f"✅ {task.title}",
                body=f"Срок: {_fmt_local(task.due_at, family.timezone)}",
                link=f"/home/tasks/{task.id}",
                dedupe_key=f"rem:{rem.id}:{int(task.due_at.timestamp())}:{uid}",
                scheduled_for=fire_at,
            )
    return created


async def schedule_custom_reminders(db: AsyncSession, now: datetime) -> int:
    created = 0
    rows = (
        (
            await db.execute(
                select(Reminder).where(
                    Reminder.target_type == ReminderTarget.custom,
                    Reminder.remind_at >= now - GRACE,
                    Reminder.remind_at <= now + LOOKAHEAD,
                )
            )
        )
        .scalars()
        .all()
    )
    for rem in rows:
        if rem.created_by is None or rem.remind_at is None:
            continue
        if rem.created_by not in await _members(db, rem.family_id):
            continue
        created += await enqueue(
            db,
            user_id=rem.created_by,
            family_id=rem.family_id,
            category=NotificationCategory.custom_reminder,
            title=f"⏰ {rem.title or 'Напоминание'}",
            body=None,
            link="/calendar",
            dedupe_key=f"rem:{rem.id}:{int(rem.remind_at.timestamp())}:{rem.created_by}",
            scheduled_for=rem.remind_at,
        )
    return created


async def schedule_overdue_tasks(db: AsyncSession, now: datetime) -> int:
    created = 0
    tasks = (
        (
            await db.execute(
                select(Task).where(
                    Task.status.in_([TaskStatus.todo, TaskStatus.in_progress]),
                    Task.due_at < now,
                    Task.due_at > now - OVERDUE_LOOKBACK,
                )
            )
        )
        .scalars()
        .all()
    )
    for task in tasks:
        assert task.due_at is not None
        members = await _members(db, task.family_id)
        target = task.assignee_id if task.assignee_id in members else None
        for uid in _recipients_for(task, members, target):
            created += await enqueue(
                db,
                user_id=uid,
                family_id=task.family_id,
                category=NotificationCategory.task_overdue,
                title=f"⚠️ Просрочена задача: {task.title}",
                body=None,
                link=f"/home/tasks/{task.id}",
                dedupe_key=f"task-overdue:{task.id}:{int(task.due_at.timestamp())}:{uid}",
            )
    return created


def _morning_of(day: date, zone: str) -> datetime:
    return datetime.combine(day, MORNING, tzinfo=ZoneInfo(zone))


async def schedule_payment_reminders(db: AsyncSession, now: datetime) -> int:
    created = 0
    rows = (
        await db.execute(
            select(ScheduledPayment, RecurringRule, Family)
            .join(RecurringRule, RecurringRule.id == ScheduledPayment.rule_id)
            .join(Family, Family.id == ScheduledPayment.family_id)
            .where(
                ScheduledPayment.status == ScheduledPaymentStatus.pending,
                RecurringRule.active.is_(True),
                RecurringRule.auto_create.is_(False),
                ScheduledPayment.due_date <= (now + timedelta(days=31)).date(),
                ScheduledPayment.due_date >= (now - timedelta(days=3)).date(),
            )
        )
    ).all()
    for sp, rule, family in rows:
        fire_at = _morning_of(
            sp.due_date - timedelta(days=rule.remind_days_before), family.timezone
        )
        if fire_at > now + LOOKAHEAD:
            continue
        members = await _members(db, family.id)
        for uid in _recipients_for(rule, members, None):
            created += await enqueue(
                db,
                user_id=uid,
                family_id=family.id,
                category=NotificationCategory.payment_due,
                title=f"💳 Платёж: {rule.name}",
                body=f"{sp.amount} {rule.currency} — срок {sp.due_date:%d.%m}",
                link="/finance/recurring",
                dedupe_key=f"pay-due:{sp.id}:{uid}",
                scheduled_for=max(fire_at, now - GRACE),
            )
    return created


async def schedule_document_reminders(db: AsyncSession, now: datetime) -> int:
    created = 0
    rows = (
        await db.execute(
            select(Document, Family)
            .join(Family, Family.id == Document.family_id)
            .where(
                Document.archived_at.is_(None),
                Document.expires_on.is_not(None),
                Document.remind_days_before.is_not(None),
                Document.expires_on >= (now - timedelta(days=1)).date(),
            )
        )
    ).all()
    for doc, family in rows:
        assert doc.expires_on is not None and doc.remind_days_before is not None
        fire_at = _morning_of(
            doc.expires_on - timedelta(days=doc.remind_days_before), family.timezone
        )
        if fire_at > now + LOOKAHEAD:
            continue
        members = await _members(db, family.id)
        for uid in _recipients_for(doc, members, None):
            created += await enqueue(
                db,
                user_id=uid,
                family_id=family.id,
                category=NotificationCategory.document_expiry,
                title=f"📄 Истекает срок: {doc.title}",
                body=f"Действует до {doc.expires_on:%d.%m.%Y}",
                link=f"/home/documents/{doc.id}",
                dedupe_key=f"doc-exp:{doc.id}:{doc.expires_on.isoformat()}:{uid}",
                scheduled_for=max(fire_at, now - GRACE),
            )
    return created


async def schedule_all(db: AsyncSession, now: datetime) -> dict[str, int]:
    return {
        "events": await schedule_event_reminders(db, now),
        "tasks": await schedule_task_reminders(db, now),
        "custom": await schedule_custom_reminders(db, now),
        "overdue": await schedule_overdue_tasks(db, now),
        "payments": await schedule_payment_reminders(db, now),
        "documents": await schedule_document_reminders(db, now),
    }
