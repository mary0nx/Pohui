"""ASGI middleware: request body size limit and security headers for API responses."""

from __future__ import annotations

import json
import time
import uuid
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_body

UPLOAD_PATH_MARKERS = ("/documents/upload", "/finance/import")


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, default_limit: int, upload_limit: int) -> None:
        self.app = app
        self.default_limit = default_limit
        self.upload_limit = upload_limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path: str = scope.get("path", "")
        limit = (
            self.upload_limit
            if any(m in path for m in UPLOAD_PATH_MARKERS)
            else self.default_limit
        )
        headers = dict(scope.get("headers") or [])
        declared = headers.get(b"content-length")
        if declared is not None:
            try:
                if int(declared) > limit:
                    await _send_413(send)
                    return
            except ValueError:
                await _send_413(send)
                return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    raise _TooLarge()
            return message

        try:
            await self.app(scope, limited_receive, send)
        except _TooLarge:
            await _send_413(send)


class _TooLarge(Exception):
    pass


async def _send_413(send: Send) -> None:
    body = json.dumps(error_body("payload_too_large", "Слишком большой запрос")).encode()
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())],
        }
    )
    await send({"type": "http.response.body", "body": body})


class SecurityHeadersMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = uuid.uuid4().hex[:16]
        started = time.perf_counter()

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers: list[Any] = list(message.get("headers", []))
                existing = {h[0].lower() for h in headers}
                extra = [
                    (b"x-content-type-options", b"nosniff"),
                    (b"referrer-policy", b"no-referrer"),
                    (b"x-request-id", request_id.encode()),
                    (b"server-timing", f"app;dur={(time.perf_counter() - started) * 1000:.1f}".encode()),
                ]
                if b"cache-control" not in existing:
                    extra.append((b"cache-control", b"no-store"))
                message["headers"] = headers + extra
            await send(message)

        await self.app(scope, receive, send_wrapper)
