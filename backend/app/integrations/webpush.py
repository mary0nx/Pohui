"""Web Push to installed home-screen apps (Safari on iOS 16.4+, Chrome, Firefox, Edge).

* VAPID (RFC 8292): the server's P-256 key is derived from APP_SECRET_KEY, so nothing new has
  to be configured and the key survives restarts. Changing APP_SECRET_KEY changes the key;
  devices then subscribe again the next time the app is opened.
* Payload encryption (RFC 8291, aes128gcm): only the subscribed device can read the message;
  Apple / Google push servers see an opaque blob.
* Only endpoints of the known browser push services are accepted, so a subscription can never
  make the server send requests to an arbitrary address.
"""

from __future__ import annotations

import base64
import json
import os
import struct
import time
from functools import lru_cache
from typing import Any, Literal, Protocol
from urllib.parse import urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import get_settings

PUSH_HOSTS = (
    "push.apple.com",
    "fcm.googleapis.com",
    "push.services.mozilla.com",
    "notify.windows.com",
)
Outcome = Literal["ok", "gone", "retry", "failed"]
# P-256 group order: a derived scalar must lie in [1, n-1].
_P256_N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def unb64url(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def valid_endpoint(url: str) -> bool:
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    host = (parts.hostname or "").lower()
    return (
        parts.scheme == "https"
        and parts.port in (None, 443)
        and not parts.username
        and any(host == h or host.endswith("." + h) for h in PUSH_HOSTS)
    )


@lru_cache
def _vapid_key(secret: bytes) -> ec.EllipticCurvePrivateKey:
    seed = HKDF(
        algorithm=hashes.SHA256(), length=48, salt=b"familyos-vapid-v1", info=b"p256"
    ).derive(secret)
    scalar = int.from_bytes(seed, "big") % (_P256_N - 1) + 1
    return ec.derive_private_key(scalar, ec.SECP256R1())


def vapid_key() -> ec.EllipticCurvePrivateKey:
    return _vapid_key(get_settings().secret_key_bytes())


def _raw_public(key: ec.EllipticCurvePublicKey) -> bytes:
    return key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )


def vapid_public_key() -> str:
    """applicationServerKey for PushManager.subscribe (base64url, uncompressed point)."""
    return b64url(_raw_public(vapid_key().public_key()))


def vapid_authorization(endpoint: str, now: float | None = None) -> str:
    parts = urlsplit(endpoint)
    frontend = get_settings().frontend_url.rstrip("/")
    claims = {
        "aud": f"{parts.scheme}://{parts.netloc}",
        "exp": int((now or time.time()) + 12 * 3600),
        # Contact of the sender; push services accept an https URL here.
        "sub": frontend
        if frontend.startswith("https://")
        else "https://github.com/yurypatsko-ctrl/Pohui",
    }
    head = b64url(json.dumps({"typ": "JWT", "alg": "ES256"}, separators=(",", ":")).encode())
    body = b64url(json.dumps(claims, separators=(",", ":")).encode())
    signing_input = f"{head}.{body}".encode()
    r, s = decode_dss_signature(vapid_key().sign(signing_input, ec.ECDSA(hashes.SHA256())))
    sig = b64url(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    return f"vapid t={head}.{body}.{sig}, k={vapid_public_key()}"


def _hkdf(salt: bytes, ikm: bytes, info: bytes, length: int) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=length, salt=salt, info=info).derive(ikm)


def encrypt(
    plaintext: bytes,
    p256dh: str,
    auth: str,
    *,
    salt: bytes | None = None,
    server_key: ec.EllipticCurvePrivateKey | None = None,
) -> bytes:
    """RFC 8291 message encryption, a single aes128gcm record."""
    ua_public = unb64url(p256dh)
    auth_secret = unb64url(auth)
    if len(ua_public) != 65 or len(auth_secret) < 16:
        raise ValueError("invalid subscription keys")
    salt = salt or os.urandom(16)
    as_key = server_key or ec.generate_private_key(ec.SECP256R1())
    as_public = _raw_public(as_key.public_key())
    peer = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ua_public)
    shared = as_key.exchange(ec.ECDH(), peer)
    ikm = _hkdf(auth_secret, shared, b"WebPush: info\x00" + ua_public + as_public, 32)
    cek = _hkdf(salt, ikm, b"Content-Encoding: aes128gcm\x00", 16)
    nonce = _hkdf(salt, ikm, b"Content-Encoding: nonce\x00", 12)
    record = AESGCM(cek).encrypt(nonce, plaintext + b"\x02", None)  # \x02: last record
    header = salt + struct.pack(">IB", 4096, len(as_public)) + as_public
    return header + record


class PushSender(Protocol):
    async def send(
        self, endpoint: str, p256dh: str, auth: str, payload: dict[str, Any]
    ) -> Outcome: ...


class WebPushSender:
    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def send(self, endpoint: str, p256dh: str, auth: str, payload: dict[str, Any]) -> Outcome:
        if not valid_endpoint(endpoint):
            return "gone"
        try:
            body = encrypt(json.dumps(payload, ensure_ascii=False).encode(), p256dh, auth)
        except ValueError:
            return "gone"
        headers = {
            "Authorization": vapid_authorization(endpoint),
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            "TTL": "86400",
            "Urgency": "normal",
        }
        try:
            if self._client is not None:
                r = await self._client.post(endpoint, content=body, headers=headers)
            else:
                async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
                    r = await client.post(endpoint, content=body, headers=headers)
        except httpx.HTTPError:
            return "retry"
        if r.status_code in (200, 201, 202):
            return "ok"
        if r.status_code in (404, 410):
            return "gone"  # the app was removed or notifications were turned off
        if r.status_code == 429 or r.status_code >= 500:
            return "retry"
        return "failed"


_sender: PushSender | None = None


def get_push_sender() -> PushSender:
    return _sender or WebPushSender()


def set_push_sender(sender: PushSender | None) -> None:
    """Tests replace the network sender."""
    global _sender
    _sender = sender
