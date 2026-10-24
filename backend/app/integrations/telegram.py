"""Telegram Bot API sender with error classification for the notification dispatcher."""

from __future__ import annotations

import html
from typing import Protocol

from app.config import get_settings


class TelegramError(Exception):
    pass


class TelegramPermanentError(TelegramError):
    """Delivery will never succeed (bot blocked, chat not found, bad request)."""

    def __init__(self, message: str, *, blocked: bool = False) -> None:
        super().__init__(message)
        self.blocked = blocked


class TelegramTemporaryError(TelegramError):
    """Network/server problem: retry later."""


class TelegramRateLimited(TelegramError):
    def __init__(self, retry_after: float) -> None:
        super().__init__(f"retry after {retry_after}s")
        self.retry_after = retry_after


class TelegramSender(Protocol):
    async def send(self, chat_id: int, text: str, button_text: str | None, button_path: str | None) -> int: ...


def format_notification(title: str, body: str | None) -> str:
    text = f"<b>{html.escape(title)}</b>"
    if body:
        text += f"\n{html.escape(body)}"
    return text


class AiogramSender:
    def __init__(self) -> None:
        from aiogram import Bot
        from aiogram.client.default import DefaultBotProperties
        from aiogram.enums import ParseMode

        settings = get_settings()
        token = settings.telegram_bot_token.get_secret_value()
        if not token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")
        self.bot = Bot(token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
        self.frontend_url = settings.frontend_url.rstrip("/")

    async def send(self, chat_id: int, text: str, button_text: str | None, button_path: str | None) -> int:
        from aiogram.exceptions import (
            TelegramBadRequest,
            TelegramForbiddenError,
            TelegramNetworkError,
            TelegramNotFound,
            TelegramRetryAfter,
            TelegramServerError,
            TelegramUnauthorizedError,
        )
        from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

        markup = None
        if button_text and button_path and self.frontend_url.startswith("https://"):
            url = f"{self.frontend_url}/#{button_path}"
            markup = InlineKeyboardMarkup(
                inline_keyboard=[[InlineKeyboardButton(text=button_text, web_app=WebAppInfo(url=url))]]
            )
        try:
            msg = await self.bot.send_message(chat_id, text, reply_markup=markup, request_timeout=20)
        except TelegramRetryAfter as exc:
            raise TelegramRateLimited(float(exc.retry_after)) from exc
        except TelegramForbiddenError as exc:
            raise TelegramPermanentError("forbidden: bot blocked or not started", blocked=True) from exc
        except (TelegramBadRequest, TelegramNotFound) as exc:
            raise TelegramPermanentError(f"bad request: {str(exc)[:120]}") from exc
        except TelegramUnauthorizedError as exc:
            raise TelegramTemporaryError("bot token rejected") from exc
        except (TelegramNetworkError, TelegramServerError, TimeoutError) as exc:
            raise TelegramTemporaryError(f"temporary: {type(exc).__name__}") from exc
        return int(msg.message_id)

    async def close(self) -> None:
        await self.bot.session.close()
