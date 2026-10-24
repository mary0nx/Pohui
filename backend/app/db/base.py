"""Declarative base, naming conventions and shared column mixins."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from sqlalchemy import DateTime, MetaData, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# Money is always NUMERIC(14, 2); quantities NUMERIC(12, 3).
Money = Annotated[Decimal, mapped_column(Numeric(14, 2))]
Quantity = Annotated[Decimal, mapped_column(Numeric(12, 3))]


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {
        datetime: DateTime(timezone=True),
        uuid.UUID: UUID(as_uuid=True),
    }


class UUIDPk:
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    # Python-side onupdate: the new value is known without a round trip, so the attribute
    # never gets expired (lazy loads are impossible under asyncio).
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), onupdate=lambda: datetime.now(UTC)
    )
