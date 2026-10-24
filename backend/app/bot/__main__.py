"""Telegram bot process: `python -m app.bot` (polling or webhook, see BOT_MODE)."""

from __future__ import annotations

import asyncio
import logging

from app.bot.runtime import configure, create_bot, create_dispatcher
from app.config import get_settings
from app.core.logging import setup_logging
from app.db.session import dispose_engine

log = logging.getLogger("bot")


async def main() -> None:
    settings = get_settings()
    setup_logging(settings.log_level)
    bot = create_bot()
    dp = create_dispatcher()
    await configure(bot)
    allowed = dp.resolve_used_update_types()
    try:
        if settings.bot_mode == "webhook":
            from aiogram.webhook.aiohttp_server import SimpleRequestHandler, setup_application
            from aiohttp import web

            secret = settings.webhook_secret()
            if not settings.telegram_webhook_url.startswith("https://"):
                raise SystemExit("Webhook mode needs an https TELEGRAM_WEBHOOK_URL")
            app = web.Application()
            SimpleRequestHandler(dispatcher=dp, bot=bot, secret_token=secret).register(
                app, path="/tg/webhook"
            )
            setup_application(app, dp, bot=bot)

            async def health(_: web.Request) -> web.Response:
                return web.json_response({"status": "ok"})

            app.router.add_get("/tg/health", health)
            await bot.set_webhook(
                settings.telegram_webhook_url,
                secret_token=secret,
                allowed_updates=allowed,
                drop_pending_updates=False,
            )
            runner = web.AppRunner(app)
            await runner.setup()
            await web.TCPSite(runner, settings.bot_webhook_host, settings.bot_webhook_port).start()
            log.info("bot webhook started")
            await asyncio.Event().wait()
        else:
            await bot.delete_webhook(drop_pending_updates=False)
            log.info("bot polling started")
            await dp.start_polling(bot, allowed_updates=allowed)
    finally:
        await bot.session.close()
        await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
