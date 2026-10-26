"""Sign-in outside Telegram, confirmed in the bot; device list; long device sessions."""

import uuid
from datetime import timedelta

from httpx import AsyncClient
from sqlalchemy import update

from app.bot import logic
from app.core.time import utcnow
from app.db.session import get_sessionmaker
from app.models import LoginRequest, UserSession
from tests.conftest import Actor

IPHONE = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 "
    "(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
)


async def start(client: AsyncClient, standalone: bool = True) -> tuple[str, str]:
    r = await client.post(
        "/api/v1/auth/link/start", json={"standalone": standalone}, headers={"User-Agent": IPHONE}
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["bot_url"].startswith("https://t.me/family_os_test_bot?start=login_")
    assert data["app_url"] == data["bot_url"].replace(
        "https://t.me/family_os_test_bot?", "tg://resolve?domain=family_os_test_bot&"
    )
    return data["poll_token"], data["bot_url"].split("start=", 1)[1]


async def poll(client: AsyncClient, token: str) -> dict:  # type: ignore[type-arg]
    r = await client.post("/api/v1/auth/link/poll", json={"poll_token": token})
    assert r.status_code == 200, r.text
    return r.json()  # type: ignore[no-any-return]


async def bot_press(tg_id: int, code: str, approve: bool = True) -> tuple[str, str]:
    async with get_sessionmaker()() as db:
        reply = await logic.start(db, tg_id, "Алиса", None, "ru", code)
        if not reply.buttons:
            return reply.text, ""
        data = reply.buttons[0][0 if approve else 1][1]
        assert data.startswith("l:a:" if approve else "l:x:")
        rid = uuid.UUID(data.split(":", 2)[2])
        text = await logic.resolve_login(db, tg_id, "Алиса", None, "ru", rid, approve)
    return reply.text, text


async def test_sign_in_confirmed_in_bot(client: AsyncClient, couple: tuple[Actor, Actor]) -> None:
    alice, _ = couple
    token, code = await start(client)
    assert (await poll(client, token)) == {"status": "pending", "auth": None}
    ask, done = await bot_press(1001, code)
    assert "iPhone · приложение на экране" in ask and "Отклонить" in ask
    assert done.startswith("✅")
    out = await poll(client, token)
    assert out["status"] == "approved"
    me = out["auth"]["me"]
    assert me["user"]["id"] == alice.user_id and me["auth_method"] == "device"
    assert me["active_family_id"] == alice.family_id
    headers = {"Authorization": f"Bearer {out['auth']['token']}"}
    r = await client.get(f"/api/v1/families/{alice.family_id}/finance/accounts", headers=headers)
    assert r.status_code == 200
    # Spent: the same poll token never yields a second session.
    assert (await poll(client, token))["status"] == "expired"
    # The device list shows it; signing it out from another session ends it.
    listed = (await alice.get("/api/v1/auth/devices")).json()
    assert [(d["label"], d["current"]) for d in listed] == [
        ("iPhone · приложение на экране", False)
    ]
    mine = (await client.get("/api/v1/auth/devices", headers=headers)).json()
    assert mine[0]["current"] is True
    assert (await alice.delete(f"/api/v1/auth/devices/{listed[0]['id']}")).status_code == 204
    assert (await client.get("/api/v1/me", headers=headers)).status_code == 401
    assert (await alice.get("/api/v1/auth/devices")).json() == []


async def test_only_the_account_that_opened_the_link_can_approve(
    client: AsyncClient, couple: tuple[Actor, Actor]
) -> None:
    token, code = await start(client, standalone=False)
    async with get_sessionmaker()() as db:
        reply = await logic.start(db, 1001, "Алиса", None, "ru", code)
        assert "iPhone · Safari" in reply.text
        rid = uuid.UUID(reply.buttons[0][0][1].split(":", 2)[2])
        # Bob opening the same link or pressing Alice's button gets nothing.
        other = await logic.start(db, 1002, "Борис", None, "ru", code)
        assert not other.buttons and "устарела" in other.text
        denied = await logic.resolve_login(db, 1002, "Борис", None, "ru", rid, True)
        assert "не найден" in denied
    assert (await poll(client, token))["status"] == "pending"


async def test_rejected_expired_and_bad_codes(
    client: AsyncClient, couple: tuple[Actor, Actor]
) -> None:
    token, code = await start(client)
    _, text = await bot_press(1001, code, approve=False)
    assert text.startswith("✖️")
    assert (await poll(client, token))["status"] == "rejected"
    # A rejected request cannot be approved afterwards.
    again, _ = await bot_press(1001, code)
    assert "устарела" in again

    token, code = await start(client)
    async with get_sessionmaker()() as db:
        await db.execute(update(LoginRequest).values(expires_at=utcnow() - timedelta(seconds=1)))
        await db.commit()
    text, _ = await bot_press(1001, code)
    assert "устарела" in text
    assert (await poll(client, token))["status"] == "expired"

    for bad in ["login_short", "login_" + "x" * 80, "login_" + "a" * 32]:
        text, _ = await bot_press(1001, bad)
        assert "устарела" in text
    assert (await poll(client, "nonsense"))["status"] == "expired"
    # Telegram initData sign-in is untouched: a forged one is still refused.
    r = await client.post("/api/v1/auth/telegram", json={"init_data": "user=%7B%7D&hash=00"})
    assert r.status_code == 401


async def test_device_session_lasts_and_cannot_touch_other_devices(
    client: AsyncClient, couple: tuple[Actor, Actor], eve: Actor
) -> None:
    alice, bob = couple
    token, code = await start(client)
    await bot_press(1001, code)
    out = await poll(client, token)
    headers = {"Authorization": f"Bearer {out['auth']['token']}"}
    # A home-screen app session survives far longer than the 30-day Telegram limit.
    async with get_sessionmaker()() as db:
        await db.execute(
            update(UserSession)
            .where(UserSession.auth_method == "device")
            .values(
                created_at=utcnow() - timedelta(days=200),
                last_used_at=utcnow() - timedelta(days=10),
            )
        )
        await db.commit()
    assert (await client.get("/api/v1/me", headers=headers)).status_code == 200
    device_id = (await alice.get("/api/v1/auth/devices")).json()[0]["id"]
    # Nobody else can see or sign out Alice's device.
    assert (await bob.get("/api/v1/auth/devices")).json() == []
    assert (await bob.delete(f"/api/v1/auth/devices/{device_id}")).status_code == 404
    assert (await eve.delete(f"/api/v1/auth/devices/{device_id}")).status_code == 404
    # Logging out on the device itself ends it too.
    assert (await client.post("/api/v1/auth/logout", headers=headers)).status_code == 204
    assert (await client.get("/api/v1/me", headers=headers)).status_code == 401
    # A year after sign-in the session ends even when used every day.
    token, code = await start(client)
    await bot_press(1001, code)
    out = await poll(client, token)
    async with get_sessionmaker()() as db:
        await db.execute(
            update(UserSession)
            .where(UserSession.auth_method == "device", UserSession.revoked_at.is_(None))
            .values(created_at=utcnow() - timedelta(days=366))
        )
        await db.commit()
    r = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {out['auth']['token']}"})
    assert r.status_code == 401


async def test_cleanup_removes_old_login_requests(client: AsyncClient) -> None:
    from sqlalchemy import func, select

    from app.workers.jobs import cleanup

    await start(client)
    await start(client)
    async with get_sessionmaker()() as db:
        await db.execute(
            update(LoginRequest)
            .where(LoginRequest.id == select(LoginRequest.id).limit(1).scalar_subquery())
            .values(expires_at=utcnow() - timedelta(days=2))
        )
        res = await cleanup(db, utcnow())
        await db.commit()
        assert res["login_requests"] == 1
        assert await db.scalar(select(func.count()).select_from(LoginRequest)) == 1
