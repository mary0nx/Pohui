"""Calendar events, per-occurrence exceptions, attendees and reminders."""

from __future__ import annotations

import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk
from app.models.common import family_fk, user_fk, visibility_col
from app.models.enums import (
    EventStatus,
    Frequency,
    ReminderTarget,
    Rsvp,
    ShiftKind,
    Visibility,
    enum_type,
)


class CalendarEvent(UUIDPk, Timestamps, Base):
    __tablename__ = "calendar_events"
    __table_args__ = (
        sa.CheckConstraint("ends_at >= starts_at", name="ends_after_start"),
        sa.CheckConstraint(
            "recurrence_interval BETWEEN 1 AND 366", name="recurrence_interval_range"
        ),
        sa.Index("ix_calendar_events_family_starts", "family_id", "starts_at"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    title: Mapped[str] = mapped_column(sa.String(200))
    description: Mapped[str | None] = mapped_column(sa.Text)
    location: Mapped[str | None] = mapped_column(sa.String(300))
    category: Mapped[str | None] = mapped_column(sa.String(32))
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    all_day: Mapped[bool] = mapped_column(server_default=sa.false())
    # IANA zone the wall-clock time was entered in; recurrences are expanded in this zone
    # so DST transitions keep the local time stable.
    timezone: Mapped[str] = mapped_column(sa.String(64))
    recurrence_freq: Mapped[Frequency | None] = mapped_column(
        enum_type(Frequency, "recurrence_freq")
    )
    recurrence_interval: Mapped[int] = mapped_column(server_default="1")
    recurrence_until: Mapped[date | None]
    status: Mapped[EventStatus] = mapped_column(
        enum_type(EventStatus, "event_status"),
        server_default=EventStatus.confirmed.value,
        default=EventStatus.confirmed,
    )
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()


class EventException(UUIDPk, Base):
    """A single cancelled occurrence of a recurring event."""

    __tablename__ = "event_exceptions"
    __table_args__ = (sa.UniqueConstraint("event_id", "occurrence_start"),)

    event_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("calendar_events.id", ondelete="CASCADE")
    )
    occurrence_start: Mapped[datetime]
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())


class EventAttendee(UUIDPk, Base):
    __tablename__ = "event_attendees"
    __table_args__ = (sa.UniqueConstraint("event_id", "user_id"),)

    event_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("calendar_events.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    rsvp: Mapped[Rsvp] = mapped_column(
        enum_type(Rsvp, "rsvp"), server_default=Rsvp.pending.value, default=Rsvp.pending
    )
    responded_at: Mapped[datetime | None]


class Reminder(UUIDPk, Base):
    """Reminder definition. For events/tasks it is an offset before the target time;
    for custom reminders it is an absolute time. Delivery rows live in notifications."""

    __tablename__ = "reminders"
    __table_args__ = (
        sa.CheckConstraint(
            "(target_type = 'custom') = (remind_at IS NOT NULL)", name="custom_has_time"
        ),
        sa.CheckConstraint(
            "offset_minutes IS NULL OR offset_minutes BETWEEN 0 AND 43200", name="offset_range"
        ),
        sa.Index("ix_reminders_target", "target_type", "target_id"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    target_type: Mapped[ReminderTarget] = mapped_column(enum_type(ReminderTarget, "target_type"))
    target_id: Mapped[uuid.UUID | None]
    offset_minutes: Mapped[int | None]
    remind_at: Mapped[datetime | None]
    title: Mapped[str | None] = mapped_column(sa.String(200))
    # Recipient: the creator only, or every member allowed to see the target.
    for_all_members: Mapped[bool] = mapped_column(server_default=sa.false())
    created_by: Mapped[uuid.UUID | None] = user_fk()
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())


class WorkShift(UUIDPk, Timestamps, Base):
    """One day of a member's work schedule (day or night shift); days off have no row."""

    __tablename__ = "work_shifts"
    __table_args__ = (
        sa.UniqueConstraint("family_id", "user_id", "day"),
        sa.Index("ix_work_shifts_user_day", "user_id", "day"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date] = mapped_column(sa.Date)
    kind: Mapped[ShiftKind] = mapped_column(enum_type(ShiftKind, "shift_kind"))
