from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import DB, Ctx
from app.models import LifeItem
from app.models.enums import LifeItemKind, LifeItemStatus
from app.modules.life import service
from app.modules.life.schemas import (
    CheckinIn,
    HabitCreate,
    HabitOut,
    LifeItemCreate,
    LifeItemOut,
    LifeItemPatch,
)
from app.security.access import get_visible

router = APIRouter(prefix="/families/{family_id}/life", tags=["life"])


@router.get("/items", response_model=list[LifeItemOut])
async def items(ctx: Ctx, db: DB, kind: LifeItemKind | None = None, status: LifeItemStatus | None = None) -> list[LifeItemOut]:
    return [LifeItemOut.model_validate(i) for i in await service.list_items(db, ctx, kind, status)]


@router.post("/items", response_model=LifeItemOut, status_code=201)
async def create(body: LifeItemCreate, ctx: Ctx, db: DB) -> LifeItemOut:
    item = await service.create_item(db, ctx, body)
    out = LifeItemOut.model_validate(item)
    await db.commit()
    return out


@router.get("/items/{item_id}", response_model=LifeItemOut)
async def get_item(item_id: uuid.UUID, ctx: Ctx, db: DB) -> LifeItemOut:
    return LifeItemOut.model_validate(await get_visible(db, LifeItem, item_id, ctx))


@router.patch("/items/{item_id}", response_model=LifeItemOut)
async def patch(item_id: uuid.UUID, body: LifeItemPatch, ctx: Ctx, db: DB) -> LifeItemOut:
    item = await service.update_item(db, ctx, item_id, body)
    out = LifeItemOut.model_validate(item)
    await db.commit()
    return out


@router.delete("/items/{item_id}", status_code=204)
async def delete(item_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_item(db, ctx, item_id)
    await db.commit()


@router.get("/habits", response_model=list[HabitOut])
async def habits(ctx: Ctx, db: DB) -> list[HabitOut]:
    return await service.list_habits(db, ctx)


@router.post("/habits", response_model=list[HabitOut], status_code=201)
async def create_habit(body: HabitCreate, ctx: Ctx, db: DB) -> list[HabitOut]:
    await service.create_habit(db, ctx, body)
    await db.commit()
    return await service.list_habits(db, ctx)


@router.post("/habits/{habit_id}/checkin", response_model=list[HabitOut])
async def check(habit_id: uuid.UUID, body: CheckinIn, ctx: Ctx, db: DB) -> list[HabitOut]:
    await service.checkin(db, ctx, habit_id, body.day, True)
    await db.commit()
    return await service.list_habits(db, ctx)


@router.post("/habits/{habit_id}/uncheck", response_model=list[HabitOut])
async def uncheck(habit_id: uuid.UUID, body: CheckinIn, ctx: Ctx, db: DB) -> list[HabitOut]:
    await service.checkin(db, ctx, habit_id, body.day, False)
    await db.commit()
    return await service.list_habits(db, ctx)


@router.delete("/habits/{habit_id}", status_code=204)
async def archive(habit_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.archive_habit(db, ctx, habit_id)
    await db.commit()
