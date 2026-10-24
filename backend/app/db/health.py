"""Readiness check that names the database problem instead of a bare "unavailable".

The codes are shown at /health/ready so a misconfigured hosted database (wrong password, wrong
connection string, migrations not applied) can be diagnosed without access to the host's logs.
They never include the connection string, user names or server messages.
"""

from __future__ import annotations

import logging
import re
import socket
from collections.abc import Iterator

from sqlalchemy import text
from sqlalchemy.exc import ArgumentError

from app.db.session import get_sessionmaker

log = logging.getLogger("app")


def _chain(exc: BaseException) -> Iterator[BaseException]:
    seen: set[int] = set()
    stack: list[BaseException | None] = [exc]
    while stack:
        current = stack.pop()
        if current is None or id(current) in seen:
            continue
        seen.add(id(current))
        yield current
        stack.extend([current.__cause__, current.__context__, getattr(current, "orig", None)])


def classify_database_error(exc: BaseException) -> str:
    """Map a connection/query failure to a short, non-sensitive problem code."""
    import asyncpg.exceptions as pg

    for err in _chain(exc):
        if isinstance(err, ArgumentError | ValueError) and "URL" in str(err):
            return "database_url_invalid"
        if isinstance(err, pg.InvalidPasswordError):
            return "database_password_wrong"
        if isinstance(err, pg.InvalidAuthorizationSpecificationError):
            return "database_user_wrong"
        if isinstance(err, pg.InvalidCatalogNameError):
            return "database_name_wrong"
        if isinstance(err, pg.TooManyConnectionsError):
            return "database_too_many_connections"
        # Supabase's pooler answers an unknown project/user this way (wording varies by version).
        message = str(err).lower()
        if "tenant or user not found" in message or "tenant/user" in message:
            return "database_user_wrong"
        if "authbreaker" in message or "too many authentication" in message:
            return "database_temporarily_blocked"
        if "maxclients" in message or "max client" in message:
            return "database_too_many_connections"
        if "ssl" in message and "requir" in message:
            return "database_ssl_required"
        if isinstance(err, socket.gaierror):
            return "database_host_not_found"
        if isinstance(err, ConnectionRefusedError | TimeoutError):
            return "database_unreachable"
    if any(isinstance(err, OSError) for err in _chain(exc)):
        return "database_unreachable"
    return "database_error"


_IDENTIFYING = re.compile(r"\S*[.@:/=\"'\\]\S*|\d+")


def _redact(message: str) -> str:
    """Keep the wording of a server message, drop anything that may identify the database
    (user names like postgres.<ref>, hosts, quoted names, numbers). Passwords are never part
    of PostgreSQL or pooler error messages."""
    return _IDENTIFYING.sub("…", message).strip()[:120]


def error_signature(exc: BaseException) -> str:
    """Exception classes, SQLSTATE codes and the redacted server message of the chain, e.g.
    `InternalServerError(XX000): (EXAMPLE) too many …`: enough to tell failures apart."""
    parts: list[str] = []
    message = ""
    for err in _chain(exc):
        name = type(err).__name__
        sqlstate = getattr(err, "sqlstate", None)
        parts.append(f"{name}({sqlstate})" if isinstance(sqlstate, str) else name)
        if isinstance(sqlstate, str) and not message:
            message = _redact(str(err))
    signature = ">".join(dict.fromkeys(parts))
    return f"{signature}: {message}"[:250] if message else signature[:250]


async def database_problem() -> tuple[str, str] | None:
    """None when the database is reachable and migrated, else (problem code, error signature)."""
    try:
        async with get_sessionmaker()() as session:
            migrated = await session.scalar(text("SELECT to_regclass('public.alembic_version')"))
    except Exception as exc:
        code = classify_database_error(exc)
        log.warning("readiness check failed", extra={"ctx": {"problem": code}}, exc_info=True)
        return code, error_signature(exc)
    return None if migrated is not None else ("database_not_migrated", "")
