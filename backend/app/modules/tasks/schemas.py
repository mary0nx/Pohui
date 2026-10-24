from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.core.schemas import LongText, ORMModel, Title
from app.models.enums import Frequency, Priority, TaskStatus, Visibility


def _aware(v: datetime | None) -> datetime | None:
    if v is not None and v.tzinfo is None:
        raise ValueError("Время должно содержать часовой пояс")
    return v


class TaskCreate(BaseModel):
    title: Title
    description: LongText | None = None
    assignee_id: uuid.UUID | None = None
    due_at: datetime | None = None
    priority: Priority = Priority.normal
    category: str | None = Field(None, max_length=32)
    points: int | None = Field(None, ge=0, le=100)
    recurrence_freq: Frequency | None = None
    recurrence_interval: int = Field(1, ge=1, le=366)
    visibility: Visibility = Visibility.family
    reminder_minutes: int | None = Field(None, ge=0, le=43200)

    _check = field_validator("due_at")(_aware)


class TaskPatch(BaseModel):
    title: Title | None = None
    description: LongText | None = None
    assignee_id: uuid.UUID | None = None
    unassign: bool = False
    due_at: datetime | None = None
    clear_due: bool = False
    priority: Priority | None = None
    category: str | None = Field(None, max_length=32)
    points: int | None = Field(None, ge=0, le=100)
    recurrence_freq: Frequency | None = None
    clear_recurrence: bool = False
    recurrence_interval: int | None = Field(None, ge=1, le=366)
    status: TaskStatus | None = None

    _check = field_validator("due_at")(_aware)


class TaskOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None
    assignee_id: uuid.UUID | None
    due_at: datetime | None
    priority: Priority
    category: str | None
    status: TaskStatus
    points: int | None
    recurrence_freq: Frequency | None
    recurrence_interval: int
    completed_at: datetime | None
    completed_by: uuid.UUID | None
    visibility: Visibility
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    overdue: bool = False
    comments_count: int = 0


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(ORMModel):
    id: uuid.UUID
    body: str
    created_by: uuid.UUID | None
    created_at: datetime
    author_name: str | None = None


class TaskStats(BaseModel):
    """Joint progress only — deliberately no per-person leaderboard."""

    done_this_week: int
    points_this_week: int
    done_this_month: int
    points_this_month: int
    open_total: int
    overdue_total: int
