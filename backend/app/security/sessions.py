"""Server-side sessions: opaque bearer token, only its SHA-256 hash is stored."""

from __future__ import annotations

from datetime import timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import Unauthorized
from app.core.time import utcnow
from app.models.enums import AuthMethod
from app.models.identity import User, UserSession
from app.security.tokens import hash_token, new_token

TOUCH_INTERVAL = timedelta(minutes=5)
ABSOLUTE_LIFETIME = timedelta(days=30)
# A home-screen app stays signed in like an ordinary app: the session is renewed whenever it is
# used and ends after 60 days without use, a year after sign-in, or when it is signed out from
# the device list.
DEVICE_IDLE_LIFETIME = timedelta(days=60)
DEVICE_ABSOLUTE_LIFETIME = timedelta(days=365)


def _idle_lifetime(method: AuthMethod) -> timedelta:
    if method == AuthMethod.device:
        return DEVICE_IDLE_LIFETIME
    return timedelta(hours=get_settings().session_ttl_hours)


def _absolute_lifetime(method: AuthMethod) -> timedelta:
    return DEVICE_ABSOLUTE_LIFETIME if method == AuthMethod.device else ABSOLUTE_LIFETIME


async def create_session(
    db: AsyncSession,
    user: User,
    method: AuthMethod,
    init_data_hash: str | None = None,
    device_label: str | None = None,
) -> tuple[str, UserSession]:
    now = utcnow()
    if init_data_hash:
        # Re-using the same initData revokes the session previously issued for it, so a
        # replayed initData can never yield two live sessions.
        await db.execute(
            update(UserSession)
            .where(UserSession.init_data_hash == init_data_hash, UserSession.revoked_at.is_(None))
            .values(revoked_at=now)
        )
    token = new_token()
    session = UserSession(
        user_id=user.id,
        token_hash=hash_token(token),
        auth_method=method,
        init_data_hash=init_data_hash,
        device_label=device_label,
        expires_at=now + _idle_lifetime(method),
        last_used_at=now,
    )
    db.add(session)
    await db.flush()
    return token, session


async def resolve_session(db: AsyncSession, token: str) -> UserSession:
    if not token or len(token) > 128:
        raise Unauthorized()
    session = (
        await db.execute(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    ).scalar_one_or_none()
    now = utcnow()
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at <= now
        or now - session.created_at > _absolute_lifetime(session.auth_method)
    ):
        raise Unauthorized("Сессия истекла, откройте приложение заново", code="session_expired")
    settings = get_settings()
    if session.auth_method == AuthMethod.dev and not settings.dev_auth_active:
        raise Unauthorized()
    if now - session.last_used_at > TOUCH_INTERVAL:
        session.last_used_at = now
        session.expires_at = now + _idle_lifetime(session.auth_method)
        session.user.last_seen_at = now
        await db.commit()
    return session


async def revoke_session(db: AsyncSession, session: UserSession) -> None:
    from app.models.system import PushSubscription

    session.revoked_at = utcnow()
    # A signed-out device must not keep receiving the family's notifications.
    await db.execute(delete(PushSubscription).where(PushSubscription.session_id == session.id))
    await db.commit()
