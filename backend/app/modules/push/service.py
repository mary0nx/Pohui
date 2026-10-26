"""Delivery of notifications to the user's installed apps (Web Push)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.integrations.webpush import Outcome, get_push_sender
from app.models import Notification, PushSubscription, UserSession


async def live_subscriptions(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID | None = None
) -> list[PushSubscription]:
    """Subscriptions whose session is still signed in; the rest are removed on the way."""
    now = utcnow()
    stmt = (
        select(PushSubscription, UserSession)
        .join(UserSession, UserSession.id == PushSubscription.session_id)
        .where(PushSubscription.user_id == user_id)
    )
    if session_id is not None:
        stmt = stmt.where(PushSubscription.session_id == session_id)
    live: list[PushSubscription] = []
    dead: list[uuid.UUID] = []
    for sub, session in (await db.execute(stmt)).all():
        if session.revoked_at is None and session.expires_at > now and session.user_id == user_id:
            live.append(sub)
        else:
            dead.append(sub.id)
    if dead:
        await db.execute(delete(PushSubscription).where(PushSubscription.id.in_(dead)))
    return live


async def has_subscriptions(db: AsyncSession, user_id: uuid.UUID) -> bool:
    return bool(await live_subscriptions(db, user_id))


async def push_to(
    subs: list[PushSubscription], db: AsyncSession, payload: dict[str, Any]
) -> list[Outcome]:
    sender = get_push_sender()
    outcomes: list[Outcome] = []
    for sub in subs:
        outcome = await sender.send(sub.endpoint, sub.p256dh, sub.auth, payload)
        outcomes.append(outcome)
        if outcome == "ok":
            sub.last_success_at = utcnow()
        elif outcome == "gone":
            await db.delete(sub)
    return outcomes


async def unread_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    from app.modules.notifications.service import inbox_condition

    return int(
        await db.scalar(
            select(func.count())
            .select_from(Notification)
            .where(inbox_condition(user_id), Notification.read_at.is_(None))
        )
        or 0
    )


def notification_payload(n: Notification, unread: int) -> dict[str, Any]:
    return {
        "title": n.title,
        "body": n.body or "",
        # In-app path only: the service worker opens it on the app's own origin.
        "url": n.link if n.link and n.link.startswith("/") else "/inbox",
        "tag": str(n.id),
        "badge": unread,
    }
