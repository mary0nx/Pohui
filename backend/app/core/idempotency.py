"""Idempotency-Key support for create endpoints.

The key row is inserted in the same DB transaction as the business change, so a retried
request either sees the stored response or waits on the unique index for the first one.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, ValidationFailed
from app.models.system import IdempotencyKey


class Idempotency:
    def __init__(
        self, db: AsyncSession, user_id: uuid.UUID, key: str | None, scope: str, payload: Any
    ) -> None:
        self.db = db
        self.user_id = user_id
        self.key = f"{scope}:{key}" if key else None
        if key is not None and not (8 <= len(key) <= 64):
            raise ValidationFailed("Idempotency-Key должен быть длиной 8–64 символа")
        body = json.dumps(jsonable_encoder(payload), sort_keys=True, default=str)
        self.request_hash = hashlib.sha256(f"{scope}|{body}".encode()).hexdigest()
        self._row_id: uuid.UUID | None = None

    async def begin(self) -> JSONResponse | None:
        if self.key is None:
            return None
        stmt = (
            insert(IdempotencyKey)
            .values(
                id=uuid.uuid4(), user_id=self.user_id, key=self.key, request_hash=self.request_hash
            )
            .on_conflict_do_nothing(index_elements=["user_id", "key"])
            .returning(IdempotencyKey.id)
        )
        self._row_id = (await self.db.execute(stmt)).scalar_one_or_none()
        if self._row_id is not None:
            return None
        existing = (
            await self.db.execute(
                select(IdempotencyKey).where(
                    IdempotencyKey.user_id == self.user_id, IdempotencyKey.key == self.key
                )
            )
        ).scalar_one()
        if existing.request_hash != self.request_hash:
            raise ValidationFailed(
                "Idempotency-Key уже использован с другими данными", code="idempotency_mismatch"
            )
        if existing.status_code is None:
            raise Conflict("Запрос уже обрабатывается", code="idempotency_in_progress")
        return JSONResponse(status_code=existing.status_code, content=existing.response_body)

    async def finish(self, status_code: int, body: BaseModel | Any) -> None:
        if self._row_id is not None:
            row = await self.db.get(IdempotencyKey, self._row_id)
            assert row is not None
            row.status_code = status_code
            row.response_body = jsonable_encoder(body)
        await self.db.commit()
