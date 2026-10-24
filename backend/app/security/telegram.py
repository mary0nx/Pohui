"""Validation of Telegram Mini App initData (https://core.telegram.org/bots/webapps).

data_check_string = all fields except `hash`, sorted by key, joined as "key=value" with "\n".
secret_key = HMAC_SHA256(key="WebAppData", msg=bot_token)
valid iff hex(HMAC_SHA256(key=secret_key, msg=data_check_string)) == hash
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl

from app.core.errors import Unauthorized

CLOCK_SKEW_SECONDS = 60


@dataclass(frozen=True, slots=True)
class TelegramUser:
    id: int
    first_name: str
    last_name: str | None
    username: str | None
    language_code: str | None
    photo_url: str | None


@dataclass(frozen=True, slots=True)
class InitData:
    user: TelegramUser
    auth_date: int
    start_param: str | None
    data_hash: str


def _secret_key(bot_token: str) -> bytes:
    return hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()


def sign_init_data(fields: dict[str, str], bot_token: str) -> str:
    """Build a signed initData string. Used by tests and local tooling only."""
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    digest = hmac.new(_secret_key(bot_token), check.encode(), hashlib.sha256).hexdigest()
    from urllib.parse import urlencode

    return urlencode({**fields, "hash": digest})


def validate_init_data(
    init_data: str, bot_token: str, *, max_age_seconds: int, now: float | None = None
) -> InitData:
    if not bot_token:
        raise Unauthorized("Telegram-авторизация не настроена", code="telegram_not_configured")
    if not init_data or len(init_data) > 8192:
        raise Unauthorized("Некорректные данные авторизации", code="invalid_init_data")
    try:
        pairs = parse_qsl(init_data, keep_blank_values=True, strict_parsing=True)
    except ValueError as exc:
        raise Unauthorized("Некорректные данные авторизации", code="invalid_init_data") from exc

    fields: dict[str, str] = {}
    for key, value in pairs:
        if key in fields:  # duplicated keys are never produced by Telegram
            raise Unauthorized("Некорректные данные авторизации", code="invalid_init_data")
        fields[key] = value

    received_hash = fields.pop("hash", "")
    if not received_hash:
        raise Unauthorized("Подпись отсутствует", code="invalid_init_data")
    check = "\n".join(f"{k}={v}" for k, v in sorted(fields.items()))
    expected = hmac.new(_secret_key(bot_token), check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise Unauthorized("Подпись Telegram недействительна", code="invalid_signature")

    try:
        auth_date = int(fields.get("auth_date", ""))
    except ValueError as exc:
        raise Unauthorized("Некорректная дата авторизации", code="invalid_init_data") from exc
    current = time.time() if now is None else now
    if auth_date > current + CLOCK_SKEW_SECONDS:
        raise Unauthorized("Некорректная дата авторизации", code="invalid_init_data")
    if current - auth_date > max_age_seconds:
        raise Unauthorized(
            "Данные авторизации устарели, откройте приложение заново", code="init_data_expired"
        )

    try:
        raw_user = json.loads(fields["user"])
        user = TelegramUser(
            id=int(raw_user["id"]),
            first_name=str(raw_user.get("first_name") or "")[:128] or "Без имени",
            last_name=(str(raw_user["last_name"])[:128] if raw_user.get("last_name") else None),
            username=(str(raw_user["username"])[:64] if raw_user.get("username") else None),
            language_code=(
                str(raw_user["language_code"])[:16] if raw_user.get("language_code") else None
            ),
            photo_url=(str(raw_user["photo_url"])[:512] if raw_user.get("photo_url") else None),
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise Unauthorized("Нет данных пользователя", code="invalid_init_data") from exc
    if raw_user.get("is_bot"):
        raise Unauthorized("Боты не могут входить в приложение", code="invalid_init_data")

    return InitData(
        user=user,
        auth_date=auth_date,
        start_param=fields.get("start_param") or None,
        data_hash=hashlib.sha256(received_hash.encode()).hexdigest(),
    )
