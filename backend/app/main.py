"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import api_router
from app.config import get_settings
from app.core.errors import AppError, error_body
from app.core.logging import setup_logging
from app.core.middleware import BodyLimitMiddleware, SecurityHeadersMiddleware
from app.db.health import database_problem
from app.db.session import dispose_engine

log = logging.getLogger("app")


BOT_START_DELAYS = (5.0, 15.0, 60.0)


async def _start_embedded_bot(app: FastAPI) -> None:
    """Register the webhook in the background, retrying: the API must stay up even if Telegram
    is briefly unreachable or the token is wrong. Until then /tg/webhook answers 404 and
    Telegram keeps the updates."""
    from app.bot.webhook import EmbeddedBot

    attempt = 0
    while True:
        embedded = EmbeddedBot()
        try:
            await embedded.start()
        except Exception:
            log.exception("embedded bot failed to start; the Mini App API keeps working")
            await embedded.stop()
            await asyncio.sleep(BOT_START_DELAYS[min(attempt, len(BOT_START_DELAYS) - 1)])
            attempt += 1
            continue
        app.state.embedded_bot = embedded
        return


def _log_worker_exit(task: asyncio.Task[None]) -> None:
    if not task.cancelled() and task.exception() is not None:
        log.error("embedded worker crashed", exc_info=task.exception())


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    log.info(
        "api starting",
        extra={
            "ctx": {
                "env": settings.app_env,
                "ai": settings.ai_configured,
                "telegram": settings.telegram_configured,
                "dev_auth": settings.dev_auth_active,
                "embedded_worker": settings.embedded_worker,
                "embedded_bot": settings.embedded_bot,
            }
        },
    )
    if settings.dev_auth_active:
        log.warning("DEV AUTH IS ENABLED - never use this configuration in production")
    app.state.embedded_bot = None
    bot_starter: asyncio.Task[None] | None = None
    if settings.embedded_bot and settings.telegram_configured:
        bot_starter = asyncio.create_task(_start_embedded_bot(app), name="embedded-bot-start")
    stop_worker = asyncio.Event()
    worker: asyncio.Task[None] | None = None
    if settings.embedded_worker:
        from app.workers.loop import run_loop

        worker = asyncio.create_task(run_loop(stop_worker), name="embedded-worker")
        worker.add_done_callback(_log_worker_exit)
    yield
    if worker is not None:
        stop_worker.set()
        with contextlib.suppress(Exception):  # already logged by _log_worker_exit
            await worker
    if bot_starter is not None:
        bot_starter.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await bot_starter
    if app.state.embedded_bot is not None:
        await app.state.embedded_bot.stop()
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.log_level)
    app = FastAPI(
        title="Family OS API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/api/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/api/openapi.json",
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code, content=error_body(exc.code, exc.message, exc.details)
        )

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {"loc": [str(p) for p in e.get("loc", [])], "msg": e.get("msg"), "type": e.get("type")}
            for e in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=error_body("validation_error", "Проверьте введённые данные", details),
        )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled error")
        return JSONResponse(
            status_code=500, content=error_body("internal_error", "Внутренняя ошибка сервера")
        )

    @app.get("/health", tags=["meta"])
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["meta"])
    async def ready() -> JSONResponse:
        problem = await database_problem()
        if problem is None:
            return JSONResponse({"status": "ok"})
        code, signature = problem
        body = {"status": "unavailable", "problem": code}
        if code == "database_error":
            body["error"] = signature  # unrecognised failure: class names help diagnose it
        return JSONResponse(status_code=503, content=body)

    app.include_router(api_router)
    if settings.embedded_bot:
        from app.bot.webhook import router as telegram_webhook_router

        app.include_router(telegram_webhook_router)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex or None,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
        max_age=600,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        BodyLimitMiddleware,
        default_limit=settings.max_request_body_kb * 1024,
        upload_limit=settings.max_upload_mb * 1024 * 1024 + 64 * 1024,
    )
    return app


app = create_app()
