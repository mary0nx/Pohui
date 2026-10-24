from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.schemas import LongText, ORMModel, Title
from app.models.enums import LifeItemKind, LifeItemStatus, Visibility


class LifeItemCreate(BaseModel):
    kind: LifeItemKind
    title: Title
    body: LongText | None = None
    status: LifeItemStatus = LifeItemStatus.open
    happened_on: date | None = None
    planned_for: date | None = None
    price: Decimal | None = Field(None, ge=0, max_digits=14, decimal_places=2)
    url: str | None = Field(None, max_length=500, pattern=r"^https?://")
    visibility: Visibility | None = None  # default depends on kind


class LifeItemPatch(BaseModel):
    title: Title | None = None
    body: LongText | None = None
    status: LifeItemStatus | None = None
    happened_on: date | None = None
    planned_for: date | None = None
    price: Decimal | None = Field(None, ge=0, max_digits=14, decimal_places=2)
    url: str | None = Field(None, max_length=500, pattern=r"^https?://")


class LifeItemOut(ORMModel):
    id: uuid.UUID
    kind: LifeItemKind
    title: str
    body: str | None
    status: LifeItemStatus
    happened_on: date | None
    planned_for: date | None
    price: Decimal | None
    url: str | None
    done_at: datetime | None
    visibility: Visibility
    created_by: uuid.UUID | None
    created_at: datetime


class HabitCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    target_per_week: int = Field(3, ge=1, le=7)
    visibility: Visibility = Visibility.family


class HabitOut(ORMModel):
    id: uuid.UUID
    title: str
    target_per_week: int
    visibility: Visibility
    created_by: uuid.UUID | None
    week_count: int = 0
    week_days: list[date] = []
    checked_today_by_me: bool = False


class CheckinIn(BaseModel):
    day: date | None = None
