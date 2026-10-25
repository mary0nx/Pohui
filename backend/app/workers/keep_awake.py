"""Keep a free Render instance awake.

Render stops a free web service after ~15 minutes without inbound requests, and with
EMBEDDED_WORKER the reminders loop stops with it. External schedulers are not punctual
(GitHub runs "every 10 minutes" schedules every 30+ minutes), so the service calls its own
public URL; the request goes through Render's router and counts as inbound traffic.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging

import httpx

log = logging.getLogger("keep_awake")


async def keep_awake(
    url: str, interval_seconds: float, stop: asyncio.Event, client: httpx.AsyncClient | None = None
) -> None:
    """GET `url` every `interval_seconds` until `stop` is set; failures are only logged."""
    own_client = client is None
    http = client or httpx.AsyncClient(timeout=30.0)
    log.info("keep-awake started", extra={"ctx": {"every_seconds": interval_seconds}})
    try:
        while not stop.is_set():
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=interval_seconds)
            if stop.is_set():
                break
            try:
                r = await http.get(url)
                if r.status_code >= 500:
                    log.warning("keep-awake ping failed", extra={"ctx": {"status": r.status_code}})
            except httpx.HTTPError as exc:
                log.warning("keep-awake ping failed", extra={"ctx": {"error": type(exc).__name__}})
    finally:
        if own_client:
            await http.aclose()
