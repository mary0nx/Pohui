import json
import time

import pytest

from app.core.errors import Unauthorized
from app.security.telegram import sign_init_data, validate_init_data

TOKEN = "123456:TEST-TOKEN-not-real"


def _fields(**over: str) -> dict[str, str]:
    base = {
        "auth_date": str(int(time.time())),
        "query_id": "AAH",
        "user": json.dumps({"id": 42, "first_name": "Анна", "username": "anna"}),
    }
    base.update(over)
    return base


def test_valid_init_data() -> None:
    data = validate_init_data(sign_init_data(_fields(), TOKEN), TOKEN, max_age_seconds=3600)
    assert data.user.id == 42
    assert data.user.first_name == "Анна"


def test_start_param_is_signed() -> None:
    raw = sign_init_data(_fields(start_param="inv_abc"), TOKEN)
    assert validate_init_data(raw, TOKEN, max_age_seconds=60).start_param == "inv_abc"


@pytest.mark.parametrize(
    "mutate",
    [
        lambda s: s.replace("anna", "mallory"),  # tampered user
        lambda s: s + "&extra=1",  # added field
        lambda s: s.replace("hash=", "hash=0"),  # broken hash
    ],
)
def test_tampering_is_rejected(mutate) -> None:  # type: ignore[no-untyped-def]
    raw = mutate(sign_init_data(_fields(), TOKEN))
    with pytest.raises(Unauthorized):
        validate_init_data(raw, TOKEN, max_age_seconds=3600)


def test_wrong_bot_token_rejected() -> None:
    raw = sign_init_data(_fields(), "999:OTHER")
    with pytest.raises(Unauthorized):
        validate_init_data(raw, TOKEN, max_age_seconds=3600)


def test_expired_rejected() -> None:
    raw = sign_init_data(_fields(auth_date=str(int(time.time()) - 7200)), TOKEN)
    with pytest.raises(Unauthorized) as exc:
        validate_init_data(raw, TOKEN, max_age_seconds=3600)
    assert exc.value.code == "init_data_expired"


def test_future_auth_date_rejected() -> None:
    raw = sign_init_data(_fields(auth_date=str(int(time.time()) + 3600)), TOKEN)
    with pytest.raises(Unauthorized):
        validate_init_data(raw, TOKEN, max_age_seconds=3600)


def test_missing_hash_and_user() -> None:
    with pytest.raises(Unauthorized):
        validate_init_data("auth_date=1&user=%7B%7D", TOKEN, max_age_seconds=3600)
    with pytest.raises(Unauthorized):
        validate_init_data(
            sign_init_data({"auth_date": str(int(time.time()))}, TOKEN), TOKEN, max_age_seconds=60
        )


async def test_telegram_login_endpoint_and_replay(client) -> None:  # type: ignore[no-untyped-def]
    raw = sign_init_data(_fields(), TOKEN)
    r1 = await client.post("/api/v1/auth/telegram", json={"init_data": raw})
    assert r1.status_code == 200, r1.text
    t1 = r1.json()["token"]
    assert (
        await client.get("/api/v1/me", headers={"Authorization": f"Bearer {t1}"})
    ).status_code == 200

    # Replaying the same initData revokes the earlier session.
    r2 = await client.post("/api/v1/auth/telegram", json={"init_data": raw})
    t2 = r2.json()["token"]
    assert (
        await client.get("/api/v1/me", headers={"Authorization": f"Bearer {t1}"})
    ).status_code == 401
    assert (
        await client.get("/api/v1/me", headers={"Authorization": f"Bearer {t2}"})
    ).status_code == 200


async def test_forged_login_rejected(client) -> None:  # type: ignore[no-untyped-def]
    raw = sign_init_data(_fields(), "999:ATTACKER")
    r = await client.post("/api/v1/auth/telegram", json={"init_data": raw})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_signature"


async def test_requests_without_session_rejected(client) -> None:  # type: ignore[no-untyped-def]
    assert (await client.get("/api/v1/me")).status_code == 401
    r = await client.get("/api/v1/me", headers={"Authorization": "Bearer nonsense"})
    assert r.status_code == 401


async def test_logout_revokes(alice) -> None:  # type: ignore[no-untyped-def]
    assert (await alice.post("/api/v1/auth/logout")).status_code == 204
    assert (await alice.get("/api/v1/me")).status_code == 401
