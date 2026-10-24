"""Integration test setup: a real PostgreSQL test database migrated with Alembic."""

from __future__ import annotations

import os

os.environ.update(
    {
        "APP_ENV": "test",
        "DEV_AUTH_ENABLED": "true",
        "DATABASE_URL": os.environ.get(
            "TEST_DATABASE_URL",
            "postgresql+asyncpg://familyos:familyos@localhost:5432/familyos_test",
        ),
        "REDIS_URL": "",
        "TELEGRAM_BOT_TOKEN": "123456:TEST-TOKEN-not-real",
        "TELEGRAM_BOT_USERNAME": "family_os_test_bot",
        "APP_SECRET_KEY": "test-secret-key-that-is-long-enough-123456",
        "OPENAI_API_KEY": "",
        "AI_MODEL": "",
        "RATE_LIMIT_PER_MINUTE": "100000",
        "AUTH_RATE_LIMIT_PER_MINUTE": "100000",
    }
)

import tempfile  # noqa: E402
from collections.abc import AsyncIterator  # noqa: E402
from dataclasses import dataclass  # noqa: E402
from pathlib import Path  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.rate_limit import get_rate_limiter  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_sessionmaker  # noqa: E402
from app.integrations.storage import LocalStorage, set_storage  # noqa: E402

BACKEND = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session", autouse=True)
def migrated_database() -> None:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    # Exercise the full migration chain in both directions on every run.
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")


@pytest.fixture(autouse=True)
async def clean_tables() -> AsyncIterator[None]:
    yield
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with get_sessionmaker()() as session:
        await session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        await session.commit()
    get_rate_limiter().reset()


@pytest.fixture(autouse=True)
def temp_storage() -> AsyncIterator[None]:
    with tempfile.TemporaryDirectory() as tmp:
        set_storage(LocalStorage(tmp))
        yield
        set_storage(None)


@pytest.fixture
async def client() -> AsyncIterator[AsyncClient]:
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@dataclass
class Actor:
    """A logged-in test user bound to an HTTP client."""

    client: AsyncClient
    token: str
    user_id: str
    name: str
    family_id: str | None = None

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def f(self, path: str = "") -> str:
        assert self.family_id, "actor has no family"
        return f"/api/v1/families/{self.family_id}{path}"

    async def get(self, url: str, **kw: Any) -> Any:
        return await self.client.get(url, headers=self.headers, **kw)

    async def post(self, url: str, json: Any = None, **kw: Any) -> Any:
        headers = {**self.headers, **kw.pop("headers", {})}
        return await self.client.post(url, json=json, headers=headers, **kw)

    async def patch(self, url: str, json: Any = None) -> Any:
        return await self.client.patch(url, json=json, headers=self.headers)

    async def put(self, url: str, json: Any = None) -> Any:
        return await self.client.put(url, json=json, headers=self.headers)

    async def delete(self, url: str) -> Any:
        return await self.client.delete(url, headers=self.headers)


async def login(client: AsyncClient, telegram_id: int, name: str) -> Actor:
    r = await client.post("/api/v1/auth/dev", json={"telegram_id": telegram_id, "first_name": name})
    assert r.status_code == 200, r.text
    data = r.json()
    return Actor(
        client=client,
        token=data["token"],
        user_id=data["me"]["user"]["id"],
        name=name,
        family_id=data["me"]["active_family_id"],
    )


async def create_family(actor: Actor, name: str = "Семья") -> str:
    r = await actor.post("/api/v1/families", {"name": name, "currency": "PLN"})
    assert r.status_code == 201, r.text
    actor.family_id = r.json()["id"]
    return actor.family_id


async def invite_and_join(owner: Actor, guest: Actor) -> None:
    r = await owner.post(owner.f("/invitations"), {})
    assert r.status_code == 201, r.text
    r = await guest.post("/api/v1/invitations/accept", {"token": r.json()["token"]})
    assert r.status_code == 200, r.text
    guest.family_id = owner.family_id


@pytest.fixture
async def alice(client: AsyncClient) -> Actor:
    return await login(client, 1001, "Алиса")


@pytest.fixture
async def bob(client: AsyncClient) -> Actor:
    return await login(client, 1002, "Борис")


@pytest.fixture
async def eve(client: AsyncClient) -> Actor:
    """Member of a different family; must never see Alice's or Bob's data."""
    actor = await login(client, 6666, "Ева")
    await create_family(actor, "Чужая семья")
    return actor


@pytest.fixture
async def couple(alice: Actor, bob: Actor) -> tuple[Actor, Actor]:
    await create_family(alice, "Мы")
    await invite_and_join(alice, bob)
    return alice, bob
