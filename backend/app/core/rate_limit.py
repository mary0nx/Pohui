"""Fixed-window rate limiter: Redis when REDIS_URL is set, in-process memory otherwise."""

from __future__ import annotations

import logging
import time

from app.config import get_settings
from app.core.errors import RateLimited

log = logging.getLogger(__name__)


class RateLimiter:
    def __init__(self, redis_url: str = "") -> None:
        self._redis = None
        if redis_url:
            import redis.asyncio as aioredis

            self._redis = aioredis.from_url(redis_url, socket_timeout=1.0)
        self._memory: dict[str, tuple[int, int]] = {}

    async def hit(self, key: str, limit: int, window_seconds: int = 60) -> None:
        window = int(time.time() // window_seconds)
        bucket = f"rl:{key}:{window}"
        if self._redis is not None:
            try:
                pipe = self._redis.pipeline()
                pipe.incr(bucket)
                pipe.expire(bucket, window_seconds + 5)
                count, _ = await pipe.execute()
            except Exception:  # Redis outage must not take the API down.
                log.warning("rate limiter redis unavailable, falling back to memory")
                count = self._memory_hit(bucket, window)
        else:
            count = self._memory_hit(bucket, window)
        if int(count) > limit:
            raise RateLimited()

    def _memory_hit(self, bucket: str, window: int) -> int:
        if len(self._memory) > 50_000:
            self._memory = {k: v for k, v in self._memory.items() if v[1] == window}
        count, _ = self._memory.get(bucket, (0, window))
        self._memory[bucket] = (count + 1, window)
        return count + 1

    def reset(self) -> None:
        self._memory.clear()


_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(get_settings().redis_url)
    return _limiter
