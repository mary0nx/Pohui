"""Unified notification service. Rows in `notifications` form a durable outbox that the
worker delivers to Telegram; the same rows power the in-app inbox.

Privacy: notifications about a private record are never addressed to anyone but its
author; `notify_family` enforces this for every caller.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import ColumnElement, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models import FamilyMember, Notification
from app.models.enums import NotificationCategory, NotificationStatus
from app.security.access import FamilyContext, is_private


async def enqueue(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    family_id: uuid.UUID | None,
    category: NotificationCategory,
    title: str,
    body: str | None,
    dedupe_key: str,
    link: str | None = None,
    scheduled_for: datetime | None = None,
) -> bool:
    """Insert a notification unless one with the same dedupe_key exists. Returns True if new."""
    result = await db.execute(
        insert(Notification)
        .values(
            id=uuid.uuid4(),
            family_id=family_id,
            user_id=user_id,
            category=category,
            title=title[:200],
            body=body[:1000] if body else None,
            link=link,
            dedupe_key=dedupe_key[:200],
            status=NotificationStatus.pending,
            scheduled_for=scheduled_for or utcnow(),
            attempts=0,
        )
        .on_conflict_do_nothing(index_elements=["dedupe_key"])
    )
    return bool(result.rowcount)  # type: ignore[attr-defined]


async def notify_family(
    db: AsyncSession,
    ctx: FamilyContext,
    *,
    category: NotificationCategory,
    title: str,
    body: str | None,
    dedupe_base: str,
    link: str | None = None,
    obj: object | None = None,
    recipients: list[uuid.UUID] | None = None,
    include_actor: bool = False,
) -> int:
    """Notify family members (by default everyone except the actor)."""
    if obj is not None and is_private(obj):
        return 0  # never tell anyone else about a private record
    member_ids = list(
        (
            await db.execute(
                select(FamilyMember.user_id).where(FamilyMember.family_id == ctx.family_id)
            )
        ).scalars()
    )
    targets = [
        uid
        for uid in member_ids
        if (recipients is None or uid in recipients) and (include_actor or uid != ctx.user_id)
    ]
    count = 0
    for uid in targets:
        if await enqueue(
            db,
            user_id=uid,
            family_id=ctx.family_id,
            category=category,
            title=title,
            body=body,
            link=link,
            dedupe_key=f"{dedupe_base}:{uid}",
        ):
            count += 1
    return count


# Skipped rows stay visible in the inbox only when Telegram delivery was impossible, not when
# the user muted the category.
DELIVERY_SKIPS = ["bot not started", "bot blocked", "telegram disabled by user"]


def inbox_condition(user_id: uuid.UUID) -> ColumnElement[bool]:
    """Notifications a user sees in the in-app inbox: due (or already sent) and not muted."""
    return (
        (Notification.user_id == user_id)
        & (
            (Notification.scheduled_for <= utcnow())
            | (Notification.status == NotificationStatus.sent)
        )
        & (
            (Notification.status != NotificationStatus.skipped)
            | Notification.last_error.in_(DELIVERY_SKIPS)
        )
    )
