"""Documents, notifications, AI conversations/proposals/memory, audit log, idempotency."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk
from app.models.common import family_fk, user_fk, visibility_col
from app.models.enums import (
    AiRole,
    Channel,
    NotificationCategory,
    NotificationStatus,
    ProposalStatus,
    Visibility,
    enum_type,
)


class Document(UUIDPk, Timestamps, Base):
    __tablename__ = "documents"
    __table_args__ = (sa.CheckConstraint("size_bytes >= 0", name="size_non_negative"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    title: Mapped[str] = mapped_column(sa.String(200))
    category: Mapped[str | None] = mapped_column(sa.String(32))
    notes: Mapped[str | None] = mapped_column(sa.String(1000))
    document_date: Mapped[date | None]
    expires_on: Mapped[date | None]
    remind_days_before: Mapped[int | None]
    storage_key: Mapped[str | None] = mapped_column(sa.String(200), unique=True)
    original_filename: Mapped[str | None] = mapped_column(sa.String(200))
    content_type: Mapped[str | None] = mapped_column(sa.String(100))
    size_bytes: Mapped[int] = mapped_column(sa.BigInteger, server_default="0")
    sha256: Mapped[str | None] = mapped_column(sa.String(64))
    archived_at: Mapped[datetime | None]
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()


class Notification(UUIDPk, Base):
    """Outbox row: one delivery attempt series for one recipient."""

    __tablename__ = "notifications"
    __table_args__ = (
        sa.Index("ix_notifications_dispatch", "status", "scheduled_for"),
        sa.Index("ix_notifications_user_created", "user_id", "created_at"),
    )

    family_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("families.id", ondelete="CASCADE")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    category: Mapped[NotificationCategory] = mapped_column(
        enum_type(NotificationCategory, "notification_category")
    )
    title: Mapped[str] = mapped_column(sa.String(200))
    body: Mapped[str | None] = mapped_column(sa.String(1000))
    link: Mapped[str | None] = mapped_column(sa.String(200))
    dedupe_key: Mapped[str] = mapped_column(sa.String(200), unique=True)
    status: Mapped[NotificationStatus] = mapped_column(
        enum_type(NotificationStatus, "notification_status"),
        server_default=NotificationStatus.pending.value,
        default=NotificationStatus.pending,
    )
    scheduled_for: Mapped[datetime]
    attempts: Mapped[int] = mapped_column(server_default="0", default=0)
    locked_until: Mapped[datetime | None]
    sent_at: Mapped[datetime | None]
    telegram_message_id: Mapped[int | None] = mapped_column(sa.BigInteger)
    last_error: Mapped[str | None] = mapped_column(sa.String(300))
    read_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())


class NotificationPreference(UUIDPk, Base):
    __tablename__ = "notification_preferences"
    __table_args__ = (sa.UniqueConstraint("user_id", "category"),)

    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    category: Mapped[NotificationCategory] = mapped_column(
        enum_type(NotificationCategory, "notification_category")
    )
    enabled: Mapped[bool]


class NotificationSettings(Base):
    __tablename__ = "notification_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    quiet_start: Mapped[time | None]
    quiet_end: Mapped[time | None]
    timezone: Mapped[str | None] = mapped_column(sa.String(64))
    telegram_enabled: Mapped[bool] = mapped_column(server_default=sa.true(), default=True)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=sa.func.now(), onupdate=lambda: datetime.now(UTC)
    )


class AiConversation(UUIDPk, Timestamps, Base):
    __tablename__ = "ai_conversations"
    __table_args__ = (sa.Index("ix_ai_conversations_user", "family_id", "user_id", "updated_at"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    channel: Mapped[Channel] = mapped_column(enum_type(Channel, "channel"))
    title: Mapped[str | None] = mapped_column(sa.String(200))
    # Rolling summary of messages that fell out of the context window.
    summary: Mapped[str | None] = mapped_column(sa.Text)
    summarized_until: Mapped[datetime | None]


class AiMessage(UUIDPk, Base):
    __tablename__ = "ai_messages"
    __table_args__ = (sa.Index("ix_ai_messages_conversation", "conversation_id", "created_at"),)

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("ai_conversations.id", ondelete="CASCADE")
    )
    role: Mapped[AiRole] = mapped_column(enum_type(AiRole, "ai_role"))
    content: Mapped[str | None] = mapped_column(sa.Text)
    tool_calls: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    tool_call_id: Mapped[str | None] = mapped_column(sa.String(100))
    tool_name: Mapped[str | None] = mapped_column(sa.String(64))
    input_tokens: Mapped[int | None]
    output_tokens: Mapped[int | None]
    # Python-side default: PostgreSQL now() is the transaction start, identical for every
    # message written in one request, which would break ordering.
    created_at: Mapped[datetime] = mapped_column(
        server_default=sa.func.now(), default=lambda: datetime.now(UTC)
    )


class AiActionProposal(UUIDPk, Base):
    __tablename__ = "ai_action_proposals"

    family_id: Mapped[uuid.UUID] = family_fk()
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("ai_conversations.id", ondelete="SET NULL")
    )
    tool_name: Mapped[str] = mapped_column(sa.String(64))
    arguments: Mapped[dict[str, Any]] = mapped_column(JSONB)
    preview: Mapped[dict[str, Any]] = mapped_column(JSONB)
    # Snapshot of the target object's updated_at, to detect stale proposals.
    target_version: Mapped[str | None] = mapped_column(sa.String(64))
    status: Mapped[ProposalStatus] = mapped_column(
        enum_type(ProposalStatus, "proposal_status"),
        server_default=ProposalStatus.pending.value,
        default=ProposalStatus.pending,
    )
    result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    expires_at: Mapped[datetime]
    resolved_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())


class AiMemory(UUIDPk, Timestamps, Base):
    """Long-term preference. visibility=private memories are only used for their owner."""

    __tablename__ = "ai_memories"

    family_id: Mapped[uuid.UUID] = family_fk()
    content: Mapped[str] = mapped_column(sa.String(500))
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()


class AiUsageDaily(UUIDPk, Base):
    __tablename__ = "ai_usage_daily"
    __table_args__ = (sa.UniqueConstraint("user_id", "family_id", "day"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date]
    requests: Mapped[int] = mapped_column(server_default="0")
    input_tokens: Mapped[int] = mapped_column(server_default="0")
    output_tokens: Mapped[int] = mapped_column(server_default="0")


class AuditLog(UUIDPk, Base):
    __tablename__ = "audit_log"
    __table_args__ = (
        sa.Index("ix_audit_log_family_created", "family_id", "created_at"),
        sa.Index("ix_audit_log_entity", "entity_type", "entity_id"),
    )

    family_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("families.id", ondelete="CASCADE")
    )
    actor_id: Mapped[uuid.UUID | None] = user_fk()
    action: Mapped[str] = mapped_column(sa.String(64))
    entity_type: Mapped[str] = mapped_column(sa.String(32))
    entity_id: Mapped[uuid.UUID | None]
    # Short, non-sensitive human-readable summary (e.g. item name), never note bodies.
    summary: Mapped[str | None] = mapped_column(sa.String(300))
    is_private: Mapped[bool] = mapped_column(server_default=sa.false(), default=False)
    created_at: Mapped[datetime] = mapped_column(
        server_default=sa.func.now(), default=lambda: datetime.now(UTC)
    )


class IdempotencyKey(UUIDPk, Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (sa.UniqueConstraint("user_id", "key"),)

    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(sa.String(100))
    request_hash: Mapped[str] = mapped_column(sa.String(64))
    status_code: Mapped[int | None]
    response_body: Mapped[Any | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())


class IntegrationToken(UUIDPk, Timestamps, Base):
    """Personal key of an external sender, e.g. an iPhone Shortcuts automation that reports
    Apple Pay transactions. Only the SHA-256 of the key is stored; it is shown once."""

    __tablename__ = "integration_tokens"
    __table_args__ = (sa.UniqueConstraint("family_id", "user_id", "kind"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(sa.String(32))
    token_hash: Mapped[str] = mapped_column(sa.String(64), unique=True)
    token_prefix: Mapped[str] = mapped_column(sa.String(16))
    # Where new expenses go; None = the member's first usable account.
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("accounts.id", ondelete="SET NULL")
    )
    last_used_at: Mapped[datetime | None]
