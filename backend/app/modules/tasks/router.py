from __future__ import annotations

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.api.deps import DB, Ctx, IdempotencyKeyHeader
from app.core.idempotency import Idempotency
from app.models import Task
from app.modules.shopping.schemas import HistoryOut
from app.modules.tasks import service
from app.modules.tasks.schemas import CommentCreate, CommentOut, TaskCreate, TaskOut, TaskPatch, TaskStats
from app.security.access import get_visible

router = APIRouter(prefix="/families/{family_id}/tasks", tags=["tasks"])


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    ctx: Ctx,
    db: DB,
    status: Literal["open", "done", "all"] = "open",
    assignee: Annotated[str | None, Query(max_length=40)] = None,
    due: Literal["overdue", "today", "week"] | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[TaskOut]:
    return await service.list_tasks(db, ctx, status=status, assignee=assignee, due=due, q=q, limit=limit, offset=offset)


@router.get("/stats", response_model=TaskStats)
async def task_stats(ctx: Ctx, db: DB) -> TaskStats:
    return await service.stats(db, ctx)


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(body: TaskCreate, ctx: Ctx, db: DB, idempotency_key: IdempotencyKeyHeader = None):  # type: ignore[no-untyped-def]
    idem = Idempotency(db, ctx.user_id, idempotency_key, f"task:{ctx.family_id}", body)
    if (replay := await idem.begin()) is not None:
        return replay
    task = await service.create_task(db, ctx, body)
    out = await service.task_out(db, task)
    await idem.finish(201, out)
    return out


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(task_id: uuid.UUID, ctx: Ctx, db: DB) -> TaskOut:
    return await service.task_out(db, await get_visible(db, Task, task_id, ctx))


@router.patch("/{task_id}", response_model=TaskOut)
async def patch_task(task_id: uuid.UUID, body: TaskPatch, ctx: Ctx, db: DB) -> TaskOut:
    task = await service.update_task(db, ctx, task_id, body)
    out = await service.task_out(db, task)
    await db.commit()
    return out


@router.post("/{task_id}/complete", response_model=TaskOut)
async def complete(task_id: uuid.UUID, ctx: Ctx, db: DB) -> TaskOut:
    task, _ = await service.complete_task(db, ctx, task_id)
    out = await service.task_out(db, task)
    await db.commit()
    return out


@router.delete("/{task_id}", status_code=204)
async def delete_task(task_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_task(db, ctx, task_id)
    await db.commit()


@router.get("/{task_id}/comments", response_model=list[CommentOut])
async def comments(task_id: uuid.UUID, ctx: Ctx, db: DB) -> list[CommentOut]:
    out = []
    for c, name in await service.list_comments(db, ctx, task_id):
        item = CommentOut.model_validate(c)
        item.author_name = name
        out.append(item)
    return out


@router.post("/{task_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(task_id: uuid.UUID, body: CommentCreate, ctx: Ctx, db: DB) -> CommentOut:
    c = await service.add_comment(db, ctx, task_id, body)
    out = CommentOut.model_validate(c)
    out.author_name = ctx.user.first_name
    await db.commit()
    return out


@router.get("/{task_id}/history", response_model=list[HistoryOut])
async def history(task_id: uuid.UUID, ctx: Ctx, db: DB) -> list[HistoryOut]:
    return await service.task_history(db, ctx, task_id)
