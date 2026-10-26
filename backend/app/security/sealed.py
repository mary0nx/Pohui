"""Encryption at rest for small personal values (home and work addresses).

AES-256-GCM with a key derived from APP_SECRET_KEY by HKDF, one key per purpose, a random
96-bit nonce per value and the purpose bound as associated data. A database dump alone does
not reveal where a member lives.
"""

from __future__ import annotations

import base64
import json
import os
from functools import lru_cache
from typing import Any

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import get_settings

VERSION = "v1"


class SealedError(ValueError):
    """The value cannot be decrypted (wrong key, tampered or corrupted)."""


@lru_cache(maxsize=8)
def _key(secret: bytes, purpose: str) -> bytes:
    return HKDF(
        algorithm=hashes.SHA256(), length=32, salt=b"family-os/sealed", info=purpose.encode()
    ).derive(secret)


def seal(value: dict[str, Any], purpose: str) -> str:
    key = _key(get_settings().secret_key_bytes(), purpose)
    nonce = os.urandom(12)
    raw = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
    box = AESGCM(key).encrypt(nonce, raw, purpose.encode())
    return f"{VERSION}.{base64.urlsafe_b64encode(nonce + box).decode()}"


def unseal(token: str, purpose: str) -> dict[str, Any]:
    try:
        version, body = token.split(".", 1)
        if version != VERSION:
            raise SealedError("unknown version")
        data = base64.urlsafe_b64decode(body)
        key = _key(get_settings().secret_key_bytes(), purpose)
        raw = AESGCM(key).decrypt(data[:12], data[12:], purpose.encode())
        value = json.loads(raw)
    except (ValueError, InvalidTag) as exc:
        raise SealedError("cannot open sealed value") from exc
    if not isinstance(value, dict):
        raise SealedError("unexpected sealed value")
    return value
