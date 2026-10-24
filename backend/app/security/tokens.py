"""Opaque random tokens (sessions, invitations) and short-lived signed tokens (downloads)."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from typing import Any


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def sign_payload(payload: dict[str, Any], key: bytes, ttl_seconds: int, purpose: str) -> str:
    body = {**payload, "exp": int(time.time()) + ttl_seconds, "p": purpose}
    raw = _b64(json.dumps(body, separators=(",", ":"), sort_keys=True).encode())
    sig = _b64(hmac.new(key, raw.encode(), hashlib.sha256).digest())
    return f"{raw}.{sig}"


def verify_payload(token: str, key: bytes, purpose: str) -> dict[str, Any] | None:
    try:
        raw, sig = token.split(".", 1)
        expected = _b64(hmac.new(key, raw.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(expected, sig):
            return None
        body: dict[str, Any] = json.loads(_unb64(raw))
    except (ValueError, json.JSONDecodeError):
        return None
    if body.get("p") != purpose or int(body.get("exp", 0)) < time.time():
        return None
    return body
