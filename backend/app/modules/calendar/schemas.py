from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.core.schemas import LongText, ORMModel, Title
from app.models.enums import EventStatus, Frequency, Rsvp, Visibility


def _aware(v: datetime | None) -> datetime | None:
    if v is not None and v.tzinfo is None:
        raise ValueError("Время должно содержать часовой пояс")
    return v


class EventCreate(BaseModel):
    title: Title
    description: LongText | None = None
    location: str | None = Field(None, max_length=300)
    category: str | None = Field(None, max_length=32)
    starts_at: datetime
    ends_at: datetime | None = None
    all_day: bool = False
    recurrence_freq: Frequency | None = None
    recurrence_interval: int = Field(1, ge=1, le=366)
    recurrence_until: date | None = None
    visibility: Visibility = Visibility.family
    reminder_minutes: list[int] = Field(default_factory=list, max_length=5)
    remind_all_members: bool = True
    attendee_ids: list[uuid.UUID] | None = None

    _check_start = field_validator("starts_at", "ends_at")(_aware)

    @field_validator("reminder_minutes")
    @classmethod
    def _reminders(cls, v: list[int]) -> list[int]:
        if any(m < 0 or m > 43200 for m in v):
            raise ValueError("Напоминание от 0 минут до 30 дней")
        return sorted(set(v))

    @model_validator(mode="after")
    def _order(self) -> EventCreate:
        if self.ends_at is not None and self.ends_at < self.starts_at:
            raise ValueError("Окончание раньше начала")
        return self


class EventPatch(BaseModel):
    title: Title | None = None
    description: LongText | None = None
    location: str | None = Field(None, max_length=300)
    category: str | None = Field(None, max_length=32)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    all_day: bool | None = None
    recurrence_freq: Frequency | None = None
    clear_recurrence: bool = False
    recurrence_interval: int | None = Field(None, ge=1, le=366)
    recurrence_until: date | None = None
    status: EventStatus | None = None

    _check = field_validator("starts_at", "ends_at")(_aware)


class AttendeeOut(BaseModel):
    user_id: uuid.UUID
    name: str
    rsvp: Rsvp


class EventOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None
    location: str | None
    category: str | None
    starts_at: datetime
    ends_at: datetime
    all_day: bool
    timezone: str
    recurrence_freq: Frequency | None
    recurrence_interval: int
    recurrence_until: date | None
    status: EventStatus
    visibility: Visibility
    created_by: uuid.UUID | None
    attendees: list[AttendeeOut] = []
    my_reminders: list[int] = []


class OccurrenceOut(BaseModel):
    event_id: uuid.UUID
    title: str
    location: str | None
    category: str | None
    start: datetime
    end: datetime
    all_day: bool
    recurring: bool
    status: EventStatus
    visibility: Visibility
    created_by: uuid.UUID | None


class RsvpIn(BaseModel):
    rsvp: Rsvp


class OccurrenceCancel(BaseModel):
    occurrence_start: datetime

    _check = field_validator("occurrence_start")(_aware)


class RemindersIn(BaseModel):
    minutes: list[int] = Field(default_factory=list, max_length=5)
    all_members: bool = False


class CustomReminderIn(BaseModel):
    title: Title
    remind_at: datetime

    _check = field_validator("remind_at")(_aware)


class CustomReminderOut(ORMModel):
    id: uuid.UUID
    title: str | None
    remind_at: datetime | None
    created_at: datetime
