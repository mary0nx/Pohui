"""Audit log helper. Summaries must be short and non-sensitive."""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.system import AuditLog
from app.security.access import FamilyContext, is_private


def audit(
    db: AsyncSession,
    ctx: FamilyContext,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID | None,
    summary: str | None = None,
    *,
    obj: object | None = None,
    private: bool | None = None,
) -> None:
    db.add(
        AuditLog(
            family_id=ctx.family_id,
            actor_id=ctx.user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            summary=(summary[:300] if summary else None),
            is_private=private if private is not None else (is_private(obj) if obj else False),
        )
    )
