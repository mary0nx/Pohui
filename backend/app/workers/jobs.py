"""Periodic jobs. Each job runs inside a transaction guarded by a PostgreSQL advisory lock,
so several worker processes never run the same job concurrently."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.time import local_today, utcnow
from app.models import (
    AiActionProposal,
    Family,
    IdempotencyKey,
    LoginRequest,
    Notification,
    RecurringRule,
    UserSession,
)
from app.models.enums import NotificationStatus, ProposalStatus
from app.modules.finance.recurring import auto_create_due, materialize_rule
from app.workers.reminders import schedule_all

log = logging.getLogger(__name__)

LOCKS = {
    "materialize": 727274101,
    "auto_pay": 727274102,
    "reminders": 727274103,
    "cleanup": 727274104,
    "care": 727274105,
}


async def _locked(db: AsyncSession, name: str) -> bool:
    return bool(await db.scalar(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCKS[name]}))


async def materialize_all(db: AsyncSession) -> int:
    rows = (
        await db.execute(
            select(RecurringRule, Family.timezone)
            .join(Family, Family.id == RecurringRule.family_id)
            .where(RecurringRule.active.is_(True))
        )
    ).all()
    total = 0
    for rule, zone in rows:
        total += await materialize_rule(db, rule, local_today(zone))
    return total


async def cleanup(db: AsyncSession, now: datetime) -> dict[str, int]:
    res = {}
    r = await db.execute(
        delete(UserSession).where(UserSession.expires_at < now - timedelta(days=7))
    )
    res["sessions"] = r.rowcount or 0  # type: ignore[attr-defined]
    r = await db.execute(
        delete(IdempotencyKey).where(IdempotencyKey.created_at < now - timedelta(hours=48))
    )
    res["idempotency"] = r.rowcount or 0  # type: ignore[attr-defined]
    r = await db.execute(
        update(AiActionProposal)
        .where(AiActionProposal.status == ProposalStatus.pending, AiActionProposal.expires_at < now)
        .values(status=ProposalStatus.expired, resolved_at=now)
    )
    res["proposals"] = r.rowcount or 0  # type: ignore[attr-defined]
    r = await db.execute(
        delete(Notification).where(
            Notification.created_at < now - timedelta(days=90),
            Notification.status.in_(
                [NotificationStatus.sent, NotificationStatus.skipped, NotificationStatus.failed]
            ),
        )
    )
    res["notifications"] = r.rowcount or 0  # type: ignore[attr-defined]
    r = await db.execute(
        delete(LoginRequest).where(LoginRequest.expires_at < now - timedelta(days=1))
    )
    res["login_requests"] = r.rowcount or 0  # type: ignore[attr-defined]
    return res


async def run_job(
    sm: async_sessionmaker[AsyncSession], name: str, now: datetime | None = None
) -> object:
    now = now or utcnow()
    async with sm() as db:
        if not await _locked(db, name):
            return None
        if name == "materialize":
            result: object = await materialize_all(db)
        elif name == "auto_pay":
            result = await auto_create_due(db)
        elif name == "reminders":
            result = await schedule_all(db, now)
        elif name == "cleanup":
            result = await cleanup(db, now)
        elif name == "care":
            from app.modules.care.service import send_due

            result = await send_due(db, now)
        else:
            raise ValueError(name)
        await db.commit()
        return result
