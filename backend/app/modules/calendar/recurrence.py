"""Expansion of recurring events into concrete occurrences (DST-safe)."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.core.time import step_local
from app.models.enums import Frequency

MAX_ITERATIONS = 5000


def expand(
    starts_at: datetime,
    ends_at: datetime,
    zone: str,
    freq: Frequency | None,
    interval: int,
    until: datetime | None,
    window_start: datetime,
    window_end: datetime,
) -> Iterator[tuple[datetime, datetime]]:
    """Yield (start, end) UTC pairs of occurrences overlapping [window_start, window_end).

    Recurrence keeps the local wall-clock time in `zone`, so a 10:00 event stays at 10:00
    across daylight-saving transitions. `until` is an inclusive UTC bound on occurrence start.
    """
    duration = ends_at - starts_at
    if freq is None:
        if starts_at < window_end and ends_at > window_start:
            yield starts_at, ends_at
        return
    local_start = starts_at.astimezone(ZoneInfo(zone))
    n = 0
    if freq in (Frequency.daily, Frequency.weekly):
        period = timedelta(days=interval * (7 if freq == Frequency.weekly else 1))
        skip = int((window_start - duration - starts_at) / period) - 1
        n = max(skip, 0)
    for _ in range(MAX_ITERATIONS):
        occ_local = step_local(local_start, freq, interval, n)
        occ_start = occ_local.astimezone(UTC)
        n += 1
        if occ_start >= window_end or (until is not None and occ_start > until):
            return
        occ_end = occ_start + duration
        if occ_end > window_start or (duration == timedelta(0) and occ_start >= window_start):
            yield occ_start, occ_end
