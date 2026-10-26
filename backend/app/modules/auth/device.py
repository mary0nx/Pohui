"""Sign-in outside Telegram: the browser asks, the user confirms with a button in the bot.

1. The browser (Safari or the home-screen app) calls start(): it keeps the secret poll token,
   the user opens the bot link that carries a separate one-time code.
2. The bot (the Telegram update proves who the user is) claims the request for that Telegram
   account and shows «Войти» / «Отклонить» with the device name.
3. The browser polls; once approved, the request yields one session and is spent.
Nothing here accepts initData, so the Mini App's initData check stays exactly as it is.
"""

from __future__ import annotations

import html
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models.enums import AuthMethod
from app.models.identity import LoginRequest, User, UserSession
from app.security.sessions import create_session
from app.security.tokens import hash_token, new_token

LOGIN_TTL = timedelta(minutes=10)
CODE_PREFIX = "login_"
# Telegram start parameters: up to 64 characters of A-Z, a-z, 0-9, _ and -.
CODE_RE = re.compile(r"^login_[A-Za-z0-9_-]{20,58}$")


def device_label(user_agent: str | None, standalone: bool) -> str:
    ua = user_agent or ""
    if "iPhone" in ua:
        device = "iPhone"
    elif "iPad" in ua or ("Macintosh" in ua and "Mobile" in ua):
        device = "iPad"
    elif "Android" in ua:
        device = "Android"
    elif "Macintosh" in ua or "Mac OS X" in ua:
        device = "Mac"
    elif "Windows" in ua:
        device = "Windows"
    elif "Linux" in ua:
        device = "Linux"
    else:
        device = "Устройство"
    if standalone:
        return f"{device} · приложение на экране"
    if "Edg/" in ua:
        browser = "Edge"
    elif "Firefox/" in ua or "FxiOS" in ua:
        browser = "Firefox"
    elif "CriOS" in ua or "Chrome/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "браузер"
    return f"{device} · {browser}"


@dataclass
class StartedLogin:
    poll_token: str
    code: str
    expires_at: datetime


async def start(db: AsyncSession, label: str) -> StartedLogin:
    poll_token = new_token()
    code = CODE_PREFIX + new_token(24)
    now = utcnow()
    req = LoginRequest(
        poll_hash=hash_token(poll_token),
        code_hash=hash_token(code),
        device_label=label[:64],
        expires_at=now + LOGIN_TTL,
    )
    db.add(req)
    await db.commit()
    return StartedLogin(poll_token=poll_token, code=code, expires_at=req.expires_at)


def _live(req: LoginRequest | None, now: datetime) -> bool:
    return (
        req is not None
        and req.expires_at > now
        and req.approved_at is None
        and req.rejected_at is None
        and req.consumed_at is None
    )


async def claim(db: AsyncSession, telegram_id: int, code: str) -> LoginRequest | None:
    """The bot received /start login_…: bind the request to this Telegram account."""
    if not CODE_RE.match(code):
        return None
    req = await db.scalar(
        select(LoginRequest).where(LoginRequest.code_hash == hash_token(code)).with_for_update()
    )
    if req is None or not _live(req, utcnow()):
        return None
    if req.claimed_telegram_id is None:
        req.claimed_telegram_id = telegram_id
        await db.commit()
    elif req.claimed_telegram_id != telegram_id:
        return None  # someone else already opened this link
    return req


def confirm_text(req: LoginRequest) -> str:
    return (
        f"🔐 <b>Вход в Family OS</b> на устройстве «{html.escape(req.device_label)}».\n\n"
        "Нажмите «Войти», только если вы сами сейчас входите в приложение на своём телефоне "
        "или компьютере. Если ссылку прислал кто-то другой, нажмите «Отклонить»: "
        "иначе он увидит ваши семейные данные.\n\nКнопка действует 10 минут."
    )


async def resolve(db: AsyncSession, user: User, request_id: uuid.UUID, approve: bool) -> str:
    """«Войти» / «Отклонить» pressed in the bot by `user` (identified by the Telegram update)."""
    req = await db.get(LoginRequest, request_id, with_for_update=True)
    now = utcnow()
    if req is None or req.claimed_telegram_id != user.telegram_id:
        return "Этот запрос на вход не найден."
    if not _live(req, now):
        if req.approved_at is not None:
            return f"✅ Вход на «{html.escape(req.device_label)}» уже подтверждён."
        return "Запрос на вход устарел. Нажмите «Войти через Telegram» в приложении ещё раз."
    label = html.escape(req.device_label)
    if not approve:
        req.rejected_at = now
        await db.commit()
        return f"✖️ Вход на «{label}» отклонён. Ничего не изменилось."
    req.user_id = user.id
    req.approved_at = now
    await db.commit()
    return (
        f"✅ Вход на «{label}» подтверждён, вернитесь в приложение.\n\n"
        "Если это были не вы: «Профиль» → «Устройства» → «Выйти» у этого устройства."
    )


@dataclass
class PollResult:
    status: str  # pending | approved | rejected | expired
    token: str | None = None
    session: UserSession | None = None


async def poll(db: AsyncSession, poll_token: str) -> PollResult:
    if not poll_token or len(poll_token) > 128:
        return PollResult("expired")
    req = await db.scalar(
        select(LoginRequest).where(LoginRequest.poll_hash == hash_token(poll_token))
    )
    now = utcnow()
    if req is None or req.consumed_at is not None or req.expires_at <= now:
        return PollResult("expired")
    if req.rejected_at is not None:
        return PollResult("rejected")
    if req.approved_at is None or req.user_id is None:
        return PollResult("pending")
    # Spend the request atomically: two parallel polls never get two sessions.
    spent = await db.scalar(
        update(LoginRequest)
        .where(LoginRequest.id == req.id, LoginRequest.consumed_at.is_(None))
        .values(consumed_at=now)
        .returning(LoginRequest.user_id)
    )
    if spent is None:
        return PollResult("expired")
    user = await db.get(User, spent)
    if user is None:
        return PollResult("expired")
    token, session = await create_session(
        db, user, AuthMethod.device, device_label=req.device_label
    )
    await db.commit()
    await db.refresh(session, ["user"])
    return PollResult("approved", token=token, session=session)
