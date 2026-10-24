"""Telegram updates delivered to the API process (EMBEDDED_BOT=true).

Lets a single web service run the bot without a second process or port: Telegram POSTs updates
to /tg/webhook, each one is checked against the webhook secret and handled in the background so
Telegram gets its 200 immediately (AI replies can take longer than its webhook timeout).
"""

from __future__ import annotations

import asyncio
import hmac
import logging
from typing import Any

from fastapi import APIRouter, Request, Response
from fastapi.responses import JSONResponse

from app.bot.runtime import configure, create_bot, create_dispatcher
from app.config import get_settings
from app.core.errors import error_body

log = logging.getLogger("bot")
SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"  # noqa: S105 - header name, not a secret

router = APIRouter()


class EmbeddedBot:
    def __init__(self) -> None:
        self.bot = create_bot()
        self.dp = create_dispatcher()
        self._tasks: set[asyncio.Task[Any]] = set()

    async def start(self) -> None:
        settings = get_settings()
        await configure(self.bot)
        await self.bot.set_webhook(
            settings.telegram_webhook_url,
            secret_token=settings.webhook_secret(),
            allowed_updates=self.dp.resolve_used_update_types(),
            drop_pending_updates=False,
        )
        log.info("bot webhook registered", extra={"ctx": {"url": settings.telegram_webhook_url}})

    def feed(self, update: dict[str, Any]) -> None:
        task = asyncio.create_task(self.dp.feed_raw_update(self.bot, update))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def stop(self) -> None:
        if self._tasks:
            await asyncio.wait(self._tasks, timeout=10)
        # The webhook stays registered: Telegram keeps updates until the service is back.
        await self.bot.session.close()


@router.post("/tg/webhook", include_in_schema=False)
async def telegram_webhook(request: Request) -> Response:
    embedded: EmbeddedBot | None = getattr(request.app.state, "embedded_bot", None)
    if embedded is None:
        return JSONResponse(status_code=404, content=error_body("not_found", "Not found"))
    received = request.headers.get(SECRET_HEADER, "")
    if not hmac.compare_digest(received.encode(), get_settings().webhook_secret().encode()):
        return JSONResponse(status_code=401, content=error_body("unauthorized", "Bad secret"))
    try:
        update = await request.json()
    except ValueError:
        return JSONResponse(status_code=400, content=error_body("bad_request", "Invalid JSON"))
    if not isinstance(update, dict):
        return JSONResponse(status_code=400, content=error_body("bad_request", "Invalid update"))
    embedded.feed(update)
    return Response(status_code=200)
