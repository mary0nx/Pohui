"""Users, sessions, families, membership and invitations."""

from __future__ import annotations

import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamps, UUIDPk
from app.models.enums import AuthMethod, Role, enum_type


class User(UUIDPk, Timestamps, Base):
    __tablename__ = "users"

    telegram_id: Mapped[int] = mapped_column(sa.BigInteger, unique=True)
    first_name: Mapped[str] = mapped_column(sa.String(128))
    last_name: Mapped[str | None] = mapped_column(sa.String(128))
    username: Mapped[str | None] = mapped_column(sa.String(64))
    language_code: Mapped[str | None] = mapped_column(sa.String(16))
    photo_url: Mapped[str | None] = mapped_column(sa.String(512))
    # Telegram only lets a bot message users who have started it.
    bot_started_at: Mapped[datetime | None]
    bot_blocked: Mapped[bool] = mapped_column(server_default=sa.false())
    active_family_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("families.id", ondelete="SET NULL", use_alter=True)
    )
    last_seen_at: Mapped[datetime | None]
    # Invitation the user opened through the bot (/start inv_...). Remembered on the server so
    # the app offers to join however it is opened next (menu button, bot profile, search).
    pending_invitation_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("family_invitations.id", ondelete="SET NULL", use_alter=True)
    )

    @property
    def display_name(self) -> str:
        return self.first_name if not self.last_name else f"{self.first_name} {self.last_name}"


class UserSession(UUIDPk, Base):
    __tablename__ = "user_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(sa.String(64), unique=True)
    auth_method: Mapped[AuthMethod] = mapped_column(enum_type(AuthMethod, "auth_method"))
    init_data_hash: Mapped[str | None] = mapped_column(sa.String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())
    expires_at: Mapped[datetime]
    last_used_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())
    revoked_at: Mapped[datetime | None]

    user: Mapped[User] = relationship(lazy="joined")


class Family(UUIDPk, Timestamps, Base):
    __tablename__ = "families"

    name: Mapped[str] = mapped_column(sa.String(100))
    currency: Mapped[str] = mapped_column(sa.String(3))
    timezone: Mapped[str] = mapped_column(sa.String(64))
    locale: Mapped[str] = mapped_column(sa.String(8), server_default="ru")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL")
    )
    ai_enabled: Mapped[bool] = mapped_column(server_default=sa.true())
    # When true, explicit simple AI commands (e.g. "add 45 zł for groceries") run without
    # an extra confirmation step.
    ai_auto_execute: Mapped[bool] = mapped_column(server_default=sa.true())


class FamilyMember(UUIDPk, Base):
    __tablename__ = "family_members"
    __table_args__ = (sa.UniqueConstraint("family_id", "user_id"),)

    family_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("families.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    role: Mapped[Role] = mapped_column(enum_type(Role, "member_role"))
    joined_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())

    user: Mapped[User] = relationship(lazy="joined")


class FamilyInvitation(UUIDPk, Base):
    __tablename__ = "family_invitations"
    __table_args__ = (
        sa.CheckConstraint("use_count <= max_uses", name="uses_within_limit"),
        sa.CheckConstraint("max_uses BETWEEN 1 AND 10", name="max_uses_range"),
    )

    family_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("families.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(sa.String(64), unique=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL")
    )
    role: Mapped[Role] = mapped_column(enum_type(Role, "invitation_role"))
    max_uses: Mapped[int] = mapped_column(server_default="1")
    use_count: Mapped[int] = mapped_column(server_default="0")
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())
