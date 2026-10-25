"""Bot behaviour independent of aiogram, so it can be tested directly.

The Telegram user id comes from the update delivered by Telegram (polling over HTTPS or a
webhook protected by the secret token), so it identifies the user without initData.
"""

from __future__ import annotations

import html
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import assistant, proposals
from app.ai.providers import ai_available
from app.ai.providers.base import AIUnavailable
from app.ai.tools.registry import ToolContext
from app.core.errors import AppError
from app.core.rate_limit import get_rate_limiter
from app.core.time import utcnow
from app.models import Family, FamilyMember, User
from app.models.enums import Channel, ProposalStatus
from app.security.access import FamilyContext

HELP_BASE = (
    "<b>Family OS</b> — семейный бюджет, календарь, покупки и задачи.\n\n"
    "/app — открыть приложение\n"
    "/settings — настройки уведомлений\n"
    "/cancel — отменить ожидающие подтверждения действия\n"
    "/help — эта справка"
)
HELP_AI = (
    "\n\nМожно просто написать: «Добавь 45 злотых за продукты», «Что у нас в субботу?», "
    "«Добавь молоко и хлеб в покупки»."
)
NO_AI_REPLY = (
    "Записи добавляются в приложении: откройте Family OS кнопкой ниже. "
    "Сюда будут приходить напоминания и уведомления."
)


def help_text() -> str:
    """The free-text examples only make sense while the AI assistant is configured."""
    return HELP_BASE + (HELP_AI if ai_available() else "")


@dataclass
class BotReply:
    text: str
    open_app_path: str | None = None
    open_app_text: str = "Открыть Family OS"
    proposals: list[tuple[uuid.UUID, str]] = field(default_factory=list)


async def mark_started(
    db: AsyncSession, tg_user_id: int, first_name: str, username: str | None, language: str | None
) -> User:
    from app.modules.auth.service import upsert_user
    from app.security.telegram import TelegramUser

    user = await upsert_user(
        db,
        TelegramUser(
            id=tg_user_id,
            first_name=first_name[:128] or "Без имени",
            last_name=None,
            username=username,
            language_code=language,
            photo_url=None,
        ),
    )
    user.bot_started_at = user.bot_started_at or utcnow()
    user.bot_blocked = False
    await db.commit()
    return user


async def family_context_for(db: AsyncSession, tg_user_id: int) -> FamilyContext | None:
    user = await db.scalar(select(User).where(User.telegram_id == tg_user_id))
    if user is None:
        return None
    stmt = (
        select(FamilyMember, Family)
        .join(Family, Family.id == FamilyMember.family_id)
        .where(FamilyMember.user_id == user.id)
    )
    rows = (await db.execute(stmt.order_by(FamilyMember.joined_at))).all()
    if not rows:
        return None
    chosen = next(((m, f) for m, f in rows if f.id == user.active_family_id), rows[0])
    return FamilyContext(user=user, family=chosen[1], member=chosen[0])


async def start(
    db: AsyncSession,
    tg_user_id: int,
    first_name: str,
    username: str | None,
    language: str | None,
    payload: str | None,
) -> BotReply:
    user = await mark_started(db, tg_user_id, first_name, username, language)
    if payload and payload.startswith("inv_"):
        from app.modules.families.service import remember_invitation

        # Remembered on the server: the app then offers to join even when it is opened with the
        # bot's menu button instead of the button below.
        preview = await remember_invitation(db, user, payload)
        await db.commit()
        if preview is None:
            text = (
                "Это приглашение уже использовано, отозвано или истекло (оно действует 72 часа). "
                "Попросите прислать новое: «Профиль» → «Пригласить участника»."
            )
        elif preview.already_member:
            text = f"Вы уже в семье «{html.escape(preview.family_name)}». Откройте приложение."
        else:
            who = html.escape(preview.inviter_name) if preview.inviter_name else "Вас"
            verb = "приглашает вас" if preview.inviter_name else "пригласили"
            text = (
                f"{who} {verb} в семью «{html.escape(preview.family_name)}» в Family OS.\n\n"
                "Нажмите «Присоединиться» — общие расходы, покупки и дела появятся у вас."
            )
        return BotReply(
            text=text,
            open_app_path=f"/join?invite={payload}" if preview else "/",
            open_app_text="Присоединиться" if preview and not preview.already_member else "Открыть",
        )
    ctx = await family_context_for(db, tg_user_id)
    if ctx is None:
        return BotReply(
            text=f"Привет, {html.escape(first_name)}! Это Family OS. Откройте приложение, чтобы создать семейное пространство или присоединиться по приглашению.",
            open_app_path="/",
        )
    return BotReply(
        text=f"С возвращением, {html.escape(first_name)}! Уведомления будут приходить сюда.\n\n{help_text()}",
        open_app_path="/",
    )


async def cancel(db: AsyncSession, tg_user_id: int) -> BotReply:
    ctx = await family_context_for(db, tg_user_id)
    if ctx is None:
        return BotReply(text="Нечего отменять.")
    n = await proposals.cancel_all_pending(db, ctx)
    return BotReply(
        text=f"Отменено действий: {n}." if n else "Нет действий, ожидающих подтверждения."
    )


async def ai_message(db: AsyncSession, tg_user_id: int, text: str) -> BotReply:
    if not ai_available():
        return BotReply(text=NO_AI_REPLY, open_app_path="/")
    ctx = await family_context_for(db, tg_user_id)
    if ctx is None:
        return BotReply(
            text="Сначала создайте семью или присоединитесь к ней в приложении.", open_app_path="/"
        )
    try:
        await get_rate_limiter().hit(f"bot-ai:{ctx.user_id}", 10)
        result = await assistant.chat(db, ToolContext(db=db, ctx=ctx, channel=Channel.bot), text)
    except AIUnavailable as exc:
        await db.rollback()
        return BotReply(text=html.escape(exc.message))
    except AppError as exc:
        await db.rollback()
        return BotReply(text=html.escape(exc.message))
    return BotReply(
        text=html.escape(result.reply)[:3900],
        proposals=[
            (p.id, p.summary + ("\n" + "\n".join(p.details) if p.details else ""))
            for p in result.proposals
        ],
    )


async def resolve_proposal(
    db: AsyncSession, tg_user_id: int, proposal_id: uuid.UUID, confirm: bool
) -> str:
    ctx = await family_context_for(db, tg_user_id)
    if ctx is None:
        return "Нет доступа."
    try:
        if confirm:
            p = await proposals.confirm_proposal(db, ctx, proposal_id, Channel.bot)
        else:
            p = await proposals.cancel_proposal(db, ctx, proposal_id)
    except AppError as exc:
        return html.escape(exc.message)
    summary = html.escape(p.preview.get("summary", "Действие"))
    if p.status == ProposalStatus.executed:
        return f"✅ Выполнено: {summary}"
    if p.status == ProposalStatus.cancelled:
        return f"✖️ Отменено: {summary}"
    if p.status == ProposalStatus.failed:
        return f"⚠️ Не выполнено: {html.escape((p.result or {}).get('error', ''))}"
    return f"Статус: {p.status.value}"
