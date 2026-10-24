"""Supabase Data API roles must not reach Family OS tables (app.db.lockdown)."""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

from app.db.lockdown import lockdown
from app.db.session import get_engine


async def _ensure_supabase_like_roles() -> None:
    async with get_engine().begin() as conn:
        for role in ("anon", "authenticated"):
            exists = await conn.scalar(
                text("SELECT 1 FROM pg_roles WHERE rolname = :r"), {"r": role}
            )
            if not exists:
                try:
                    await conn.execute(text(f"CREATE ROLE {role} NOLOGIN"))
                except ProgrammingError:
                    pytest.skip("needs a PostgreSQL user allowed to create roles")


async def _can_select(role: str, table: str) -> bool:
    async with get_engine().connect() as conn:
        return bool(
            await conn.scalar(
                text("SELECT has_table_privilege(:r, :t, 'SELECT')"), {"r": role, "t": table}
            )
        )


async def test_lockdown_revokes_supabase_api_roles() -> None:
    await _ensure_supabase_like_roles()
    # What Supabase does for the public schema: grants now and for every future table.
    async with get_engine().begin() as conn:
        await conn.execute(text("GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated"))
        await conn.execute(
            text(
                "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
                "GRANT ALL ON TABLES TO anon, authenticated"
            )
        )
    assert await _can_select("anon", "public.users")

    assert await lockdown() == ["anon", "authenticated"]

    for role in ("anon", "authenticated"):
        assert not await _can_select(role, "public.users")
        assert not await _can_select(role, "public.transactions")
    async with get_engine().begin() as conn:
        await conn.execute(text("CREATE TABLE public.lockdown_probe (id int)"))
    try:
        assert not await _can_select("anon", "public.lockdown_probe")
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(text("DROP TABLE public.lockdown_probe"))
    assert await lockdown() == ["anon", "authenticated"]  # idempotent
