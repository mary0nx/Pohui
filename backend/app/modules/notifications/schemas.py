from __future__ import annotations

import uuid
from datetime import datetime, time

from pydantic import BaseModel, Field

from app.core.schemas import ORMModel, TimeZoneName
from app.models.enums import NotificationCategory, NotificationStatus


class NotificationOut(ORMModel):
    id: uuid.UUID
    family_id: uuid.UUID | None
    category: NotificationCategory
    title: str
    body: str | None
    link: str | None
    status: NotificationStatus
    scheduled_for: datetime
    sent_at: datetime | None
    read_at: datetime | None
    created_at: datetime


class Inbox(BaseModel):
    items: list[NotificationOut]
    unread: int


class NotificationSettingsIn(BaseModel):
    quiet_start: time | None = None
    quiet_end: time | None = None
    timezone: TimeZoneName | None = None
    telegram_enabled: bool = True
    categories: dict[NotificationCategory, bool] = Field(default_factory=dict)


class NotificationSettingsOut(NotificationSettingsIn):
    bot_started: bool
    bot_blocked: bool
