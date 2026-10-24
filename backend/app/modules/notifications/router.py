from __future__ import annotations

import uuid

from fastapi import APIRouter
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import DB, CurrentUser
from app.core.errors import NotFound
from app.core.time import utcnow
from app.models import Notification, NotificationPreference, NotificationSettings
from app.models.enums import NotificationCategory, NotificationStatus
from app.modules.notifications.schemas import (
    Inbox,
    NotificationOut,
    NotificationSettingsIn,
    NotificationSettingsOut,
)
from app.workers.dispatch import OPT_IN

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=Inbox)
async def inbox(user: CurrentUser, db: DB, limit: int = 50) -> Inbox:
    # Due notifications for this user. Skipped rows are shown only when they were skipped
    # for delivery reasons (Telegram not available), not when the user muted the category.
    delivery_skips = ["bot not started", "bot blocked", "telegram disabled by user"]
    visible_now = (
        (Notification.user_id == user.id)
        & ((Notification.scheduled_for <= utcnow()) | (Notification.status == NotificationStatus.sent))
        & (
            (Notification.status != NotificationStatus.skipped)
            | Notification.last_error.in_(delivery_skips)
        )
    )
    items = (
        await db.execute(
            select(Notification).where(visible_now).order_by(Notification.scheduled_for.desc()).limit(min(limit, 100))
        )
    ).scalars().all()
    unread = await db.scalar(select(func.count()).select_from(Notification).where(visible_now, Notification.read_at.is_(None)))
    return Inbox(items=[NotificationOut.model_validate(n) for n in items], unread=unread or 0)


@router.post("/{notification_id}/read", status_code=204)
async def mark_read(notification_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    n = await db.scalar(select(Notification).where(Notification.id == notification_id, Notification.user_id == user.id))
    if n is None:
        raise NotFound()
    n.read_at = n.read_at or utcnow()
    await db.commit()


@router.post("/read-all", status_code=204)
async def mark_all_read(user: CurrentUser, db: DB) -> None:
    await db.execute(
        update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=utcnow())
    )
    await db.commit()


async def _settings_out(db: DB, user: CurrentUser) -> NotificationSettingsOut:
    s = await db.get(NotificationSettings, user.id)
    prefs = {
        p.category: p.enabled
        for p in (await db.execute(select(NotificationPreference).where(NotificationPreference.user_id == user.id))).scalars()
    }
    categories = {c: prefs.get(c, c not in OPT_IN) for c in NotificationCategory}
    return NotificationSettingsOut(
        quiet_start=s.quiet_start if s else None,
        quiet_end=s.quiet_end if s else None,
        timezone=s.timezone if s else None,
        telegram_enabled=s.telegram_enabled if s else True,
        categories=categories,
        bot_started=user.bot_started_at is not None,
        bot_blocked=user.bot_blocked,
    )


@router.get("/settings", response_model=NotificationSettingsOut)
async def get_settings_(user: CurrentUser, db: DB) -> NotificationSettingsOut:
    return await _settings_out(db, user)


@router.put("/settings", response_model=NotificationSettingsOut)
async def put_settings(body: NotificationSettingsIn, user: CurrentUser, db: DB) -> NotificationSettingsOut:
    values = {
        "quiet_start": body.quiet_start,
        "quiet_end": body.quiet_end,
        "timezone": body.timezone,
        "telegram_enabled": body.telegram_enabled,
    }
    await db.execute(
        insert(NotificationSettings)
        .values(user_id=user.id, **values)
        .on_conflict_do_update(index_elements=["user_id"], set_={**values, "updated_at": utcnow()})
    )
    for category, enabled in body.categories.items():
        await db.execute(
            insert(NotificationPreference)
            .values(id=uuid.uuid4(), user_id=user.id, category=category, enabled=enabled)
            .on_conflict_do_update(index_elements=["user_id", "category"], set_={"enabled": enabled})
        )
    await db.commit()
    return await _settings_out(db, user)
