from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.schemas import Name, ORMModel, QuantityValue
from app.models.enums import ItemStatus


class ListCreate(BaseModel):
    name: Name


class ListPatch(BaseModel):
    name: Name | None = None
    archived: bool | None = None


class ListOut(ORMModel):
    id: uuid.UUID
    name: str
    archived_at: datetime | None
    created_by: uuid.UUID | None
    created_at: datetime
    updated_at: datetime
    items_needed: int = 0
    items_total: int = 0


class ItemCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: QuantityValue | None = None
    unit: str | None = Field(None, max_length=16)
    category: str | None = Field(None, max_length=32)
    note: str | None = Field(None, max_length=300)
    estimated_price: Decimal | None = Field(None, ge=0, max_digits=14, decimal_places=2)
    store: str | None = Field(None, max_length=100)
    planned_for: date | None = None


class ItemPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    quantity: QuantityValue | None = None
    unit: str | None = Field(None, max_length=16)
    category: str | None = Field(None, max_length=32)
    note: str | None = Field(None, max_length=300)
    estimated_price: Decimal | None = Field(None, ge=0, max_digits=14, decimal_places=2)
    store: str | None = Field(None, max_length=100)
    status: ItemStatus | None = None
    planned_for: date | None = None


class ItemOut(ORMModel):
    id: uuid.UUID
    list_id: uuid.UUID
    name: str
    quantity: Decimal | None
    unit: str | None
    category: str | None
    note: str | None
    estimated_price: Decimal | None
    store: str | None
    status: ItemStatus
    added_by: uuid.UUID | None
    bought_by: uuid.UUID | None
    bought_at: datetime | None
    position: int
    planned_for: date | None
    updated_at: datetime


class BulkText(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    planned_for: date | None = None


class ListDetail(ListOut):
    items: list[ItemOut] = []
    estimated_total: Decimal = Decimal("0")


class HistoryOut(BaseModel):
    action: str
    summary: str | None
    actor_name: str | None
    created_at: datetime
