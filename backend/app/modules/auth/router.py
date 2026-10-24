from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import DB, CurrentSession, auth_rate_limit
from app.config import get_settings
from app.core.errors import NotFound, ValidationFailed
from app.models.enums import AuthMethod
from app.models.identity import FamilyMember
from app.modules.auth.schemas import DevAuthIn, MeOut, MePatch, TelegramAuthIn, TokenOut
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
