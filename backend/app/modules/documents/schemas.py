from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.core.schemas import ORMModel, Title
from app.models.enums import Visibility


class DocumentMeta(BaseModel):
    title: Title
    category: str | None = Field(None, max_length=32)
    notes: str | None = Field(None, max_length=1000)
    document_date: date | None = None
    expires_on: date | None = None
    remind_days_before: int | None = Field(None, ge=0, le=180)
    visibility: Visibility = Visibility.family


class DocumentPatch(BaseModel):
    title: Title | None = None
    category: str | None = Field(None, max_length=32)
    notes: str | None = Field(None, max_length=1000)
    document_date: date | None = None
    expires_on: date | None = None
    remind_days_before: int | None = Field(None, ge=0, le=180)
    archived: bool | None = None


class DocumentOut(ORMModel):
    id: uuid.UUID
    title: str
    category: str | None
    notes: str | None
    document_date: date | None
    expires_on: date | None
    remind_days_before: int | None
    original_filename: str | None
    content_type: str | None
    size_bytes: int
    has_file: bool = False
    archived_at: datetime | None
    visibility: Visibility
    created_by: uuid.UUID | None
    created_at: datetime


class DownloadLink(BaseModel):
    url: str
    expires_in: int
