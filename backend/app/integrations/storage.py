"""File storage abstraction: local directory (default) or S3-compatible bucket.

Files are stored under random keys and never exposed by a permanent public URL.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Protocol

from app.config import get_settings
from app.core.errors import ServiceUnavailable

log = logging.getLogger(__name__)


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    def stream(self, key: str) -> AsyncIterator[bytes]: ...
    async def delete(self, key: str) -> None: ...
    def presigned_url(self, key: str, filename: str, ttl_seconds: int) -> str | None: ...


class LocalStorage:
    def __init__(self, root: str) -> None:
        self.root = Path(root).resolve()

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root):  # defence against path traversal in keys
            raise ValueError("invalid storage key")
        return path

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)

        def _write() -> None:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(".part")
            with open(tmp, "wb") as fh:
                fh.write(data)
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, path)

        await asyncio.to_thread(_write)

    async def stream(self, key: str) -> AsyncIterator[bytes]:
        path = self._path(key)
        if not path.exists():
            raise FileNotFoundError(key)
        fh = await asyncio.to_thread(open, path, "rb")
        try:
            while chunk := await asyncio.to_thread(fh.read, 64 * 1024):
                yield chunk
        finally:
            fh.close()

    async def delete(self, key: str) -> None:
        path = self._path(key)
        await asyncio.to_thread(path.unlink, True)

    def presigned_url(self, key: str, filename: str, ttl_seconds: int) -> str | None:
        return None  # served by the API through a signed download token


class S3Storage:
    def __init__(self) -> None:
        import boto3
        from botocore.config import Config

        s = get_settings()
        if not (s.storage_bucket and s.storage_access_key.get_secret_value()):
            raise ServiceUnavailable("Хранилище S3 не настроено", code="storage_not_configured")
        self.bucket = s.storage_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=s.storage_endpoint or None,
            region_name=s.storage_region,
            aws_access_key_id=s.storage_access_key.get_secret_value(),
            aws_secret_access_key=s.storage_secret_key.get_secret_value(),
            config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
        )

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )

    async def stream(self, key: str) -> AsyncIterator[bytes]:
        obj = await asyncio.to_thread(self.client.get_object, Bucket=self.bucket, Key=key)
        body = obj["Body"]
        try:
            while chunk := await asyncio.to_thread(body.read, 64 * 1024):
                yield chunk
        finally:
            body.close()

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    def presigned_url(self, key: str, filename: str, ttl_seconds: int) -> str | None:
        return str(
            self.client.generate_presigned_url(
                "get_object",
                Params={
                    "Bucket": self.bucket,
                    "Key": key,
                    "ResponseContentDisposition": f'attachment; filename="{filename}"',
                },
                ExpiresIn=ttl_seconds,
            )
        )


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        s = get_settings()
        _storage = S3Storage() if s.storage_backend == "s3" else LocalStorage(s.storage_local_path)
    return _storage


def set_storage(storage: Storage | None) -> None:
    global _storage
    _storage = storage


async def delete_files_quietly(keys: list[str]) -> None:
    """Remove files after the DB transaction committed; failures are logged, not raised."""
    if not keys:
        return
    storage = get_storage()
    for key in keys:
        try:
            await storage.delete(key)
        except Exception:
            log.warning("failed to delete stored file", extra={"ctx": {"key": key}})
