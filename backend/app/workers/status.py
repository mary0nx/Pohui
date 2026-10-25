"""Liveness of the worker loop running inside this process (EMBEDDED_WORKER), for /health/ready.

The standalone worker (`python -m app.workers`) runs in its own container and keeps using the
heartbeat file; here the API process can only speak for a loop it runs itself.
"""

from __future__ import annotations

import time
from typing import Literal

WorkerState = Literal["ok", "starting", "degraded", "stale"]

STARTUP_GRACE_SECONDS = 120.0
MIN_STALE_SECONDS = 90.0

_started: float | None = None
_last_tick: float | None = None
_last_tick_ok = True


def mark_started(now: float | None = None) -> None:
    global _started, _last_tick, _last_tick_ok
    _started = time.monotonic() if now is None else now
    _last_tick = None
    _last_tick_ok = True


def mark_tick(ok: bool, now: float | None = None) -> None:
    """Called after every loop iteration; `ok` is False when a job or the dispatcher failed."""
    global _last_tick, _last_tick_ok
    _last_tick = time.monotonic() if now is None else now
    _last_tick_ok = ok


def worker_state(tick_seconds: float, now: float | None = None) -> WorkerState:
    """ok: ticking without errors; degraded: ticking, last tick had failures;
    stale: no tick for several intervals (stopped, crashed or paused on bad DB credentials);
    starting: the loop has not finished its first tick yet."""
    current = time.monotonic() if now is None else now
    if _started is None:
        return "starting"
    if _last_tick is None:
        return "starting" if current - _started < STARTUP_GRACE_SECONDS else "stale"
    if current - _last_tick > max(3 * tick_seconds, MIN_STALE_SECONDS):
        return "stale"
    return "ok" if _last_tick_ok else "degraded"


def reset() -> None:
    """Forget the state (tests)."""
    global _started, _last_tick, _last_tick_ok
    _started = _last_tick = None
    _last_tick_ok = True
