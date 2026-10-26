from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import select

from app.api.deps import DB, CurrentSession, auth_rate_limit, client_ip
from app.config import get_settings
from app.core.errors import NotFound, ServiceUnavailable, ValidationFailed
from app.core.rate_limit import get_rate_limiter
from app.core.time import utcnow
from app.models.enums import AuthMethod
from app.models.identity import FamilyMember, UserSession
from app.models.system import PushSubscription
from app.modules.auth import device
from app.modules.auth.schemas import (
    DevAuthIn,
    DeviceOut,
    LinkPollIn,
    LinkPollOut,
    LinkStartIn,
    LinkStartOut,
    MeOut,
    MePatch,
    TelegramAuthIn,
    TokenOut,
)
from app.modules.auth.service import build_me, upsert_user
from app.security.sessions import create_session, revoke_session
from app.security.telegram import TelegramUser, validate_init_data

router = APIRouter(tags=["auth"])


@router.post("/auth/telegram", response_model=TokenOut, dependencies=[Depends(auth_rate_limit)])
async def auth_telegram(body: TelegramAuthIn, db: DB) -> TokenOut:
    settings = get_settings()
    data = validate_init_data(
        body.init_data,
        settings.telegram_bot_token.get_secret_value(),
        max_age_seconds=settings.telegram_init_data_max_age,
    )
    user = await upsert_user(db, data.user)
    token, session = await create_session(db, user, AuthMethod.telegram, data.data_hash)
    await db.commit()
    await db.refresh(session, ["user"])
    return TokenOut(
        token=token,
        expires_at=session.expires_at,
        start_param=data.start_param,
        me=await build_me(db, session),
    )


@router.post("/auth/dev", response_model=TokenOut, dependencies=[Depends(auth_rate_limit)])
async def auth_dev(body: DevAuthIn, db: DB) -> TokenOut:
    """Local development only. Never registered as valid Telegram authentication."""
    if not get_settings().dev_auth_active:
        raise NotFound()
    tg = TelegramUser(
        id=body.telegram_id,
        first_name=body.first_name,
        last_name=None,
        username=body.username,
        language_code="ru",
        photo_url=None,
    )
    user = await upsert_user(db, tg)
    token, session = await create_session(db, user, AuthMethod.dev)
    await db.commit()
    await db.refresh(session, ["user"])
    return TokenOut(token=token, expires_at=session.expires_at, me=await build_me(db, session))


@router.post(
    "/auth/link/start", response_model=LinkStartOut, dependencies=[Depends(auth_rate_limit)]
)
async def link_start(
    body: LinkStartIn,
    db: DB,
    user_agent: Annotated[str | None, Header()] = None,
) -> LinkStartOut:
    """Sign-in outside Telegram, step 1: a bot link the user opens to confirm the sign-in."""
    bot = get_settings().telegram_bot_username.strip().lstrip("@")
    if not bot:
        raise ServiceUnavailable("Вход без Telegram недоступен: на сервере не задан бот")
    started = await device.start(db, device.device_label(user_agent, body.standalone))
    return LinkStartOut(
        poll_token=started.poll_token,
        bot_url=f"https://t.me/{bot}?start={started.code}",
        app_url=f"tg://resolve?domain={bot}&start={started.code}",
        expires_at=started.expires_at,
    )


@router.post("/auth/link/poll", response_model=LinkPollOut)
async def link_poll(body: LinkPollIn, db: DB, request: Request) -> LinkPollOut:
    """Step 2: asked every few seconds until the user pressed «Войти» in the bot."""
    await get_rate_limiter().hit(f"link-poll:{client_ip(request)}", 120)
    result = await device.poll(db, body.poll_token)
    if result.status != "approved" or result.session is None or result.token is None:
        return LinkPollOut(status=result.status)  # type: ignore[arg-type]
    return LinkPollOut(
        status="approved",
        auth=TokenOut(
            token=result.token,
            expires_at=result.session.expires_at,
            me=await build_me(db, result.session),
        ),
    )


@router.get("/auth/devices", response_model=list[DeviceOut])
async def devices(session: CurrentSession, db: DB) -> list[DeviceOut]:
    """Phones and computers signed in outside Telegram, newest first."""
    now = utcnow()
    rows = (
        await db.execute(
            select(UserSession)
            .where(
                UserSession.user_id == session.user_id,
                UserSession.auth_method == AuthMethod.device,
                UserSession.revoked_at.is_(None),
                UserSession.expires_at > now,
            )
            .order_by(UserSession.last_used_at.desc())
        )
    ).scalars()
    sessions = list(rows)
    pushed = set(
        (
            await db.execute(
                select(PushSubscription.session_id).where(
                    PushSubscription.session_id.in_([s.id for s in sessions])
                )
            )
        ).scalars()
    )
    return [
        DeviceOut(
            id=s.id,
            label=s.device_label or "Устройство",
            created_at=s.created_at,
            last_used_at=s.last_used_at,
            current=s.id == session.id,
            push=s.id in pushed,
        )
        for s in sessions
    ]


@router.delete("/auth/devices/{device_id}", status_code=204)
async def revoke_device(device_id: uuid.UUID, session: CurrentSession, db: DB) -> None:
    target = await db.scalar(
        select(UserSession).where(
            UserSession.id == device_id,
            UserSession.user_id == session.user_id,
            UserSession.auth_method == AuthMethod.device,
            UserSession.revoked_at.is_(None),
        )
    )
    if target is None:
        raise NotFound()
    await revoke_session(db, target)


@router.post("/auth/logout", status_code=204)
async def logout(session: CurrentSession, db: DB) -> None:
    await revoke_session(db, session)


@router.get("/me", response_model=MeOut)
async def me(session: CurrentSession, db: DB) -> MeOut:
    return await build_me(db, session)


@router.patch("/me", response_model=MeOut)
async def patch_me(body: MePatch, session: CurrentSession, db: DB) -> MeOut:
    user = session.user
    if body.active_family_id is not None:
        member = await db.scalar(
            FamilyMember.__table__.select()
            .with_only_columns(FamilyMember.id)
            .where(
                FamilyMember.family_id == body.active_family_id,
                FamilyMember.user_id == user.id,
            )
        )
        if member is None:
            raise ValidationFailed("Вы не состоите в этой семье")
        user.active_family_id = body.active_family_id
    if body.language_code is not None:
        user.language_code = body.language_code
    await db.commit()
    return await build_me(db, session)
