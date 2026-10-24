"""Telegram bot handlers and factories shared by `python -m app.bot` and the API's embedded mode."""

from __future__ import annotations

import logging
import uuid

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    BotCommand,
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)

from app.bot import logic
from app.config import get_settings
from app.db.session import get_sessionmaker

log = logging.getLogger("bot")
router = Router()


def _app_url(path: str | None) -> str | None:
    base = get_settings().frontend_url.rstrip("/")
    if not base.startswith("https://"):
        return None  # Telegram requires HTTPS for Mini App buttons
    if not path or path == "/":
        return base
    return f"{base}{path}"


def _markup(reply: logic.BotReply) -> InlineKeyboardMarkup | None:
    rows: list[list[InlineKeyboardButton]] = []
    for pid, _ in reply.proposals:
        rows.append(
            [
                InlineKeyboardButton(text="✅ Подтвердить", callback_data=f"p:c:{pid}"),
                InlineKeyboardButton(text="✖️ Отмена", callback_data=f"p:x:{pid}"),
            ]
        )
    url = _app_url(reply.open_app_path)
    if url:
        rows.append([InlineKeyboardButton(text=reply.open_app_text, web_app=WebAppInfo(url=url))])
    return InlineKeyboardMarkup(inline_keyboard=rows) if rows else None


async def _send(message: Message, reply: logic.BotReply) -> None:
    text = reply.text
    for _, preview in reply.proposals:
        text += f"\n\n<b>Ожидает подтверждения:</b>\n{preview}"
    if reply.open_app_path and _app_url(reply.open_app_path) is None:
        text += "\n\n(Mini App доступен только по HTTPS — настройте FRONTEND_URL.)"
    await message.answer(text, reply_markup=_markup(reply))


@router.message(CommandStart())
async def on_start(message: Message, command: CommandObject) -> None:
    u = message.from_user
    if u is None or u.is_bot:
        return
    async with get_sessionmaker()() as db:
        reply = await logic.start(db, u.id, u.first_name, u.username, u.language_code, command.args)
    await _send(message, reply)


@router.message(Command("app"))
async def on_app(message: Message) -> None:
    await _send(message, logic.BotReply(text="Family OS:", open_app_path="/"))


@router.message(Command("help"))
async def on_help(message: Message) -> None:
    await _send(message, logic.BotReply(text=logic.HELP, open_app_path="/"))


@router.message(Command("settings"))
async def on_settings(message: Message) -> None:
    await _send(
        message,
        logic.BotReply(
            text="Настройки уведомлений и семьи — в приложении.",
            open_app_path="/profile",
            open_app_text="Открыть настройки",
        ),
    )


@router.message(Command("cancel"))
async def on_cancel(message: Message) -> None:
    if message.from_user is None:
        return
    async with get_sessionmaker()() as db:
        reply = await logic.cancel(db, message.from_user.id)
    await _send(message, reply)


@router.message(F.text & ~F.text.startswith("/"))
async def on_text(message: Message) -> None:
    u = message.from_user
    if u is None or u.is_bot or message.chat.type != "private" or not message.text:
        return
    await message.bot.send_chat_action(message.chat.id, "typing")  # type: ignore[union-attr]
    async with get_sessionmaker()() as db:
        await logic.mark_started(db, u.id, u.first_name, u.username, u.language_code)
        reply = await logic.ai_message(db, u.id, message.text)
    await _send(message, reply)


@router.callback_query(F.data.startswith("p:"))
async def on_proposal(callback: CallbackQuery) -> None:
    try:
        _, action, raw = (callback.data or "").split(":", 2)
        proposal_id = uuid.UUID(raw)
    except ValueError:
        await callback.answer("Некорректная кнопка")
        return
    async with get_sessionmaker()() as db:
        text = await logic.resolve_proposal(db, callback.from_user.id, proposal_id, action == "c")
    await callback.answer()
    if isinstance(callback.message, Message):
        await callback.message.edit_reply_markup(reply_markup=None)
        await callback.message.answer(text)


async def configure(bot: Bot) -> None:
    """Register commands and the Mini App menu button (idempotent, run on every start)."""
    await bot.set_my_commands(
        [
            BotCommand(command="app", description="Открыть Family OS"),
            BotCommand(command="help", description="Справка"),
            BotCommand(command="settings", description="Настройки"),
            BotCommand(command="cancel", description="Отменить ожидающие действия"),
        ]
    )
    url = _app_url("/")
    if url:
        await bot.set_chat_menu_button(
            menu_button=MenuButtonWebApp(text="Family OS", web_app=WebAppInfo(url=url))
        )


def create_bot() -> Bot:
    token = get_settings().telegram_bot_token.get_secret_value()
    if not token:
        raise SystemExit("TELEGRAM_BOT_TOKEN is not set; the bot cannot start")
    return Bot(token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))


def create_dispatcher() -> Dispatcher:
    dp = Dispatcher()
    dp.include_router(router)
    return dp
