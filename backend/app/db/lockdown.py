"""Close Supabase's auto-generated Data API over Family OS tables: `python -m app.db.lockdown`.

Supabase exposes tables in the `public` schema through its REST/GraphQL API to the `anon` and
`authenticated` roles, which by default receive privileges on every new table. Family OS never
uses that API: all access goes through the FastAPI backend and its family-scoped authorization.
Revoking those privileges keeps family data private even if the Data API was left enabled.
On any other PostgreSQL these roles do not exist and this is a no-op. Safe to run repeatedly.
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import text

from app.config import get_settings
from app.core.logging import setup_logging
from app.db.session import dispose_engine, get_engine

log = logging.getLogger("lockdown")
API_ROLES = ("anon", "authenticated")


async def lockdown() -> list[str]:
    """Revoke Data API roles' access to the public schema; returns the roles handled."""
    async with get_engine().begin() as conn:
        existing = (
            await conn.execute(
                text("SELECT rolname FROM pg_roles WHERE rolname = ANY(:names)"),
                {"names": list(API_ROLES)},
            )
        ).scalars()
        roles = sorted(existing)
        if not roles:
            return []
        targets = ", ".join(f'"{r}"' for r in roles)  # names come from the fixed tuple above
        for statement in (
            f"REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {targets}",
            f"REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {targets}",
            f"REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM {targets}",
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {targets}",
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM {targets}",
            f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM {targets}",
        ):
            await conn.execute(text(statement))
    return roles


async def main() -> None:
    setup_logging(get_settings().log_level)
    try:
        roles = await lockdown()
    finally:
        await dispose_engine()
    if roles:
        log.info("revoked Data API access to Family OS tables", extra={"ctx": {"roles": roles}})


if __name__ == "__main__":
    asyncio.run(main())
