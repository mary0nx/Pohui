"""AI tools for shopping lists and household tasks."""

from __future__ import annotations

import uuid
from typing import Any, Literal
from zoneinfo import ZoneInfo

from pydantic import Field
from sqlalchemy import select

from app.ai.tools.common import ToolError, parse_local_datetime, resolve_member
from app.ai.tools.registry import Prepared, Tool, ToolArgs, ToolContext, register
from app.models import ShoppingItem, ShoppingList, Task
from app.models.enums import ItemStatus
from app.modules.shopping import service as shopping
from app.modules.shopping.parse import parse_items
from app.modules.tasks import service as tasks
from app.modules.tasks.schemas import TaskCreate
from app.security.access import get_visible


async def _find_list(tc: ToolContext, name: str | None) -> ShoppingList:
    if not name:
        return await shopping.default_list(tc.db, tc.ctx)
    lists = await shopping.list_lists(tc.db, tc.ctx)
    q = name.strip().lower()
    match = [x for x in lists if x.name.lower() == q] or [x for x in lists if q in x.name.lower()]
    if not match:
        raise ToolError(f"Список «{name}» не найден. Есть: {', '.join(x.name for x in lists)}")
    return await shopping.get_list(tc.db, tc.ctx, match[0].id)


class ShoppingSearchArgs(ToolArgs):
    query: str | None = Field(
        None, max_length=100, description="Название товара; пусто — все нужные товары"
    )


async def search_shopping(tc: ToolContext, a: ShoppingSearchArgs) -> dict[str, Any]:
    lists = await shopping.list_lists(tc.db, tc.ctx)
    items = await shopping.search_items(tc.db, tc.ctx, a.query, only_needed=True)
    return {
        "lists": [
            {"name": x.name, "needed": x.items_needed, "total": x.items_total} for x in lists
        ],
        "needed_items": [
            {
                "list": lst.name,
                "name": i.name,
                "quantity": str(i.quantity) if i.quantity else None,
                "unit": i.unit,
            }
            for i, lst in items
        ],
    }


register(
    Tool(
        "search_shopping_lists",
        "Списки покупок и товары, которые нужно купить.",
        ShoppingSearchArgs,
        "read",
        search_shopping,
    )
)


class AddItemsArgs(ToolArgs):
    items: list[str] = Field(
        min_length=1, max_length=50, description="Товары, можно с количеством: «молоко 2 л»"
    )
    list_name: str | None = Field(None, description="Название списка; по умолчанию основной")


async def prepare_add(tc: ToolContext, a: AddItemsArgs) -> Prepared:
    lst = await _find_list(tc, a.list_name)
    parsed = parse_items("\n".join(a.items))
    if not parsed:
        raise ToolError("Не удалось распознать товары")
    return Prepared(
        arguments={"list_id": str(lst.id), "items": [p.model_dump(mode="json") for p in parsed]},
        summary=f"Добавить в «{lst.name}»: {len(parsed)} шт.",
        details=[
            f"{p.name}" + (f" — {p.quantity} {p.unit or ''}".rstrip() if p.quantity else "")
            for p in parsed
        ],
    )


async def execute_add(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from app.modules.shopping.schemas import ItemCreate

    items = await shopping.add_items(
        tc.db,
        tc.ctx,
        uuid.UUID(args["list_id"]),
        [ItemCreate.model_validate(i) for i in args["items"]],
    )
    return {"added": [i.name for i in items]}


register(
    Tool(
        "add_shopping_items",
        "Добавить товары в список покупок.",
        AddItemsArgs,
        "auto",
        execute_add,
        prepare=prepare_add,
    )
)


class CompleteItemArgs(ToolArgs):
    item_name: str = Field(min_length=1, max_length=200)
    list_name: str | None = None


async def prepare_complete_item(tc: ToolContext, a: CompleteItemArgs) -> Prepared:
    lst = await _find_list(tc, a.list_name)
    items = (
        (
            await tc.db.execute(
                select(ShoppingItem).where(
                    ShoppingItem.list_id == lst.id, ShoppingItem.status == ItemStatus.needed
                )
            )
        )
        .scalars()
        .all()
    )
    q = a.item_name.strip().lower()
    match = [i for i in items if i.name.lower() == q] or [i for i in items if q in i.name.lower()]
    if not match:
        raise ToolError(f"В списке «{lst.name}» нет товара «{a.item_name}»")
    item = match[0]
    return Prepared(
        arguments={"list_id": str(lst.id), "item_id": str(item.id)},
        summary=f"Отметить купленным: {item.name}",
        details=[f"Список: {lst.name}"],
    )


async def execute_complete_item(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    item = await shopping.set_item_status(
        tc.db, tc.ctx, uuid.UUID(args["list_id"]), uuid.UUID(args["item_id"]), ItemStatus.bought
    )
    return {"bought": item.name}


register(
    Tool(
        "complete_shopping_item",
        "Отметить товар купленным.",
        CompleteItemArgs,
        "auto",
        execute_complete_item,
        prepare=prepare_complete_item,
    )
)


class PendingTasksArgs(ToolArgs):
    assignee: Literal["me", "all", "unassigned"] = "all"
    overdue_only: bool = False


async def pending_tasks(tc: ToolContext, a: PendingTasksArgs) -> dict[str, Any]:
    items = await tasks.list_tasks(
        tc.db,
        tc.ctx,
        status="open",
        assignee=None if a.assignee == "all" else a.assignee,
        due="overdue" if a.overdue_only else None,
        limit=50,
    )
    zone = ZoneInfo(tc.ctx.family.timezone)
    return {
        "tasks": [
            {
                "task_id": str(t.id),
                "title": t.title,
                "due": t.due_at.astimezone(zone).isoformat(timespec="minutes")
                if t.due_at
                else None,
                "overdue": t.overdue,
                "assignee_is_me": t.assignee_id == tc.ctx.user_id,
                "unassigned": t.assignee_id is None,
                "priority": t.priority,
            }
            for t in items
        ]
    }


register(
    Tool(
        "get_pending_tasks",
        "Незавершённые домашние задачи.",
        PendingTasksArgs,
        "read",
        pending_tasks,
    )
)


class CreateTaskArgs(ToolArgs):
    title: str = Field(min_length=1, max_length=200)
    due: str | None = Field(None, description="Срок ГГГГ-ММ-ДДTЧЧ:ММ по местному времени")
    assignee: str | None = Field(None, description="Имя участника или «я»; пусто — общая задача")
    priority: Literal["low", "normal", "high"] = "normal"
    private: bool = False


async def prepare_task(tc: ToolContext, a: CreateTaskArgs) -> Prepared:
    zone = tc.ctx.family.timezone
    due = parse_local_datetime(a.due, zone) if a.due else None
    assignee = await resolve_member(tc, a.assignee)
    details = []
    if due:
        details.append(f"Срок: {due.astimezone(ZoneInfo(zone)):%d.%m.%Y %H:%M}")
    details.append(
        "Исполнитель: " + ("вы" if assignee == tc.ctx.user_id else (a.assignee or "общая задача"))
    )
    if a.private:
        details.append("Видимость: личная")
    return Prepared(
        arguments={
            "title": a.title,
            "due_at": due.isoformat() if due else None,
            "assignee_id": str(assignee) if assignee else None,
            "priority": a.priority,
            "visibility": "private" if a.private else "family",
        },
        summary=f"Задача «{a.title}»",
        details=details,
    )


async def execute_task(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    task = await tasks.create_task(tc.db, tc.ctx, TaskCreate.model_validate(args))
    return {"created_task_id": str(task.id)}


register(
    Tool(
        "create_task",
        "Создать домашнюю задачу.",
        CreateTaskArgs,
        "auto",
        execute_task,
        prepare=prepare_task,
    )
)


class CompleteTaskArgs(ToolArgs):
    task_id: uuid.UUID


async def prepare_complete_task(tc: ToolContext, a: CompleteTaskArgs) -> Prepared:
    task = await get_visible(tc.db, Task, a.task_id, tc.ctx)
    return Prepared(
        arguments={"task_id": str(task.id)},
        summary=f"Отметить выполненной: {task.title}",
        details=[],
    )


async def execute_complete_task(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    task, nxt = await tasks.complete_task(tc.db, tc.ctx, uuid.UUID(args["task_id"]))
    return {"completed": task.title, "next_occurrence_created": nxt is not None}


register(
    Tool(
        "complete_task",
        "Отметить задачу выполненной (нужен task_id).",
        CompleteTaskArgs,
        "auto",
        execute_complete_task,
        prepare=prepare_complete_task,
    )
)
