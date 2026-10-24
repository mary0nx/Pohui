"""Column helpers shared by family-scoped models."""

from __future__ import annotations

import uuid

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.models.enums import Visibility, enum_type


def family_fk() -> Mapped[uuid.UUID]:
    return mapped_column(sa.ForeignKey("families.id", ondelete="CASCADE"), index=True)


def user_fk(nullable: bool = True) -> Mapped[uuid.UUID | None]:
    return mapped_column(sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=nullable)


def visibility_col(default: Visibility = Visibility.family) -> Mapped[Visibility]:
    return mapped_column(
        enum_type(Visibility, "visibility"), server_default=default.value, default=default
    )
