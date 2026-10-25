"""Worker loop shared by `python -m app.workers` and the API's embedded mode."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from pathlib import Path

from app.config import get_settings
from app.db.health import classify_database_error
from app.db.session import get_sessionmaker
from app.integrations.telegram import AiogramSender, TelegramSender
from app.workers.dispatch import dispatch_due
from app.workers.jobs import run_job
from app.workers.status import mark_started, mark_tick

log = logging.getLogger("worker")
HEARTBEAT = Path("/tmp/familyos-worker-heartbeat")  # noqa: S108 - container-local liveness file
SLOW_JOBS = {"materialize": 3600.0, "cleanup": 3600.0}
# Rejected credentials: hosted poolers (Supabase) temporarily block a user after repeated failed
# logins, so retrying every tick would keep the block alive even after the password is fixed.
CREDENTIAL_PROBLEMS = {
    "database_password_wrong",
    "database_user_wrong",
    "database_temporarily_blocked",
}
CREDENTIAL_BACKOFF_SECONDS = 300.0


def _rejected_credentials(exc: BaseException) -> bool:
    return classify_database_error(exc) in CREDENTIAL_PROBLEMS


async def run_loop(stop: asyncio.Event) -> None:
    """Run scheduled jobs and the notification dispatcher until `stop` is set.

    Used by the standalone worker process and, with EMBEDDED_WORKER, inside the API process.
    Jobs take PostgreSQL advisory locks and the dispatcher claims rows with SKIP LOCKED, so an
    accidental second loop does not double-send.
    """
    settings = get_settings()
    sm = get_sessionmaker()
    sender: TelegramSender | None = AiogramSender() if settings.telegram_configured else None
    if sender is None:
        log.warning("TELEGRAM_BOT_TOKEN not set: notifications stay in the in-app inbox only")
    last_run: dict[str, float] = {}
    log.info("worker started", extra={"ctx": {"tick": settings.worker_tick_seconds}})
    mark_started()
    try:
        while not stop.is_set():
            started = time.monotonic()
            rejected = False
            failed = False
            for job in ("materialize", "auto_pay", "reminders", "cleanup"):
                interval = SLOW_JOBS.get(job, 0.0)
                if interval and started - last_run.get(job, -interval) < interval:
                    continue
                try:
                    result = await run_job(sm, job)
                    last_run[job] = started
                    if result:
                        log.info("job done", extra={"ctx": {"job": job, "result": result}})
                except Exception as exc:
                    if _rejected_credentials(exc):
                        rejected = True
                        break
                    failed = True
                    log.exception("job failed", extra={"ctx": {"job": job}})
            if not rejected:
                try:
                    stats = await dispatch_due(sm, sender, settings.default_timezone)
                    if stats.sent or stats.failed or stats.retried:
                        log.info("dispatch", extra={"ctx": stats.__dict__})
                except Exception as exc:
                    rejected = _rejected_credentials(exc)
                    if not rejected:
                        failed = True
                        log.exception("dispatch failed")
            HEARTBEAT.touch()  # noqa: ASYNC240 - tiny local file, once per tick
            mark_tick(ok=not (failed or rejected))
            pause = settings.worker_tick_seconds
            if rejected:
                pause = CREDENTIAL_BACKOFF_SECONDS
                log.error(
                    "database rejected the credentials; worker pauses",
                    extra={"ctx": {"seconds": pause}},
                )
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(stop.wait(), timeout=pause)
    finally:
        if isinstance(sender, AiogramSender):
            await sender.close()
        log.info("worker stopped")
