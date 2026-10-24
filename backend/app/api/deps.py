"""FastAPI dependencies: database session, current user, family context, rate limits."""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import Depends, Header, Path, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import Unauthorized
from app.core.rate_limit import get_rate_limiter
from app.db.session import get_db
from app.models.identity import User, UserSession
from app.security.access import FamilyContext, load_family_context
from app.security.sessions import resolve_session

DB = Annotated[AsyncSession, Depends(get_db)]


def client_ip(request: Request) -> str:
    # Caddy sets X-Forwarded-For; uvicorn runs with --proxy-headers restricted to the proxy.
    return request.client.host if request.client else "unknown"


async def current_session(
    db: DB, authorization: Annotated[str | None, Header()] = None
) -> UserSession:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise Unauthorized()
    session = await resolve_session(db, authorization[7:].strip())
    await get_rate_limiter().hit(f"user:{session.user_id}", get_settings().rate_limit_per_minute)
    return session


CurrentSession = Annotated[UserSession, Depends(current_session)]


async def current_user(session: CurrentSession) -> User:
    return session.user


CurrentUser = Annotated[User, Depends(current_user)]


async def family_context(
    db: DB, user: CurrentUser, family_id: Annotated[uuid.UUID, Path()]
) -> FamilyContext:
    return await load_family_context(db, user, family_id)


Ctx = Annotated[FamilyContext, Depends(family_context)]
IdempotencyKeyHeader = Annotated[str | None, Header(alias="Idempotency-Key")]


async def auth_rate_limit(request: Request) -> None:
    await get_rate_limiter().hit(
        f"auth:{client_ip(request)}", get_settings().auth_rate_limit_per_minute
    )
