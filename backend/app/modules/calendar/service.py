from __future__ import annotations

import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import NotFound, ValidationFailed
from app.core.time import utcnow
from app.models import (
    CalendarEvent,
    EventAttendee,
    EventException,
    FamilyMember,
    Notification,
    Reminder,
    User,
)
from app.models.enums import (
    EventStatus,
    NotificationStatus,
    ReminderTarget,
    Rsvp,
    Visibility,
)
from app.modules.calendar.recurrence import expand
from app.modules.calendar.schemas import (
    AttendeeOut,
    EventCreate,
    EventOut,
    EventPatch,
    OccurrenceOut,
)
from app.security.access import FamilyContext, ensure_can_delete, get_visible, visible

MAX_WINDOW_DAYS = 400


def _normalize(
    starts_at: datetime, ends_at: datetime | None, all_day: bool, zone: str
) -> tuple[datetime, datetime]:
    if all_day:
        z = ZoneInfo(zone)
        start_day = starts_at.astimezone(z).date()
        end_day = (ends_at or starts_at).astimezone(z).date()
        start = datetime.combine(start_day, time(0), tzinfo=z)
        end = datetime.combine(end_day + timedelta(days=1), time(0), tzinfo=z)
        return start.astimezone(UTC), end.astimezone(UTC)
    start = starts_at.astimezone(UTC)
    end = (ends_at or starts_at + timedelta(hours=1)).astimezone(UTC)
    return start, end


def _until_bound(event: CalendarEvent) -> datetime | None:
    if event.recurrence_until is None:
        return None
    z = ZoneInfo(event.timezone)
    return datetime.combine(
        event.recurrence_until + timedelta(days=1), time(0), tzinfo=z
    ).astimezone(UTC) - timedelta(microseconds=1)


def event_occurrences(
    event: CalendarEvent, window_start: datetime, window_end: datetime
) -> list[tuple[datetime, datetime]]:
    return list(
        expand(
            event.starts_at,
            event.ends_at,
            event.timezone,
            event.recurrence_freq,
            event.recurrence_interval,
            _until_bound(event),
            window_start,
            window_end,
        )
    )


async def _set_reminders(
    db: AsyncSession,
    ctx: FamilyContext,
    event: CalendarEvent,
    minutes: list[int],
    all_members: bool,
) -> None:
    await db.execute(
        delete(Reminder).where(
            Reminder.target_type == ReminderTarget.event,
            Reminder.target_id == event.id,
            Reminder.created_by == ctx.user_id,
        )
    )
    for m in sorted(set(minutes)):
        db.add(
            Reminder(
                family_id=ctx.family_id,
                target_type=ReminderTarget.event,
                target_id=event.id,
                offset_minutes=m,
                for_all_members=all_members and event.visibility == Visibility.family,
                created_by=ctx.user_id,
            )
        )


async def cancel_pending_reminders(db: AsyncSession, target_id: uuid.UUID) -> None:
    """Drop queued (not yet sent) reminder notifications for a target that changed."""
    reminder_ids = select(Reminder.id).where(Reminder.target_id == target_id)
    rows = (await db.execute(reminder_ids)).scalars().all()
    for rid in rows:
        await db.execute(
            update(Notification)
            .where(
                Notification.dedupe_key.like(f"rem:{rid}:%"),
                Notification.status == NotificationStatus.pending,
            )
            .values(status=NotificationStatus.skipped, last_error="target changed")
        )


async def create_event(db: AsyncSession, ctx: FamilyContext, data: EventCreate) -> CalendarEvent:
    zone = ctx.family.timezone
    start, end = _normalize(data.starts_at, data.ends_at, data.all_day, zone)
    if data.recurrence_until and data.recurrence_until < start.astimezone(ZoneInfo(zone)).date():
        raise ValidationFailed("Дата окончания повторений раньше начала события")
    event = CalendarEvent(
        family_id=ctx.family_id,
        title=data.title,
        description=data.description,
        location=data.location,
        category=data.category,
        starts_at=start,
        ends_at=end,
        all_day=data.all_day,
        timezone=zone,
        recurrence_freq=data.recurrence_freq,
        recurrence_interval=data.recurrence_interval,
        recurrence_until=data.recurrence_until,
        visibility=data.visibility,
        created_by=ctx.user_id,
    )
    db.add(event)
    await db.flush()
    if data.visibility == Visibility.family:
        member_ids = set(
            (
                await db.execute(
                    select(FamilyMember.user_id).where(FamilyMember.family_id == ctx.family_id)
                )
            ).scalars()
        )
        attendees = member_ids if data.attendee_ids is None else set(data.attendee_ids) & member_ids
        for uid in attendees:
            db.add(
                EventAttendee(
                    event_id=event.id,
                    user_id=uid,
                    rsvp=Rsvp.accepted if uid == ctx.user_id else Rsvp.pending,
                )
            )
    await _set_reminders(db, ctx, event, data.reminder_minutes, data.remind_all_members)
    audit(db, ctx, "event.create", "event", event.id, event.title, obj=event)
    await db.flush()
    return event


async def update_event(
    db: AsyncSession, ctx: FamilyContext, event_id: uuid.UUID, data: EventPatch
) -> CalendarEvent:
    event = await get_visible(db, CalendarEvent, event_id, ctx, lock=True)
    for field in ("title", "description", "location", "category", "recurrence_interval", "status"):
        value = getattr(data, field)
        if value is not None:
            setattr(event, field, value)
    if data.clear_recurrence:
        event.recurrence_freq = None
        event.recurrence_until = None
    elif data.recurrence_freq is not None:
        event.recurrence_freq = data.recurrence_freq
    if data.recurrence_until is not None:
        event.recurrence_until = data.recurrence_until
    if data.starts_at is not None or data.ends_at is not None or data.all_day is not None:
        all_day = event.all_day if data.all_day is None else data.all_day
        starts = data.starts_at or event.starts_at
        ends = data.ends_at or (starts + (event.ends_at - event.starts_at))
        if ends < starts:
            raise ValidationFailed("Окончание раньше начала")
        event.starts_at, event.ends_at = _normalize(starts, ends, all_day, event.timezone)
        event.all_day = all_day
    event.updated_at = utcnow()
    await cancel_pending_reminders(db, event.id)
    audit(db, ctx, "event.update", "event", event.id, event.title, obj=event)
    await db.flush()
    return event


async def delete_event(db: AsyncSession, ctx: FamilyContext, event_id: uuid.UUID) -> None:
    event = await get_visible(db, CalendarEvent, event_id, ctx)
    ensure_can_delete(event, ctx)
    await cancel_pending_reminders(db, event.id)
    await db.execute(
        delete(Reminder).where(
            Reminder.target_type == ReminderTarget.event, Reminder.target_id == event.id
        )
    )
    audit(db, ctx, "event.delete", "event", event.id, event.title, obj=event)
    await db.delete(event)


async def cancel_occurrence(
    db: AsyncSession, ctx: FamilyContext, event_id: uuid.UUID, occurrence_start: datetime
) -> None:
    event = await get_visible(db, CalendarEvent, event_id, ctx)
    occ = occurrence_start.astimezone(UTC)
    matches = event_occurrences(event, occ - timedelta(seconds=1), occ + timedelta(seconds=1))
    if not any(abs((s - occ).total_seconds()) < 1 for s, _ in matches):
        raise NotFound("Такого повторения нет")
    existing = await db.scalar(
        select(EventException.id).where(
            EventException.event_id == event.id, EventException.occurrence_start == occ
        )
    )
    if existing is None:
        db.add(EventException(event_id=event.id, occurrence_start=occ))
    audit(db, ctx, "event.cancel_occurrence", "event", event.id, event.title, obj=event)


async def list_occurrences(
    db: AsyncSession,
    ctx: FamilyContext,
    window_start: datetime,
    window_end: datetime,
    include_cancelled: bool = False,
) -> list[OccurrenceOut]:
    if window_end <= window_start:
        raise ValidationFailed("Неверный период")
    if window_end - window_start > timedelta(days=MAX_WINDOW_DAYS):
        raise ValidationFailed("Слишком большой период")
    stmt = select(CalendarEvent).where(
        visible(CalendarEvent, ctx),
        CalendarEvent.starts_at < window_end,
        or_(
            CalendarEvent.recurrence_freq.is_not(None),
            CalendarEvent.ends_at > window_start,
        ),
    )
    if not include_cancelled:
        stmt = stmt.where(CalendarEvent.status == EventStatus.confirmed)
    events = (await db.execute(stmt)).scalars().all()
    exceptions: dict[uuid.UUID, set[datetime]] = {}
    recurring_ids = [e.id for e in events if e.recurrence_freq]
    if recurring_ids:
        for ex in (
            await db.execute(
                select(EventException).where(EventException.event_id.in_(recurring_ids))
            )
        ).scalars():
            exceptions.setdefault(ex.event_id, set()).add(ex.occurrence_start)
    out: list[OccurrenceOut] = []
    for e in events:
        for start, end in event_occurrences(e, window_start, window_end):
            if start in exceptions.get(e.id, set()):
                continue
            out.append(
                OccurrenceOut(
                    event_id=e.id,
                    title=e.title,
                    location=e.location,
                    category=e.category,
                    start=start,
                    end=end,
                    all_day=e.all_day,
                    recurring=e.recurrence_freq is not None,
                    status=e.status,
                    visibility=e.visibility,
                    created_by=e.created_by,
                )
            )
    out.sort(key=lambda o: (o.start, o.title))
    return out


async def event_out(db: AsyncSession, ctx: FamilyContext, event: CalendarEvent) -> EventOut:
    out = EventOut.model_validate(event)
    rows = (
        await db.execute(
            select(EventAttendee, User)
            .join(User, User.id == EventAttendee.user_id)
            .where(EventAttendee.event_id == event.id)
        )
    ).all()
    out.attendees = [AttendeeOut(user_id=u.id, name=u.first_name, rsvp=a.rsvp) for a, u in rows]
    offsets = (
        await db.execute(
            select(Reminder.offset_minutes).where(
                Reminder.target_type == ReminderTarget.event,
                Reminder.target_id == event.id,
                Reminder.created_by == ctx.user_id,
            )
        )
    ).scalars()
    out.my_reminders = sorted(m for m in offsets if m is not None)
    return out


async def set_rsvp(
    db: AsyncSession, ctx: FamilyContext, event_id: uuid.UUID, rsvp: Rsvp
) -> CalendarEvent:
    event = await get_visible(db, CalendarEvent, event_id, ctx)
    att = await db.scalar(
        select(EventAttendee).where(
            EventAttendee.event_id == event.id, EventAttendee.user_id == ctx.user_id
        )
    )
    if att is None:
        att = EventAttendee(event_id=event.id, user_id=ctx.user_id)
        db.add(att)
    att.rsvp = rsvp
    att.responded_at = utcnow()
    await db.flush()
    return event


async def set_my_reminders(
    db: AsyncSession, ctx: FamilyContext, event_id: uuid.UUID, minutes: list[int], all_members: bool
) -> CalendarEvent:
    if any(m < 0 or m > 43200 for m in minutes):
        raise ValidationFailed("Напоминание от 0 минут до 30 дней")
    event = await get_visible(db, CalendarEvent, event_id, ctx)
    await cancel_pending_reminders(db, event.id)
    await _set_reminders(db, ctx, event, minutes, all_members)
    event.updated_at = utcnow()  # new version -> reminders are re-queued with fresh keys
    await db.flush()
    return event


async def create_custom_reminder(
    db: AsyncSession, ctx: FamilyContext, title: str, remind_at: datetime
) -> Reminder:
    if remind_at < utcnow() - timedelta(minutes=1):
        raise ValidationFailed("Время напоминания уже прошло")
    rem = Reminder(
        family_id=ctx.family_id,
        target_type=ReminderTarget.custom,
        title=title,
        remind_at=remind_at.astimezone(UTC),
        created_by=ctx.user_id,
    )
    db.add(rem)
    await db.flush()
    return rem


async def list_custom_reminders(db: AsyncSession, ctx: FamilyContext) -> list[Reminder]:
    return list(
        (
            await db.execute(
                select(Reminder)
                .where(
                    Reminder.family_id == ctx.family_id,
                    Reminder.created_by == ctx.user_id,
                    Reminder.target_type == ReminderTarget.custom,
                    Reminder.remind_at >= utcnow() - timedelta(days=1),
                )
                .order_by(Reminder.remind_at)
            )
        ).scalars()
    )


async def delete_custom_reminder(
    db: AsyncSession, ctx: FamilyContext, reminder_id: uuid.UUID
) -> None:
    rem = await db.scalar(
        select(Reminder).where(
            Reminder.id == reminder_id,
            Reminder.family_id == ctx.family_id,
            Reminder.created_by == ctx.user_id,
        )
    )
    if rem is None:
        raise NotFound()
    await db.execute(
        update(Notification)
        .where(
            Notification.dedupe_key.like(f"rem:{rem.id}:%"),
            Notification.status == NotificationStatus.pending,
        )
        .values(status=NotificationStatus.skipped, last_error="reminder deleted")
    )
    await db.delete(rem)
