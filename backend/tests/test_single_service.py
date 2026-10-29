"""Single-service deployment (free Render web service + hosted PostgreSQL such as Supabase)."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.config import Settings, get_settings, normalize_database_url


@pytest.fixture
def settings_env(monkeypatch: pytest.MonkeyPatch) -> Iterator[pytest.MonkeyPatch]:
    """Change environment variables for one test and rebuild the cached settings."""
    get_settings.cache_clear()
    yield monkeypatch
    monkeypatch.undo()
    get_settings.cache_clear()


def _client(app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        (
            "postgresql://u:p@ep-x-1-pooler.eu-central-1.aws.neon.tech/neondb"
            "?sslmode=require&channel_binding=require",
            "postgresql+asyncpg://u:p@ep-x-1.eu-central-1.aws.neon.tech/neondb?ssl=require",
        ),
        ("postgres://u:p@db.internal:5432/app", "postgresql+asyncpg://u:p@db.internal:5432/app"),
        (
            "postgresql+asyncpg://familyos:familyos@localhost:5432/familyos",
            "postgresql+asyncpg://familyos:familyos@localhost:5432/familyos",
        ),
        ("postgresql://u:p@h/db?sslmode=disable", "postgresql+asyncpg://u:p@h/db"),
        (
            "postgresql://postgres.abcd:pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres",
            "postgresql+asyncpg://postgres.abcd:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
        ),
        (
            "postgresql://postgres.abcd:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
            "postgresql+asyncpg://postgres.abcd:pw@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
        ),
    ],
)
def test_database_url_from_hosting_providers(given: str, expected: str) -> None:
    assert normalize_database_url(given) == expected


def test_render_url_fills_backend_and_webhook_urls() -> None:
    s = Settings(render_external_url="https://my-family-api.onrender.com/")
    assert s.backend_url == "https://my-family-api.onrender.com"
    assert s.telegram_webhook_url == "https://my-family-api.onrender.com/tg/webhook"
    explicit = Settings(
        render_external_url="https://x.onrender.com",
        backend_url="https://api.family.test",
        telegram_webhook_url="https://api.family.test/tg/webhook",
    )
    assert explicit.backend_url == "https://api.family.test"
    assert explicit.telegram_webhook_url == "https://api.family.test/tg/webhook"


def test_derived_webhook_secret_is_stable_and_telegram_compatible() -> None:
    s = Settings(app_secret_key="k" * 40)
    secret = s.webhook_secret()
    assert re.fullmatch(r"[A-Za-z0-9_-]{32,256}", secret)
    assert secret == Settings(app_secret_key="k" * 40).webhook_secret()
    assert secret != Settings(app_secret_key="j" * 40).webhook_secret()
    assert Settings(telegram_webhook_secret="explicit_value").webhook_secret() == "explicit_value"


async def test_cors_regex_allows_pages_previews_only(settings_env: pytest.MonkeyPatch) -> None:
    settings_env.setenv("CORS_ORIGINS", "https://my-family-app.pages.dev")
    settings_env.setenv("CORS_ORIGIN_REGEX", r"^https://[a-z0-9-]+\.pohui\.pages\.dev$")
    from app.main import create_app

    preflight = {"Access-Control-Request-Method": "POST"}
    async with _client(create_app()) as c:
        for origin in (
            "https://my-family-app.pages.dev",
            "https://06c41622.my-family-app.pages.dev",
        ):
            r = await c.options("/api/v1/meta", headers={"Origin": origin, **preflight})
            assert r.headers.get("access-control-allow-origin") == origin
        for origin in ("https://evil.pages.dev", "https://my-family-app.pages.dev.evil.example"):
            r = await c.options("/api/v1/meta", headers={"Origin": origin, **preflight})
            assert "access-control-allow-origin" not in r.headers


class FakeBot:
    def __init__(self) -> None:
        self.updates: list[dict[str, Any]] = []

    def feed(self, update: dict[str, Any]) -> None:
        self.updates.append(update)


async def test_embedded_webhook_checks_the_telegram_secret(
    settings_env: pytest.MonkeyPatch,
) -> None:
    settings_env.setenv("EMBEDDED_BOT", "true")
    from app.main import create_app

    app = create_app()
    secret = get_settings().webhook_secret()
    update = {"update_id": 1, "message": {"message_id": 1, "date": 0, "chat": {"id": 1}}}
    async with _client(app) as c:
        app.state.embedded_bot = None
        r = await c.post("/tg/webhook", json=update)
        assert r.status_code == 404  # bot failed to start / not configured: nothing accepted

        fake = FakeBot()
        app.state.embedded_bot = fake
        r = await c.post("/tg/webhook", json=update)
        assert r.status_code == 401
        r = await c.post(
            "/tg/webhook", json=update, headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"}
        )
        assert r.status_code == 401
        assert fake.updates == []

        ok_headers = {"X-Telegram-Bot-Api-Secret-Token": secret}
        r = await c.post("/tg/webhook", content=b"[1]", headers=ok_headers)
        assert r.status_code == 400
        r = await c.post("/tg/webhook", json=update, headers=ok_headers)
        assert r.status_code == 200
        assert fake.updates == [update]


async def test_webhook_route_absent_without_embedded_bot(client: AsyncClient) -> None:
    r = await client.post("/tg/webhook", json={"update_id": 1})
    assert r.status_code == 404


async def test_embedded_worker_runs_with_the_api(settings_env: pytest.MonkeyPatch) -> None:
    settings_env.setenv("EMBEDDED_WORKER", "true")
    started = asyncio.Event()
    stopped = asyncio.Event()

    async def fake_loop(stop: asyncio.Event) -> None:
        started.set()
        await stop.wait()
        stopped.set()

    import app.workers.loop as loop_module

    settings_env.setattr(loop_module, "run_loop", fake_loop)
    from app.main import create_app

    app = create_app()
    async with app.router.lifespan_context(app):
        await asyncio.wait_for(started.wait(), timeout=2)
        assert not stopped.is_set()
    assert stopped.is_set()


async def test_embedded_bot_start_is_retried_without_blocking_the_api(
    settings_env: pytest.MonkeyPatch,
) -> None:
    settings_env.setenv("EMBEDDED_BOT", "true")
    attempts: list[int] = []

    class FlakyBot(FakeBot):
        async def start(self) -> None:
            attempts.append(1)
            if len(attempts) == 1:
                raise ConnectionError("telegram unreachable")

        async def stop(self) -> None:
            return None

    import app.bot.webhook as webhook_module
    import app.main as main_module

    settings_env.setattr(webhook_module, "EmbeddedBot", FlakyBot)
    settings_env.setattr(main_module, "BOT_START_DELAYS", (0.0,))
    app = main_module.create_app()
    async with app.router.lifespan_context(app), _client(app) as c:
        assert (await c.get("/health")).status_code == 200
        for _ in range(100):
            if app.state.embedded_bot is not None:
                break
            await asyncio.sleep(0.01)
        assert isinstance(app.state.embedded_bot, FlakyBot)
        assert len(attempts) == 2


@pytest.mark.parametrize(
    ("url", "problem"),
    [
        (
            "postgresql://familyos:wrong-password@localhost:5432/familyos_test",
            "database_password_wrong",
        ),
        ("postgresql://familyos:familyos@localhost:5432/no_such_db", "database_name_wrong"),
        ("postgresql://familyos:familyos@localhost:1/familyos_test", "database_unreachable"),
        (
            "postgresql://familyos:familyos@no-such-host.invalid:5432/familyos_test",
            "database_host_not_found",
        ),
        ("not a database url", "database_url_invalid"),
    ],
)
async def test_readiness_names_the_database_problem(
    settings_env: pytest.MonkeyPatch, url: str, problem: str
) -> None:
    from app.db.session import dispose_engine
    from app.main import create_app

    await dispose_engine()
    settings_env.setenv("DATABASE_URL", url)
    get_settings.cache_clear()  # importing app.main above may have cached the old settings
    try:
        async with _client(create_app()) as c:
            r = await c.get("/health/ready")
            assert r.status_code == 503
            assert r.json() == {"status": "unavailable", "problem": problem}
            assert "familyos" not in r.text  # never echo user names or connection details
            assert (await c.get("/health")).status_code == 200  # liveness stays up
    finally:
        await dispose_engine()


async def test_readiness_ok_on_migrated_database(client: AsyncClient) -> None:
    r = await client.get("/health/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "worker": "not_embedded"}


async def test_readiness_reports_missing_migrations(client: AsyncClient) -> None:
    from sqlalchemy import text

    from app.db.session import get_engine

    async with get_engine().begin() as conn:
        await conn.execute(text("ALTER TABLE alembic_version RENAME TO alembic_version_hidden"))
    try:
        r = await client.get("/health/ready")
        assert r.status_code == 503
        assert r.json() == {"status": "unavailable", "problem": "database_not_migrated"}
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(text("ALTER TABLE alembic_version_hidden RENAME TO alembic_version"))

    # A database one migration behind this code is not ready either.
    from app.db.health import migration_head

    head = migration_head()
    assert head is not None
    async with get_engine().begin() as conn:
        await conn.execute(text("UPDATE alembic_version SET version_num = 'older'"))
    try:
        r = await client.get("/health/ready")
        assert r.json() == {"status": "unavailable", "problem": "database_not_migrated"}
    finally:
        async with get_engine().begin() as conn:
            await conn.execute(text("UPDATE alembic_version SET version_num = :h"), {"h": head})
    assert (await client.get("/health/ready")).json()["status"] == "ok"


def test_unrecognised_database_errors_get_a_safe_signature() -> None:
    import asyncpg.exceptions as pg
    from sqlalchemy.exc import DBAPIError

    from app.db.health import classify_database_error, error_signature

    def wrapped(inner: Exception) -> Exception:
        try:
            try:
                raise inner
            except Exception as e:
                raise DBAPIError("connect", None, e) from e
        except Exception as outer:
            return outer

    pooler = wrapped(pg.InternalServerError("(ENOTFOUND) tenant/user postgres.secretref not found"))
    assert classify_database_error(pooler) == "database_user_wrong"

    odd = wrapped(pg.FeatureNotSupportedError("something about postgres.secretref"))
    assert classify_database_error(odd) == "database_error"
    signature = error_signature(odd)
    assert signature == "DBAPIError>FeatureNotSupportedError(0A000): something about …"
    assert "secretref" not in signature

    breaker = wrapped(pg.InternalServerError("(EAUTHBREAKER) too many authentication errors"))
    assert classify_database_error(breaker) == "database_temporarily_blocked"
    unknown = wrapped(pg.InternalServerError("(ESOMETHING) host db.ref.supabase.co said 42"))
    assert error_signature(unknown).endswith(": (ESOMETHING) host … said …")


def test_database_password_replaces_the_one_in_the_url() -> None:
    s = Settings(
        database_url="postgresql://postgres.ref:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres",
        database_password="n3w p@ss/word:#",
    )
    from sqlalchemy.engine import make_url

    url = make_url(s.database_url)
    assert url.password == "n3w p@ss/word:#"
    assert url.drivername == "postgresql+asyncpg"
    assert url.host == "aws-0-eu-west-1.pooler.supabase.com"
    assert url.username == "postgres.ref"
    assert Settings(database_url="postgresql://u:keep@h/db").database_url.endswith("u:keep@h/db")


async def test_worker_backs_off_when_the_database_rejects_credentials(
    settings_env: pytest.MonkeyPatch,
) -> None:
    import asyncpg.exceptions as pg
    from sqlalchemy.exc import DBAPIError

    import app.workers.loop as loop_module

    calls = {"jobs": 0, "dispatch": 0}

    async def rejecting_job(*_: Any) -> None:
        calls["jobs"] += 1
        try:
            raise pg.InvalidPasswordError("password authentication failed")
        except Exception as e:
            raise DBAPIError("connect", None, e) from e

    async def dispatch(*_: Any) -> None:
        calls["dispatch"] += 1

    settings_env.setenv("WORKER_TICK_SECONDS", "0.01")
    settings_env.setenv("TELEGRAM_BOT_TOKEN", "")
    settings_env.setattr(loop_module, "run_job", rejecting_job)
    settings_env.setattr(loop_module, "dispatch_due", dispatch)
    stop = asyncio.Event()
    task = asyncio.create_task(loop_module.run_loop(stop))
    await asyncio.sleep(0.3)  # ~30 normal ticks
    stop.set()
    await asyncio.wait_for(task, timeout=2)
    assert calls == {"jobs": 1, "dispatch": 0}  # one attempt, then a long pause
