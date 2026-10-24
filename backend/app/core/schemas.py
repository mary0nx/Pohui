"""Shared DTO building blocks."""

from __future__ import annotations

import re
from decimal import Decimal
from typing import Annotated, Generic, TypeVar
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


def _currency(v: str) -> str:
    v = v.upper()
    if not re.fullmatch(r"[A-Z]{3}", v):
        raise ValueError("Код валюты ISO 4217, например PLN")
    return v


def _timezone(v: str) -> str:
    try:
        ZoneInfo(v)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("Неизвестный часовой пояс") from exc
    return v


Currency = Annotated[str, AfterValidator(_currency)]
TimeZoneName = Annotated[str, AfterValidator(_timezone)]
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
LongText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=10_000)]
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
MoneyValue = Annotated[Decimal, Field(max_digits=14, decimal_places=2)]
QuantityValue = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=3)]


class PageParams(BaseModel):
    limit: int = Field(50, ge=1, le=200)
    offset: int = Field(0, ge=0)
