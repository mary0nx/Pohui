"""Web Push subscriptions of the current device."""

from __future__ import annotations

from cryptography.hazmat.primitives.asymmetric import ec
from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.api.deps import DB, CurrentSession
from app.core.errors import ValidationFailed
from app.integrations.webpush import unb64url, valid_endpoint, vapid_public_key
from app.models import PushSubscription
from app.modules.push.service import live_subscriptions, push_to

router = APIRouter(prefix="/push", tags=["push"])


class Keys(BaseModel):
    p256dh: str = Field(min_length=80, max_length=128)
    auth: str = Field(min_length=16, max_length=64)


class SubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1024)
    keys: Keys


class EndpointIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1024)


class PushKey(BaseModel):
    public_key: str


class PushTestOut(BaseModel):
    sent: int


@router.get("/key", response_model=PushKey)
async def key() -> PushKey:
    return PushKey(public_key=vapid_public_key())


@router.post("/subscriptions", status_code=204)
async def subscribe(body: SubscriptionIn, session: CurrentSession, db: DB) -> None:
    if not valid_endpoint(body.endpoint):
        raise ValidationFailed("Неизвестный сервис уведомлений")
    try:
        # The browser's key must be a real P-256 point, or encryption would fail later.
        ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), unb64url(body.keys.p256dh))
        ok = len(unb64url(body.keys.auth)) >= 16
    except ValueError:
        ok = False
    if not ok:
        raise ValidationFailed("Неверные ключи подписки")
    sub = await db.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)
    )
    if sub is None:
        sub = PushSubscription(endpoint=body.endpoint)
        db.add(sub)
    # The same browser signed in as someone else takes the subscription over.
    sub.user_id = session.user_id
    sub.session_id = session.id
    sub.p256dh = body.keys.p256dh
    sub.auth = body.keys.auth
    await db.commit()


@router.delete("/subscriptions", status_code=204)
async def unsubscribe(body: EndpointIn, session: CurrentSession, db: DB) -> None:
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.endpoint == body.endpoint,
            PushSubscription.user_id == session.user_id,
        )
    )
    await db.commit()


@router.post("/test", response_model=PushTestOut)
async def test_push(session: CurrentSession, db: DB) -> PushTestOut:
    """Sends a test notification to this device only."""
    subs = await live_subscriptions(db, session.user_id, session.id)
    outcomes = await push_to(
        subs,
        db,
        {
            "title": "Family OS",
            "body": "Уведомления на этом устройстве работают 👍",
            "url": "/profile",
            "tag": "test",
        },
    )
    await db.commit()
    return PushTestOut(sent=outcomes.count("ok"))
