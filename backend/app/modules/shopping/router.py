from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.deps import DB, Ctx, IdempotencyKeyHeader
from app.core.idempotency import Idempotency
from app.modules.shopping import service
from app.modules.shopping.parse import parse_items
from app.modules.shopping.schemas import (
    BulkText,
    HistoryOut,
    ItemCreate,
    ItemOut,
    ItemPatch,
    ListCreate,
    ListDetail,
    ListOut,
    ListPatch,
)

router = APIRouter(prefix="/families/{family_id}/shopping", tags=["shopping"])


@router.get("/lists", response_model=list[ListOut])
async def lists(ctx: Ctx, db: DB, include_archived: bool = False) -> list[ListOut]:
    return await service.list_lists(db, ctx, include_archived)


@router.post("/lists", response_model=ListOut, status_code=201)
async def create_list(body: ListCreate, ctx: Ctx, db: DB) -> ListOut:
    lst = await service.create_list(db, ctx, body)
    await db.commit()
    return ListOut.model_validate(lst)


@router.get("/lists/{list_id}", response_model=ListDetail)
async def get_list(list_id: uuid.UUID, ctx: Ctx, db: DB) -> ListDetail:
    return await service.list_detail(db, ctx, list_id)


@router.patch("/lists/{list_id}", response_model=ListDetail)
async def patch_list(list_id: uuid.UUID, body: ListPatch, ctx: Ctx, db: DB) -> ListDetail:
    await service.update_list(db, ctx, list_id, body)
    await db.commit()
    return await service.list_detail(db, ctx, list_id)


@router.delete("/lists/{list_id}", status_code=204)
async def delete_list(list_id: uuid.UUID, ctx: Ctx, db: DB, confirm: bool = False) -> None:
    await service.delete_list(db, ctx, list_id, confirm)
    await db.commit()


@router.get("/lists/{list_id}/history", response_model=list[HistoryOut])
async def list_history(list_id: uuid.UUID, ctx: Ctx, db: DB) -> list[HistoryOut]:
    return await service.history(db, ctx, list_id)


@router.post("/lists/{list_id}/items", response_model=list[ItemOut], status_code=201)
async def add_item(
    list_id: uuid.UUID, body: ItemCreate, ctx: Ctx, db: DB, idempotency_key: IdempotencyKeyHeader = None
):  # type: ignore[no-untyped-def]
    idem = Idempotency(db, ctx.user_id, idempotency_key, f"shop:{list_id}", body)
    if (replay := await idem.begin()) is not None:
        return replay
    items = await service.add_items(db, ctx, list_id, [body])
    out = [ItemOut.model_validate(i) for i in items]
    await idem.finish(201, out)
    return out


@router.post("/lists/{list_id}/items/bulk", response_model=list[ItemOut], status_code=201)
async def add_bulk(
    list_id: uuid.UUID, body: BulkText, ctx: Ctx, db: DB, idempotency_key: IdempotencyKeyHeader = None
):  # type: ignore[no-untyped-def]
    idem = Idempotency(db, ctx.user_id, idempotency_key, f"shop-bulk:{list_id}", body)
    if (replay := await idem.begin()) is not None:
        return replay
    items = await service.add_items(db, ctx, list_id, parse_items(body.text))
    out = [ItemOut.model_validate(i) for i in items]
    await idem.finish(201, out)
    return out


@router.patch("/lists/{list_id}/items/{item_id}", response_model=ItemOut)
async def patch_item(list_id: uuid.UUID, item_id: uuid.UUID, body: ItemPatch, ctx: Ctx, db: DB) -> ItemOut:
    item = await service.update_item(db, ctx, list_id, item_id, body)
    out = ItemOut.model_validate(item)
    await db.commit()
    return out


@router.delete("/lists/{list_id}/items/{item_id}", status_code=204)
async def delete_item(list_id: uuid.UUID, item_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_item(db, ctx, list_id, item_id)
    await db.commit()


@router.post("/lists/{list_id}/clear-bought", response_model=ListDetail)
async def clear_bought(list_id: uuid.UUID, ctx: Ctx, db: DB) -> ListDetail:
    await service.clear_bought(db, ctx, list_id)
    await db.commit()
    return await service.list_detail(db, ctx, list_id)
