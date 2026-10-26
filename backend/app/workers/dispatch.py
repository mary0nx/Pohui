"""Notification dispatcher: durable outbox in PostgreSQL -> installed apps (Web Push) + Telegram.

State machine: pending -> sending (lease) -> sent | failed | skipped, or back to pending
with a later scheduled_for on temporary errors. A crashed worker leaves rows in `sending`
with an expired lease; they are picked up again (at-least-once delivery, nothing is lost).
The push to the user's home-screen apps goes out once (push_sent_at); a notification counts as
sent when either the push or the Telegram message was delivered.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.time import utcnow
from app.integrations.telegram import (
    TelegramPermanentError,
    TelegramRateLimited,
    TelegramSender,
    TelegramTemporaryError,
    format_notification,
)
from app.models import (
    FamilyMember,
    Notification,
    NotificationPreference,
    NotificationSettings,
    User,
)
from app.models.enums import NotificationCategory, NotificationStatus
from app.modules.push.service import (
    live_subscriptions,
    notification_payload,
    push_to,
    unread_count,
)

log = logging.getLogger(__name__)

LEASE = timedelta(minutes=2)
MAX_ATTEMPTS = 6
BASE_BACKOFF = 30  # seconds; doubles each attempt
# Categories that are opt-in (disabled unless the user enables them).
OPT_IN = {NotificationCategory.shopping_update}


@dataclass
class DispatchStats:
    sent: int = 0
    failed: int = 0
    skipped: int = 0
    retried: int = 0
    postponed: int = 0
    errors: list[str] = field(default_factory=list)


def in_quiet_hours(
    now: datetime, settings: NotificationSettings | None, default_tz: str
) -> datetime | None:
    """If `now` is inside the user's quiet hours, return when they end (UTC)."""
    if settings is None or settings.quiet_start is None or settings.quiet_end is None:
        return None
    zone = ZoneInfo(settings.timezone or default_tz)
    local = now.astimezone(zone)
    start, end = settings.quiet_start, settings.quiet_end
    t = local.time()
    if start == end:
        return None
    inside = (start <= t < end) if start < end else (t >= start or t < end)
    if not inside:
        return None
    end_date = local.date() if t < end else local.date() + timedelta(days=1)
    return datetime.combine(end_date, end, tzinfo=zone).astimezone(ZoneInfo("UTC"))


async def category_enabled(
    db: AsyncSession, user_id: object, category: NotificationCategory
) -> bool:
    pref = await db.scalar(
        select(NotificationPreference.enabled).where(
            NotificationPreference.user_id == user_id, NotificationPreference.category == category
        )
    )
    if pref is None:
        return category not in OPT_IN
    return bool(pref)


async def _claim(sm: async_sessionmaker[AsyncSession], now: datetime, batch: int) -> list[str]:
    async with sm() as db:
        rows = (
            (
                await db.execute(
                    select(Notification)
                    .where(
                        Notification.scheduled_for <= now,
                        or_(
                            Notification.status == NotificationStatus.pending,
                            and_(
                                Notification.status == NotificationStatus.sending,
                                Notification.locked_until < now,
                            ),
                        ),
                    )
                    .order_by(Notification.scheduled_for)
                    .limit(batch)
                    .with_for_update(skip_locked=True)
                )
            )
            .scalars()
            .all()
        )
        for n in rows:
            n.status = NotificationStatus.sending
            n.locked_until = now + LEASE
            n.attempts += 1
        await db.commit()
        return [str(n.id) for n in rows]


async def _process_one(
    db: AsyncSession,
    n: Notification,
    sender: TelegramSender | None,
    now: datetime,
    default_tz: str,
    stats: DispatchStats,
) -> None:
    def finish(status: NotificationStatus, error: str | None = None) -> None:
        n.status = status
        n.locked_until = None
        n.last_error = error[:300] if error else None

    user = await db.get(User, n.user_id)
    if user is None:
        finish(NotificationStatus.skipped, "user missing")
        stats.skipped += 1
        return
    if n.family_id is not None:
        member = await db.scalar(
            select(FamilyMember.id).where(
                FamilyMember.family_id == n.family_id, FamilyMember.user_id == user.id
            )
        )
        if member is None:
            finish(NotificationStatus.skipped, "not a family member anymore")
            stats.skipped += 1
            return
    if not await category_enabled(db, user.id, n.category):
        finish(NotificationStatus.skipped, "category disabled")
        stats.skipped += 1
        return
    settings = await db.get(NotificationSettings, user.id)
    telegram_on = settings is None or settings.telegram_enabled
    subs = await live_subscriptions(db, user.id) if n.push_sent_at is None else []
    if not telegram_on and not subs and n.push_sent_at is None:
        finish(NotificationStatus.skipped, "telegram disabled by user")
        stats.skipped += 1
        return
    # The morning message goes at the time its recipient chose, even inside quiet hours.
    quiet_end = (
        None
        if n.category == NotificationCategory.morning_care
        else in_quiet_hours(now, settings, default_tz)
    )
    if quiet_end is not None:
        n.scheduled_for = quiet_end
        n.attempts = max(n.attempts - 1, 0)
        finish(NotificationStatus.pending)
        stats.postponed += 1
        return
    push_retry = False
    if subs:
        outcomes = await push_to(subs, db, notification_payload(n, await unread_count(db, user.id)))
        if "ok" in outcomes:
            n.push_sent_at = utcnow()
        push_retry = "retry" in outcomes
    pushed = n.push_sent_at is not None

    def delivered_by_push(reason: str) -> None:
        """Telegram is not used for this notification: the push alone decides the outcome."""
        if pushed:
            n.sent_at = n.sent_at or n.push_sent_at
            finish(NotificationStatus.sent)
            stats.sent += 1
        elif push_retry and n.attempts < MAX_ATTEMPTS:
            n.scheduled_for = now + timedelta(seconds=BASE_BACKOFF * 2 ** (n.attempts - 1))
            finish(NotificationStatus.pending, "push temporarily unavailable")
            stats.retried += 1
        else:
            finish(NotificationStatus.skipped, reason)
            stats.skipped += 1

    if not telegram_on:
        delivered_by_push("telegram disabled by user")
        return
    if user.bot_started_at is None or user.bot_blocked:
        # Telegram only allows messages to users who started the bot; the in-app inbox
        # still shows the notification.
        delivered_by_push("bot not started" if not user.bot_blocked else "bot blocked")
        return
    if sender is None:
        if pushed:
            delivered_by_push("telegram not configured")
            return
        finish(NotificationStatus.pending, "telegram not configured")
        n.scheduled_for = now + timedelta(minutes=10)
        n.attempts = max(n.attempts - 1, 0)
        stats.postponed += 1
        return
    try:
        message_id = await sender.send(
            user.telegram_id,
            format_notification(n.title, n.body),
            "Открыть" if n.link else None,
            n.link,
        )
    except TelegramRateLimited as exc:
        n.scheduled_for = now + timedelta(seconds=exc.retry_after + 1)
        finish(NotificationStatus.pending, str(exc))
        stats.retried += 1
    except TelegramPermanentError as exc:
        if exc.blocked:
            user.bot_blocked = True
        if pushed:
            delivered_by_push(str(exc))
        else:
            finish(NotificationStatus.failed, str(exc))
            stats.failed += 1
    except (TelegramTemporaryError, OSError) as exc:
        if pushed and n.attempts >= MAX_ATTEMPTS:
            delivered_by_push(str(exc))
        elif n.attempts >= MAX_ATTEMPTS:
            finish(NotificationStatus.failed, f"gave up: {exc}")
            stats.failed += 1
        else:
            n.scheduled_for = now + timedelta(seconds=BASE_BACKOFF * 2 ** (n.attempts - 1))
            finish(NotificationStatus.pending, str(exc))
            stats.retried += 1
    else:
        n.telegram_message_id = message_id
        n.sent_at = utcnow()
        finish(NotificationStatus.sent)
        stats.sent += 1


async def dispatch_due(
    sm: async_sessionmaker[AsyncSession],
    sender: TelegramSender | None,
    default_tz: str,
    now: datetime | None = None,
    batch: int = 50,
) -> DispatchStats:
    now = now or utcnow()
    stats = DispatchStats()
    for nid in await _claim(sm, now, batch):
        async with sm() as db:
            n = await db.get(Notification, nid, with_for_update=True)
            if n is None or n.status != NotificationStatus.sending:
                continue
            try:
                await _process_one(db, n, sender, now, default_tz, stats)
                await db.commit()
            except Exception as exc:  # one bad row must not stop the batch
                await db.rollback()
                log.exception("notification dispatch failed")
                stats.errors.append(type(exc).__name__)
    return stats
