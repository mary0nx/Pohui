from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.identity import Family, FamilyMember, User, UserSession
from app.modules.auth.schemas import MembershipOut, MeOut, UserOut
from app.security.telegram import TelegramUser


async def upsert_user(db: AsyncSession, tg: TelegramUser) -> User:
    values = {
        "first_name": tg.first_name,
        "last_name": tg.last_name,
        "username": tg.username,
        "photo_url": tg.photo_url,
    }
    stmt = (
        insert(User)
        # language_code is only taken from Telegram on first login; afterwards the user
        # chooses it in the app settings.
        .values(telegram_id=tg.id, language_code=tg.language_code, **values)
        .on_conflict_do_update(index_elements=[User.telegram_id], set_=values)
        .returning(User.id)
    )
    user_id = (await db.execute(stmt)).scalar_one()
    user = await db.get(User, user_id, populate_existing=True)
    assert user is not None
    return user


async def build_me(db: AsyncSession, session: UserSession) -> MeOut:
    user = session.user
    rows = (
        await db.execute(
            select(FamilyMember, Family)
            .join(Family, Family.id == FamilyMember.family_id)
            .where(FamilyMember.user_id == user.id)
            .order_by(FamilyMember.joined_at)
        )
    ).all()
    families = [
        MembershipOut(
            family_id=f.id, name=f.name, role=m.role, currency=f.currency, timezone=f.timezone
        )
        for m, f in rows
    ]
    ids = {f.family_id for f in families}
    active = user.active_family_id if user.active_family_id in ids else None
    if active is None and families:
        active = families[0].family_id
    out = UserOut.model_validate(user)
    out.bot_started = user.bot_started_at is not None and not user.bot_blocked
    return MeOut(
        user=out, families=families, active_family_id=active, auth_method=session.auth_method
    )
