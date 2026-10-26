"""Hourly worker job: new schedule files from the open data portal, then today's timetable
loaded into memory in the background so the first route of the day is quick."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.modules.transit import feeds, planner


async def update_schedule(db: AsyncSession, now: datetime) -> dict[str, object] | None:
    settings = get_settings()
    if not settings.transit_updates_enabled:
        return None
    result = await feeds.check_updates(db, now=now)
    await db.commit()
    if settings.embedded_worker:  # the API answers routes from this process's memory
        meta = await feeds.feed_for(db, now.astimezone(planner.ZONE).date())
        if meta is not None and not feeds.get_store().loaded(meta.id):
            await feeds.get_store().timetable(db, meta, wait=0)
    return result if result.get("added") or result.get("error") else None
