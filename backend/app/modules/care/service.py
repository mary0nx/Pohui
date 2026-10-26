"""Settings, schedule and sending of «Забота на каждый день».

The message is put into the existing notification outbox (notifications table), so the
existing worker delivers it to Telegram and the member's home-screen app with its retries.
Idempotency: one message per member and local date (dedupe key + last_sent_on).
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CareSettings, User
from app.models.enums import NotificationCategory
from app.modules.care.messages import CareMessage, CareProfile, compose
from app.modules.care.weather import WROCLAW, Place, WeatherUnavailable, day_weather
from app.modules.notifications.service import enqueue

log = logging.getLogger(__name__)

DEFAULT_SEND = time(6, 0)
DEFAULT_LEAVE = time(8, 0)
# A message is sent from its time until 3 hours later (the worker may have been restarting);
# turning the feature on in the afternoon does not send this morning's message.
SEND_WINDOW = timedelta(hours=3)
# If the forecast is unavailable, keep trying this long before sending without weather.
WEATHER_GRACE = timedelta(minutes=20)
LINK = "/profile/care"


def defaults(user: User) -> CareSettings:
    return CareSettings(
        user_id=user.id,
        enabled=False,
        recipient_name=None,
        gender="f",
        city=WROCLAW.name,
        country="Польша",
        latitude=WROCLAW.latitude,
        longitude=WROCLAW.longitude,
        timezone=WROCLAW.timezone,
        send_time=DEFAULT_SEND,
        leave_time=DEFAULT_LEAVE,
        weekdays=127,
        tone="tender",
        weather_tips=True,
        signature=None,
    )


async def load(db: AsyncSession, user: User) -> CareSettings | None:
    return await db.get(CareSettings, user.id)


def place_of(s: CareSettings) -> Place:
    return Place(s.city, s.latitude, s.longitude, s.timezone)


def profile_of(s: CareSettings, user: User) -> CareProfile:
    return CareProfile(
        key=str(user.id),
        name=(s.recipient_name or user.first_name or "").strip() or "друг",
        gender=s.gender,
        tone=s.tone,
        weather_tips=s.weather_tips,
        signature=s.signature,
        leave=s.leave_time,
    )


def local_now(s: CareSettings, now: datetime) -> datetime:
    return now.astimezone(ZoneInfo(s.timezone))


def due_date(s: CareSettings, now: datetime) -> date | None:
    """The local date whose message is due now, or None.

    Wall-clock comparison in the member's zone: on the spring change a 02:30 that does not
    exist is sent at 03:00, on the autumn change the repeated hour does not send twice
    (last_sent_on).
    """
    if not s.enabled or not s.weekdays:
        return None
    local = local_now(s, now)
    today = local.date()
    if not (s.weekdays >> today.weekday()) & 1 or s.last_sent_on == today:
        return None
    start = datetime.combine(today, s.send_time)
    wall = local.replace(tzinfo=None)
    if not (start <= wall < start + SEND_WINDOW):
        return None
    return today


async def build(s: CareSettings, user: User, day: date) -> tuple[CareMessage, bool]:
    """(message, weather_ok). Without a forecast the message makes no weather claims."""
    try:
        weather = await day_weather(place_of(s), day, s.leave_time)
    except WeatherUnavailable:
        weather = None
    return compose(profile_of(s, user), day, weather), weather is not None


async def queue(db: AsyncSession, user_id: uuid.UUID, msg: CareMessage, dedupe_key: str) -> bool:
    return await enqueue(
        db,
        user_id=user_id,
        family_id=None,
        category=NotificationCategory.morning_care,
        title=msg.title,
        body=msg.body,
        dedupe_key=dedupe_key,
        link=LINK,
    )


async def send_due(db: AsyncSession, now: datetime) -> int:
    """Worker job: queue every member's message that is due now. Returns how many were queued."""
    rows = (
        await db.execute(
            select(CareSettings, User)
            .join(User, User.id == CareSettings.user_id)
            .where(CareSettings.enabled.is_(True))
        )
    ).all()
    queued = 0
    for s, user in rows:
        day = due_date(s, now)
        if day is None:
            continue
        msg, weather_ok = await build(s, user, day)
        if not weather_ok:
            started = datetime.combine(day, s.send_time)
            if local_now(s, now).replace(tzinfo=None) < started + WEATHER_GRACE:
                continue  # try again on the next tick
            log.warning("morning care sent without weather", extra={"ctx": {"city": s.city}})
        if await queue(db, user.id, msg, f"care:{user.id}:{day.isoformat()}"):
            queued += 1
        s.last_sent_on = day
    return queued
