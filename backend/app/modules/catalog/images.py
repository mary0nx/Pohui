"""Thumbnails for shopping items.

Bundled images ("local:<code>") always work in production: the SVGs ship with the frontend
(`/products/<code>.svg`). An external image search can be plugged in through
`ExternalImageSource`, but none is configured — there is no default provider and no made-up
API. Whatever source is used, an item may only store a bundled image or an https URL on an
allow-listed host (IMAGE_ALLOWED_HOSTS), and external lookups go through a cache and a
per-family rate limit.
"""

from __future__ import annotations

import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlsplit

from app.config import get_settings
from app.core.errors import ValidationFailed
from app.modules.catalog.service import KNOWN_IMAGES

_LOCAL = re.compile(r"^local:([0-9a-f]{2,6}(?:-[0-9a-f]{2,6}){0,4})$")


def validate_image_ref(ref: str | None) -> str | None:
    """Accept a bundled image or an https URL on an allow-listed host; reject anything else."""
    if ref is None or ref == "":
        return None
    m = _LOCAL.match(ref)
    if m:
        if m.group(1) not in KNOWN_IMAGES:
            raise ValidationFailed("Неизвестное изображение", code="image_not_allowed")
        return ref
    parts = urlsplit(ref)
    allowed = {h.lower() for h in get_settings().image_allowed_hosts}
    if (
        parts.scheme == "https"
        and parts.hostname
        and parts.hostname.lower() in allowed
        and not parts.username
        and len(ref) <= 300
    ):
        return ref
    raise ValidationFailed("Изображение из неразрешённого источника", code="image_not_allowed")


@dataclass(frozen=True)
class ImageCandidate:
    url: str
    title: str


class ExternalImageSource(Protocol):
    """A licensed image search (e.g. a stock-photo API with a key kept on the server)."""

    async def search(self, query: str, limit: int) -> list[ImageCandidate]: ...


def external_source() -> ExternalImageSource | None:
    """No external source is configured in this project; plug one in here."""
    return None


class CachedImageSearch:
    """Cache + per-family rate limit + URL allow-list around an external source."""

    def __init__(
        self,
        source: ExternalImageSource,
        *,
        ttl_seconds: float = 24 * 3600,
        per_minute: int = 10,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.source = source
        self.ttl = ttl_seconds
        self.per_minute = per_minute
        self.clock = clock
        self._cache: dict[str, tuple[float, list[ImageCandidate]]] = {}
        self._calls: dict[str, list[float]] = {}

    async def search(self, family_key: str, query: str, limit: int = 6) -> list[ImageCandidate]:
        now = self.clock()
        key = query.strip().lower()
        hit = self._cache.get(key)
        if hit and now - hit[0] < self.ttl:
            return hit[1][:limit]
        calls = [t for t in self._calls.get(family_key, []) if now - t < 60]
        if len(calls) >= self.per_minute:
            return []  # over the limit: the caller falls back to local results
        self._calls[family_key] = [*calls, now]
        try:
            found = await self.source.search(query, limit)
        except Exception:
            return []  # an outage of the image source never blocks adding an item
        safe = []
        for c in found:
            try:
                validate_image_ref(c.url)
            except ValidationFailed:
                continue
            safe.append(c)
        self._cache[key] = (now, safe)
        return safe[:limit]
