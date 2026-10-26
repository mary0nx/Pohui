"""«Забота на каждый день»: the member's own morning message (/me/care, never someone else's)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.config import get_settings
from app.core.errors import ServiceUnavailable, ValidationFailed
from app.core.rate_limit import get_rate_limiter
from app.core.time import utcnow
from app.models import CareSettings, PushSubscription, User, UserSession
from app.modules.care import service
from app.modules.care.messages import COND_SHORT, EMOJI, deg, tips_line, weather_line
from app.modules.care.weather import WROCLAW, DayWeather, WeatherUnavailable, geocode

router = APIRouter(prefix="/me/care", tags=["care"])

Tone = Literal["tender", "romantic", "friendly", "short"]
DEFAULT_CITIES = {"вроцлав", "wrocław", "wroclaw", "breslau"}


class CareIn(BaseModel):
    enabled: bool
    recipient_name: str | None = Field(None, max_length=40)
    gender: Literal["f", "m"] = "f"
    city: str = Field(WROCLAW.name, min_length=1, max_length=100)
    timezone: str = WROCLAW.timezone
    send_time: time = service.DEFAULT_SEND
    leave_time: time = service.DEFAULT_LEAVE
    # 0 = Monday … 6 = Sunday
    days: list[int] = Field(default_factory=lambda: list(range(7)), max_length=7)
    tone: Tone = "tender"
    weather_tips: bool = True
    signature: str | None = Field(None, max_length=40)

    @field_validator("days")
    @classmethod
    def _days(cls, v: list[int]) -> list[int]:
        if any(d < 0 or d > 6 for d in v):
            raise ValueError("дни недели: 0–6")
        return sorted(set(v))

    @field_validator("timezone")
    @classmethod
    def _tz(cls, v: str) -> str:
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("неизвестный часовой пояс") from exc
        return v

    @field_validator("recipient_name", "signature", "city")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        return v.strip() or None if v is not None else None


class TelegramStatus(BaseModel):
    bot_started: bool
    bot_blocked: bool
    bot_link: str | None


class CareOut(BaseModel):
    enabled: bool
    configured: bool
    recipient_name: str | None
    default_name: str
    gender: str
    city: str
    country: str | None
    timezone: str
    send_time: time
    leave_time: time
    days: list[int]
    tone: str
    weather_tips: bool
    signature: str | None
    next_send_at: datetime | None
    telegram: TelegramStatus
    push_devices: int


class WeatherOut(BaseModel):
    emoji: str
    condition: str
    leave_temp: str
    temp_max: str
    temp_min: str
    line: str
    tips: str
    source: str


class PreviewOut(BaseModel):
    day: date
    title: str
    body: str
    weather: WeatherOut | None


class TestOut(BaseModel):
    queued: bool
    telegram_ready: bool
    push_devices: int


def next_send_at(s: CareSettings, now: datetime) -> datetime | None:
    if not s.enabled or not s.weekdays:
        return None
    zone = ZoneInfo(s.timezone)
    local = now.astimezone(zone)
    for offset in range(8):
        day = local.date() + timedelta(days=offset)
        if not (s.weekdays >> day.weekday()) & 1 or s.last_sent_on == day:
            continue
        at = datetime.combine(day, s.send_time, tzinfo=zone)
        if offset == 0 and local >= at + service.SEND_WINDOW:
            continue
        return max(at, local) if offset == 0 and local >= at else at
    return None


async def _push_devices(db: DB, user: User) -> int:
    now = utcnow()
    return int(
        await db.scalar(
            select(func.count())
            .select_from(PushSubscription)
            .join(UserSession, UserSession.id == PushSubscription.session_id)
            .where(
                PushSubscription.user_id == user.id,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
        )
        or 0
    )


async def _out(db: DB, user: User, s: CareSettings | None) -> CareOut:
    row = s or service.defaults(user)
    bot = get_settings().telegram_bot_username.strip().lstrip("@")
    return CareOut(
        enabled=row.enabled,
        configured=s is not None,
        recipient_name=row.recipient_name,
        default_name=user.first_name,
        gender=row.gender,
        city=row.city,
        country=row.country,
        timezone=row.timezone,
        send_time=row.send_time,
        leave_time=row.leave_time,
        days=[d for d in range(7) if (row.weekdays >> d) & 1],
        tone=row.tone,
        weather_tips=row.weather_tips,
        signature=row.signature,
        next_send_at=next_send_at(row, utcnow()),
        telegram=TelegramStatus(
            bot_started=user.bot_started_at is not None,
            bot_blocked=user.bot_blocked,
            bot_link=f"https://t.me/{bot}" if bot else None,
        ),
        push_devices=await _push_devices(db, user),
    )


@router.get("", response_model=CareOut)
async def get_care(user: CurrentUser, db: DB) -> CareOut:
    return await _out(db, user, await service.load(db, user))


@router.put("", response_model=CareOut)
async def put_care(body: CareIn, user: CurrentUser, db: DB) -> CareOut:
    s = await service.load(db, user)
    if s is None:
        s = service.defaults(user)
        db.add(s)
    city = body.city or WROCLAW.name
    if city.casefold() != s.city.casefold():
        if city.casefold() in DEFAULT_CITIES:
            place, country = WROCLAW, "Польша"
        else:
            await get_rate_limiter().hit(f"care-geocode:{user.id}", 20)
            try:
                found = await geocode(city)
            except (WeatherUnavailable, httpx.HTTPError, KeyError, ValueError) as exc:
                raise ServiceUnavailable("Не удалось проверить город, попробуйте позже") from exc
            if found is None:
                raise ValidationFailed(
                    "Не нашли такой город. Напишите, например: Вроцлав или Warszawa"
                )
            place, country = found, None
        s.city, s.latitude, s.longitude, s.country = (
            place.name,
            place.latitude,
            place.longitude,
            country,
        )
        timezone = place.timezone
    else:
        timezone = body.timezone
    s.enabled = body.enabled
    s.recipient_name = body.recipient_name
    s.gender = body.gender
    s.timezone = timezone
    s.send_time = body.send_time.replace(second=0, microsecond=0, tzinfo=None)
    s.leave_time = body.leave_time.replace(second=0, microsecond=0, tzinfo=None)
    s.weekdays = sum(1 << d for d in body.days)
    s.tone = body.tone
    s.weather_tips = body.weather_tips
    s.signature = body.signature
    await db.commit()
    return await _out(db, user, s)


def _weather_out(w: DayWeather | None, leave: time) -> WeatherOut | None:
    if w is None:
        return None
    return WeatherOut(
        emoji=EMOJI[w.condition],
        condition=COND_SHORT[w.condition],
        leave_temp=deg(w.leave_temp),
        temp_max=deg(w.temp_max),
        temp_min=deg(w.temp_min),
        line=weather_line(w, leave),
        tips=tips_line(w),
        source=w.source,
    )


@router.get("/preview", response_model=PreviewOut)
async def preview(user: CurrentUser, db: DB) -> PreviewOut:
    """Today's message as it would be sent now (forecast cached for 30 minutes)."""
    await get_rate_limiter().hit(f"care-preview:{user.id}", 30)
    s = await service.load(db, user) or service.defaults(user)
    day = service.local_now(s, utcnow()).date()
    msg, _ = await service.build(s, user, day)
    return PreviewOut(
        day=day, title=msg.title, body=msg.body, weather=_weather_out(msg.weather, s.leave_time)
    )


@router.post("/test", response_model=TestOut)
async def send_test(user: CurrentUser, db: DB) -> TestOut:
    """Sends today's message right now through the usual delivery (Telegram, phone)."""
    await get_rate_limiter().hit(f"care-test:{user.id}", 5, 600)
    s = await service.load(db, user) or service.defaults(user)
    day = service.local_now(s, utcnow()).date()
    msg, _ = await service.build(s, user, day)
    queued = await service.queue(db, user.id, msg, f"care-test:{user.id}:{uuid.uuid4()}")
    await db.commit()
    return TestOut(
        queued=queued,
        telegram_ready=user.bot_started_at is not None and not user.bot_blocked,
        push_devices=await _push_devices(db, user),
    )
