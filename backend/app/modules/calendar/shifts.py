"""Work schedule: each member marks days as day or night shifts (shown as colored days).

Shifts are personal: every request works on the current user's own schedule.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DB, Ctx
from app.core.errors import ValidationFailed
from app.core.schemas import ORMModel
from app.models import WorkShift
from app.models.enums import ShiftKind
from app.security.access import FamilyContext

MAX_RANGE_DAYS = 400
PATTERN_CODES = {"D": ShiftKind.day, "N": ShiftKind.night, "O": None}

router = APIRouter(prefix="/families/{family_id}/calendar/shifts", tags=["calendar"])


class ShiftOut(ORMModel):
    day: date
    kind: ShiftKind


class ShiftSet(BaseModel):
    kind: ShiftKind | None = None  # None = day off (removes the shift)


class ShiftGenerate(BaseModel):
    """Fill [start, end] by repeating `pattern` (D = day, N = night, O = off) from `anchor`."""

    pattern: str = Field(min_length=1, max_length=62, pattern=r"^[DNO]+$")
    anchor: date
    start: date
    end: date

    @model_validator(mode="after")
    def _check(self) -> ShiftGenerate:
        if self.end < self.start:
            raise ValueError("Дата окончания раньше начала")
        if (self.end - self.start).days >= MAX_RANGE_DAYS:
            raise ValueError(f"Период не больше {MAX_RANGE_DAYS} дней")
        if set(self.pattern) == {"O"}:
            raise ValueError("В шаблоне нет ни одной смены")
        return self


class GenerateOut(BaseModel):
    day_shifts: int
    night_shifts: int


def _check_range(date_from: date, date_to: date) -> None:
    if date_to < date_from or (date_to - date_from).days >= MAX_RANGE_DAYS:
        raise ValidationFailed(f"Период от 1 до {MAX_RANGE_DAYS} дней")


async def list_shifts(
    db: AsyncSession, ctx: FamilyContext, date_from: date, date_to: date
) -> list[WorkShift]:
    _check_range(date_from, date_to)
    rows = await db.execute(
        select(WorkShift)
        .where(
            WorkShift.family_id == ctx.family_id,
            WorkShift.user_id == ctx.user_id,
            WorkShift.day >= date_from,
            WorkShift.day <= date_to,
        )
        .order_by(WorkShift.day)
    )
    return list(rows.scalars())


async def set_shift(
    db: AsyncSession, ctx: FamilyContext, day: date, kind: ShiftKind | None
) -> None:
    if kind is None:
        await db.execute(
            delete(WorkShift).where(
                WorkShift.family_id == ctx.family_id,
                WorkShift.user_id == ctx.user_id,
                WorkShift.day == day,
            )
        )
        return
    stmt = insert(WorkShift).values(
        family_id=ctx.family_id, user_id=ctx.user_id, day=day, kind=kind
    )
    await db.execute(
        stmt.on_conflict_do_update(
            index_elements=["family_id", "user_id", "day"], set_={"kind": stmt.excluded.kind}
        )
    )


async def clear_range(db: AsyncSession, ctx: FamilyContext, date_from: date, date_to: date) -> int:
    _check_range(date_from, date_to)
    result = await db.execute(
        delete(WorkShift).where(
            WorkShift.family_id == ctx.family_id,
            WorkShift.user_id == ctx.user_id,
            WorkShift.day >= date_from,
            WorkShift.day <= date_to,
        )
    )
    return int(result.rowcount or 0)  # type: ignore[attr-defined]


def pattern_days(body: ShiftGenerate) -> list[tuple[date, ShiftKind]]:
    size = len(body.pattern)
    out: list[tuple[date, ShiftKind]] = []
    day = body.start
    while day <= body.end:
        kind = PATTERN_CODES[body.pattern[(day - body.anchor).days % size]]
        if kind is not None:
            out.append((day, kind))
        day += timedelta(days=1)
    return out


async def generate(db: AsyncSession, ctx: FamilyContext, body: ShiftGenerate) -> GenerateOut:
    """Replaces the schedule inside [start, end]; days outside the period stay untouched."""
    await clear_range(db, ctx, body.start, body.end)
    days = pattern_days(body)
    if days:
        await db.execute(
            insert(WorkShift),
            [
                {"family_id": ctx.family_id, "user_id": ctx.user_id, "day": d, "kind": k}
                for d, k in days
            ],
        )
    return GenerateOut(
        day_shifts=sum(1 for _, k in days if k == ShiftKind.day),
        night_shifts=sum(1 for _, k in days if k == ShiftKind.night),
    )


@router.get("", response_model=list[ShiftOut])
async def get_shifts(
    ctx: Ctx,
    db: DB,
    date_from: Annotated[date, Query()],
    date_to: Annotated[date, Query()],
) -> list[ShiftOut]:
    return [ShiftOut.model_validate(s) for s in await list_shifts(db, ctx, date_from, date_to)]


@router.put("/{day}", status_code=204)
async def put_shift(day: date, body: ShiftSet, ctx: Ctx, db: DB) -> None:
    await set_shift(db, ctx, day, body.kind)
    await db.commit()


@router.post("/generate", response_model=GenerateOut)
async def post_generate(body: ShiftGenerate, ctx: Ctx, db: DB) -> GenerateOut:
    out = await generate(db, ctx, body)
    await db.commit()
    return out


@router.delete("", status_code=204)
async def delete_shifts(
    ctx: Ctx,
    db: DB,
    date_from: Annotated[date, Query()],
    date_to: Annotated[date, Query()],
) -> None:
    await clear_range(db, ctx, date_from, date_to)
    await db.commit()
