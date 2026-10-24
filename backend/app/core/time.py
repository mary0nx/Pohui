"""Time helpers. Instants are stored in UTC; wall-clock math happens in the family zone."""

from __future__ import annotations

import calendar
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.models.enums import Frequency


def utcnow() -> datetime:
    return datetime.now(UTC)


def tz(name: str) -> ZoneInfo:
    return ZoneInfo(name)


def local_today(zone: str) -> date:
    return datetime.now(ZoneInfo(zone)).date()


def month_start(d: date) -> date:
    return d.replace(day=1)


def add_months(d: date, months: int) -> date:
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def next_month(d: date) -> date:
    return add_months(month_start(d), 1)


def local_day_bounds(day: date, zone: str) -> tuple[datetime, datetime]:
    """UTC instants of [day 00:00, next day 00:00) in the given zone (DST-aware)."""
    z = ZoneInfo(zone)
    start = datetime(day.year, day.month, day.day, tzinfo=z)
    nxt = day + timedelta(days=1)
    end = datetime(nxt.year, nxt.month, nxt.day, tzinfo=z)
    return start.astimezone(UTC), end.astimezone(UTC)


def local_range_bounds(start: date, end_exclusive: date, zone: str) -> tuple[datetime, datetime]:
    return local_day_bounds(start, zone)[0], local_day_bounds(end_exclusive, zone)[0]


def step_date(d: date, freq: Frequency, interval: int, n: int, anchor_day: int | None = None) -> date:
    """n-th occurrence date starting at d. Monthly/yearly keep the anchor day, clamped to
    month length (31st -> 30th/28th)."""
    if freq == Frequency.daily:
        return d + timedelta(days=interval * n)
    if freq == Frequency.weekly:
        return d + timedelta(weeks=interval * n)
    months = interval * n * (12 if freq == Frequency.yearly else 1)
    y, m = divmod(d.month - 1 + months, 12)
    year, month = d.year + y, m + 1
    day = anchor_day or d.day
    return date(year, month, min(day, calendar.monthrange(year, month)[1]))


def step_local(dt_local: datetime, freq: Frequency, interval: int, n: int) -> datetime:
    """Advance a zone-aware local datetime keeping the wall-clock time (DST-safe)."""
    new_date = step_date(dt_local.date(), freq, interval, n)
    naive = datetime.combine(new_date, dt_local.timetz().replace(tzinfo=None))
    return naive.replace(tzinfo=dt_local.tzinfo)
