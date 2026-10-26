"""Web Push: encryption, VAPID signature, subscriptions and delivery through the dispatcher."""

import base64
import json
import os
import struct
from datetime import UTC, datetime
from typing import Any

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from httpx import AsyncClient
from sqlalchemy import select, update

from app.bot import logic
from app.db.session import get_sessionmaker
from app.integrations import webpush
from app.models import Notification, NotificationSettings, PushSubscription
from app.models.enums import NotificationCategory, NotificationStatus
from app.modules.notifications.service import enqueue
from app.workers.dispatch import dispatch_due
from tests.conftest import Actor
from tests.test_worker import FakeSender, start_bot

APPLE = "https://web.push.apple.com/QGuQyavXutnMH-example"


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class Device:
    """A browser's push keys, able to decrypt what the server sends (RFC 8291)."""

    def __init__(self, endpoint: str = APPLE) -> None:
        self.endpoint = endpoint
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.public = self.key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.auth = os.urandom(16)

    @property
    def json(self) -> dict[str, Any]:
        return {
            "endpoint": self.endpoint,
            "keys": {"p256dh": b64(self.public), "auth": b64(self.auth)},
        }

    def decrypt(self, body: bytes) -> bytes:
        salt, (rs, idlen) = body[:16], struct.unpack(">IB", body[16:21])
        assert rs == 4096 and idlen == 65
        as_public = body[21:86]
        peer = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), as_public)
        shared = self.key.exchange(ec.ECDH(), peer)

        def hkdf(s: bytes, ikm: bytes, info: bytes, n: int) -> bytes:
            return HKDF(algorithm=hashes.SHA256(), length=n, salt=s, info=info).derive(ikm)

        ikm = hkdf(self.auth, shared, b"WebPush: info\x00" + self.public + as_public, 32)
        cek = hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
        nonce = hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
        plain = AESGCM(cek).decrypt(nonce, body[86:], None)
        assert plain.endswith(b"\x02")
        return plain[:-1]


class FakePush:
    def __init__(self, outcomes: list[str] | None = None) -> None:
        self.outcomes = outcomes or []
        self.sent: list[tuple[str, dict[str, Any]]] = []

    async def send(self, endpoint: str, p256dh: str, auth: str, payload: dict[str, Any]) -> str:
        outcome = self.outcomes.pop(0) if self.outcomes else "ok"
        if outcome == "ok":
            self.sent.append((endpoint, payload))
        return outcome


@pytest.fixture
def fake_push() -> Any:
    push = FakePush()
    webpush.set_push_sender(push)  # type: ignore[arg-type]
    yield push
    webpush.set_push_sender(None)


def test_payload_is_readable_only_by_the_device() -> None:
    device = Device()
    sub = device.json["keys"]
    body = webpush.encrypt('{"title":"Ужин"}'.encode(), sub["p256dh"], sub["auth"])
    assert device.decrypt(body) == '{"title":"Ужин"}'.encode()
    assert "Ужин".encode() not in body
    with pytest.raises(Exception):  # noqa: B017 - any AES-GCM failure
        Device().decrypt(body)


def test_vapid_signature_and_stable_key() -> None:
    header = webpush.vapid_authorization(APPLE)
    token, key = header.removeprefix("vapid t=").split(", k=")
    assert key == webpush.vapid_public_key()  # derived from APP_SECRET_KEY, stable
    head, body, sig = token.split(".")
    claims = json.loads(webpush.unb64url(body))
    assert claims["aud"] == "https://web.push.apple.com" and claims["sub"].startswith("https://")
    raw = webpush.unb64url(sig)
    public = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), webpush.unb64url(key))
    public.verify(
        encode_dss_signature(int.from_bytes(raw[:32]), int.from_bytes(raw[32:])),
        f"{head}.{body}".encode(),
        ec.ECDSA(hashes.SHA256()),
    )


def test_only_browser_push_services_are_accepted() -> None:
    for ok in [
        APPLE,
        "https://fcm.googleapis.com/fcm/send/abc",
        "https://updates.push.services.mozilla.com/wpush/v2/x",
        "https://wns2-db5p.notify.windows.com/w/?token=1",
    ]:
        assert webpush.valid_endpoint(ok), ok
    for bad in [
        "http://web.push.apple.com/x",
        "https://evil.com/web.push.apple.com",
        "https://web.push.apple.com.evil.com/x",
        "https://localhost/x",
        "https://user@web.push.apple.com/x",
        "https://web.push.apple.com:8443/x",
        "https://169.254.169.254/latest",
    ]:
        assert not webpush.valid_endpoint(bad), bad


async def signed_in_device(client: AsyncClient, tg_id: int) -> dict[str, str]:
    """A home-screen app signed in through the bot; returns its auth headers."""
    r = await client.post("/api/v1/auth/link/start", json={"standalone": True})
    poll, code = r.json()["poll_token"], r.json()["bot_url"].split("start=", 1)[1]
    async with get_sessionmaker()() as db:
        reply = await logic.start(db, tg_id, "X", None, "ru", code)
        rid = reply.buttons[0][0][1].split(":", 2)[2]
        import uuid

        await logic.resolve_login(db, tg_id, "X", None, "ru", uuid.UUID(rid), True)
    out = (await client.post("/api/v1/auth/link/poll", json={"poll_token": poll})).json()
    return {"Authorization": f"Bearer {out['auth']['token']}"}


async def notify(
    user_id: str, family_id: str | None, key: str, title: str = "Ужин в 19:00"
) -> None:
    import uuid

    async with get_sessionmaker()() as db:
        await enqueue(
            db,
            user_id=uuid.UUID(user_id),
            family_id=uuid.UUID(family_id) if family_id else None,
            category=NotificationCategory.event_reminder,
            title=title,
            body="Через 30 минут",
            link="/calendar",
            dedupe_key=key,
        )
        await db.commit()


async def test_subscribe_and_receive_on_own_device_only(
    client: AsyncClient, couple: tuple[Actor, Actor], fake_push: FakePush
) -> None:
    alice, bob = couple
    headers = await signed_in_device(client, 1001)
    device = Device()
    r = await client.post("/api/v1/push/subscriptions", json=device.json, headers=headers)
    assert r.status_code == 204, r.text
    assert (await alice.get("/api/v1/auth/devices")).json()[0]["push"] is True
    # A foreign or malformed endpoint is refused.
    bad = {**device.json, "endpoint": "https://evil.example/hook"}
    assert (
        await client.post("/api/v1/push/subscriptions", json=bad, headers=headers)
    ).status_code == 422
    bad = {**device.json, "keys": {"p256dh": "A" * 87, "auth": "B" * 22}}
    assert (
        await client.post("/api/v1/push/subscriptions", json=bad, headers=headers)
    ).status_code == 422

    await notify(alice.user_id, alice.family_id, "a1")
    await notify(bob.user_id, bob.family_id, "b1", "Только для Бориса")
    stats = await dispatch_due(get_sessionmaker(), FakeSender(), "Europe/Warsaw")
    assert stats.sent == 1 and stats.skipped == 1  # Bob has neither the bot nor a device
    assert fake_push.sent == [
        (
            APPLE,
            {
                "title": "Ужин в 19:00",
                "body": "Через 30 минут",
                "url": "/calendar",
                "tag": fake_push.sent[0][1]["tag"],
                "badge": 1,
            },
        )
    ]
    # Test button: this device only.
    r = await client.post("/api/v1/push/test", headers=headers)
    assert r.json() == {"sent": 1}
    assert (await alice.post("/api/v1/push/test")).json() == {"sent": 0}


async def test_push_without_telegram_and_never_twice(
    client: AsyncClient, couple: tuple[Actor, Actor], fake_push: FakePush
) -> None:
    alice, _ = couple
    await start_bot(alice)
    headers = await signed_in_device(client, 1001)
    await client.post("/api/v1/push/subscriptions", json=Device().json, headers=headers)
    # Telegram fails temporarily: the push went out once and is not repeated on the retry.
    from app.integrations.telegram import TelegramTemporaryError

    sender = FakeSender([TelegramTemporaryError("down")])
    await notify(alice.user_id, alice.family_id, "x1")
    sm = get_sessionmaker()
    await dispatch_due(sm, sender, "Europe/Warsaw")
    async with sm() as db:
        n = await db.scalar(select(Notification))
        assert n.status == NotificationStatus.pending and n.push_sent_at is not None
        await db.execute(update(Notification).values(scheduled_for=datetime.now(UTC)))
        await db.commit()
    await dispatch_due(sm, sender, "Europe/Warsaw")
    assert len(fake_push.sent) == 1 and len(sender.sent) == 1
    # Telegram messages switched off: the phone still gets the push.
    async with sm() as db:
        db.add(NotificationSettings(user_id=n.user_id, telegram_enabled=False))
        await db.commit()
    await notify(alice.user_id, alice.family_id, "x2")
    stats = await dispatch_due(sm, sender, "Europe/Warsaw")
    assert stats.sent == 1 and len(fake_push.sent) == 2 and len(sender.sent) == 1


async def test_signed_out_or_removed_devices_get_nothing(
    client: AsyncClient, couple: tuple[Actor, Actor], fake_push: FakePush
) -> None:
    alice, _ = couple
    phone = await signed_in_device(client, 1001)
    laptop = await signed_in_device(client, 1001)
    await client.post("/api/v1/push/subscriptions", json=Device().json, headers=phone)
    await client.post(
        "/api/v1/push/subscriptions",
        json=Device("https://fcm.googleapis.com/fcm/send/laptop").json,
        headers=laptop,
    )
    # The phone is signed out from the laptop's device list.
    devices = (await client.get("/api/v1/auth/devices", headers=laptop)).json()
    phone_id = next(d["id"] for d in devices if not d["current"])
    assert (
        await client.delete(f"/api/v1/auth/devices/{phone_id}", headers=laptop)
    ).status_code == 204
    # The laptop removed the app: the push service answers 410 and the subscription is dropped.
    fake_push.outcomes = ["gone"]
    await notify(alice.user_id, alice.family_id, "z1")
    stats = await dispatch_due(get_sessionmaker(), None, "Europe/Warsaw")
    assert fake_push.sent == []
    assert stats.postponed == 1  # no device and no Telegram: waits for the bot as before
    async with get_sessionmaker()() as db:
        assert (await db.scalars(select(PushSubscription))).all() == []
    # Unsubscribing from the app itself.
    await client.post("/api/v1/push/subscriptions", json=Device().json, headers=laptop)
    r = await client.request(
        "DELETE", "/api/v1/push/subscriptions", json={"endpoint": APPLE}, headers=laptop
    )
    assert r.status_code == 204
    async with get_sessionmaker()() as db:
        assert (await db.scalars(select(PushSubscription))).all() == []


async def test_push_respects_quiet_hours_and_categories(
    client: AsyncClient, couple: tuple[Actor, Actor], fake_push: FakePush
) -> None:
    alice, _ = couple
    headers = await signed_in_device(client, 1001)
    await client.post("/api/v1/push/subscriptions", json=Device().json, headers=headers)
    settings = (await alice.get("/api/v1/notifications/settings")).json()
    now = datetime.now(UTC)
    settings.update(
        quiet_start=f"{(now.hour - 1) % 24:02d}:00",
        quiet_end=f"{(now.hour + 2) % 24:02d}:00",
        timezone="UTC",
        telegram_enabled=False,
    )
    settings["categories"]["event_reminder"] = True
    assert (await alice.put("/api/v1/notifications/settings", settings)).status_code == 200
    await notify(alice.user_id, alice.family_id, "q1")
    stats = await dispatch_due(get_sessionmaker(), None, "Europe/Warsaw")
    assert stats.postponed == 1 and fake_push.sent == []
    settings.update(quiet_start=None, quiet_end=None)
    settings["categories"]["event_reminder"] = False
    await alice.put("/api/v1/notifications/settings", settings)
    async with get_sessionmaker()() as db:
        await db.execute(update(Notification).values(scheduled_for=datetime.now(UTC)))
        await db.commit()
    stats = await dispatch_due(get_sessionmaker(), None, "Europe/Warsaw")
    assert stats.skipped == 1 and fake_push.sent == []


async def test_web_push_request_and_answers() -> None:
    import httpx

    device = Device()
    seen: list[httpx.Request] = []
    answers = iter([201, 410, 429, 400])

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(next(answers))

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        sender = webpush.WebPushSender(http)
        keys = device.json["keys"]
        results = [
            await sender.send(APPLE, keys["p256dh"], keys["auth"], {"title": "Т"}) for _ in range(4)
        ]
        assert results == ["ok", "gone", "retry", "failed"]
        # A foreign endpoint is never contacted.
        assert (
            await sender.send("https://evil.example/x", keys["p256dh"], keys["auth"], {}) == "gone"
        )
    assert len(seen) == 4
    req = seen[0]
    assert req.headers["Content-Encoding"] == "aes128gcm" and req.headers["TTL"] == "86400"
    assert req.headers["Authorization"].startswith("vapid t=")
    assert json.loads(device.decrypt(req.content)) == {"title": "Т"}
