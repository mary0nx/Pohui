from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.time import utcnow
from app.models import AuditLog, ShoppingItem, ShoppingList, User
from app.models.enums import ItemStatus, NotificationCategory
from app.modules.notifications.service import notify_family
from app.modules.shopping.schemas import (
    HistoryOut,
    ItemCreate,
    ItemOut,
    ItemPatch,
    ListCreate,
    ListDetail,
    ListOut,
    ListPatch,
)
from app.security.access import FamilyContext, ensure_can_delete, get_visible

MAX_ITEMS_PER_LIST = 500


async def list_lists(db: AsyncSession, ctx: FamilyContext, include_archived: bool = False) -> list[ListOut]:
    stmt = (
        select(
            ShoppingList,
            func.count(ShoppingItem.id).label("total"),
            func.count(case((ShoppingItem.status == ItemStatus.needed, 1))).label("needed"),
        )
        .outerjoin(ShoppingItem, ShoppingItem.list_id == ShoppingList.id)
        .where(ShoppingList.family_id == ctx.family_id)
        .group_by(ShoppingList.id)
        .order_by(ShoppingList.archived_at.is_not(None), ShoppingList.created_at)
    )
    if not include_archived:
        stmt = stmt.where(ShoppingList.archived_at.is_(None))
    out = []
    for lst, total, needed in (await db.execute(stmt)).all():
        item = ListOut.model_validate(lst)
        item.items_total, item.items_needed = total, needed
        out.append(item)
    return out


async def get_list(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID) -> ShoppingList:
    return await get_visible(db, ShoppingList, list_id, ctx)


async def list_detail(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID) -> ListDetail:
    lst = await get_list(db, ctx, list_id)
    items = (
        await db.execute(
            select(ShoppingItem)
            .where(ShoppingItem.list_id == lst.id)
            .order_by(
                (ShoppingItem.status == ItemStatus.bought),
                ShoppingItem.category.nulls_last(),
                ShoppingItem.position,
                ShoppingItem.created_at,
            )
        )
    ).scalars().all()
    out = ListDetail.model_validate(lst)
    out.items = [ItemOut.model_validate(i) for i in items]
    out.items_total = len(items)
    out.items_needed = sum(1 for i in items if i.status == ItemStatus.needed)
    out.estimated_total = sum(
        (
            Decimal(i.estimated_price) * (Decimal(i.quantity) if i.quantity and i.unit in (None, "шт") else 1)
            for i in items
            if i.estimated_price is not None and i.status == ItemStatus.needed
        ),
        Decimal("0"),
    )
    return out


async def create_list(db: AsyncSession, ctx: FamilyContext, data: ListCreate) -> ShoppingList:
    count = await db.scalar(
        select(func.count()).select_from(ShoppingList).where(
            ShoppingList.family_id == ctx.family_id, ShoppingList.archived_at.is_(None)
        )
    )
    if (count or 0) >= 30:
        raise Conflict("Слишком много активных списков — архивируйте ненужные")
    lst = ShoppingList(family_id=ctx.family_id, name=data.name, created_by=ctx.user_id)
    db.add(lst)
    await db.flush()
    audit(db, ctx, "shopping.list.create", "shopping_list", lst.id, lst.name)
    return lst


async def update_list(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID, data: ListPatch) -> ShoppingList:
    lst = await get_list(db, ctx, list_id)
    if data.name is not None:
        audit(db, ctx, "shopping.list.rename", "shopping_list", lst.id, f"{lst.name} → {data.name}")
        lst.name = data.name
    if data.archived is not None:
        lst.archived_at = utcnow() if data.archived else None
        audit(db, ctx, "shopping.list.archive" if data.archived else "shopping.list.restore", "shopping_list", lst.id, lst.name)
    await db.flush()
    return lst


async def delete_list(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID, confirm: bool) -> None:
    lst = await get_list(db, ctx, list_id)
    ensure_can_delete(lst, ctx)
    items = await db.scalar(select(func.count()).select_from(ShoppingItem).where(ShoppingItem.list_id == lst.id))
    if items and not confirm:
        raise Conflict(
            "В списке есть товары. Подтвердите удаление или архивируйте список",
            code="confirmation_required",
            details={"items": items},
        )
    audit(db, ctx, "shopping.list.delete", "shopping_list", lst.id, lst.name)
    await db.delete(lst)


async def _ensure_capacity(db: AsyncSession, lst: ShoppingList, adding: int) -> None:
    count = await db.scalar(select(func.count()).select_from(ShoppingItem).where(ShoppingItem.list_id == lst.id))
    if (count or 0) + adding > MAX_ITEMS_PER_LIST:
        raise ValidationFailed(f"В списке может быть не больше {MAX_ITEMS_PER_LIST} товаров")


async def add_items(
    db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID, items: list[ItemCreate], *, merge: bool = True, notify: bool = True
) -> list[ShoppingItem]:
    lst = await get_list(db, ctx, list_id)
    if lst.archived_at is not None:
        raise ValidationFailed("Список в архиве")
    if not items:
        return []
    await _ensure_capacity(db, lst, len(items))
    existing = {
        i.name.lower(): i
        for i in (
            await db.execute(
                select(ShoppingItem).where(ShoppingItem.list_id == lst.id, ShoppingItem.status == ItemStatus.needed)
            )
        ).scalars()
    }
    max_pos = await db.scalar(select(func.coalesce(func.max(ShoppingItem.position), 0)).where(ShoppingItem.list_id == lst.id)) or 0
    result: list[ShoppingItem] = []
    for data in items:
        same = existing.get(data.name.lower()) if merge else None
        if same is not None and (same.unit or None) == (data.unit or None):
            # Merge duplicates of a still-needed item instead of creating a second line.
            if data.quantity is not None:
                same.quantity = (same.quantity or Decimal("0")) + data.quantity if same.quantity else data.quantity
            result.append(same)
            continue
        max_pos += 1
        item = ShoppingItem(
            family_id=ctx.family_id,
            list_id=lst.id,
            name=data.name.strip(),
            quantity=data.quantity,
            unit=data.unit,
            category=data.category,
            note=data.note,
            estimated_price=data.estimated_price,
            store=data.store,
            added_by=ctx.user_id,
            position=max_pos,
        )
        db.add(item)
        existing[item.name.lower()] = item
        result.append(item)
    lst.updated_at = utcnow()
    await db.flush()
    names = ", ".join(i.name for i in result[:5]) + ("…" if len(result) > 5 else "")
    audit(db, ctx, "shopping.item.add", "shopping_list", lst.id, f"{lst.name}: {names}")
    if notify:
        await notify_family(
            db,
            ctx,
            category=NotificationCategory.shopping_update,
            title=f"Покупки: {lst.name}",
            body=f"{ctx.user.first_name} добавил(а): {names}",
            dedupe_base=f"shop-add:{lst.id}:{result[0].id}",
            link=f"/home/shopping/{lst.id}",
        )
    return result


async def _get_item(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID, item_id: uuid.UUID) -> ShoppingItem:
    item = await db.scalar(
        select(ShoppingItem)
        .where(ShoppingItem.id == item_id, ShoppingItem.list_id == list_id, ShoppingItem.family_id == ctx.family_id)
        .with_for_update()
    )
    if item is None:
        raise NotFound("Товар не найден")
    return item


async def update_item(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID, item_id: uuid.UUID, data: ItemPatch) -> ShoppingItem:
    item = await _get_item(db, ctx, list_id, item_id)
    for field in ("name", "quantity", "unit", "category", "note", "estimated_price", "store"):
        if field in data.model_fields_set:
            setattr(item, field, getattr(data, field))
    if data.status is not None and data.status != item.status:
        item.status = data.status
        if data.status == ItemStatus.bought:
            item.bought_by, item.bought_at = ctx.user_id, utcnow()
            audit(db, ctx, "shopping.item.bought", "shopping_list", list_id, item.name)
        else:
            item.bought_by, item.bought_at = None, None
            audit(db, ctx, "shopping.item.unbought", "shopping_list", list_id, item.name)
    else:
        audit(db, ctx, "shopping.item.update", "shopping_list", list_id, item.name)
    await db.flush()
    return item


async def set_item_status(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID, item_id: uuid.UUID, status: ItemStatus) -> ShoppingItem:
    return await update_item(db, ctx, list_id, item_id, ItemPatch(status=status))


async def delete_item(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID, item_id: uuid.UUID) -> None:
    item = await _get_item(db, ctx, list_id, item_id)
    audit(db, ctx, "shopping.item.delete", "shopping_list", list_id, item.name)
    await db.delete(item)


async def clear_bought(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID) -> int:
    lst = await get_list(db, ctx, list_id)
    items = (
        await db.execute(select(ShoppingItem).where(ShoppingItem.list_id == lst.id, ShoppingItem.status == ItemStatus.bought))
    ).scalars().all()
    for i in items:
        await db.delete(i)
    if items:
        audit(db, ctx, "shopping.clear_bought", "shopping_list", lst.id, f"{lst.name}: {len(items)}")
    return len(items)


async def history(db: AsyncSession, ctx: FamilyContext, list_id: uuid.UUID, limit: int = 50) -> list[HistoryOut]:
    lst = await get_list(db, ctx, list_id)
    rows = (
        await db.execute(
            select(AuditLog, User.first_name)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(AuditLog.family_id == ctx.family_id, AuditLog.entity_type == "shopping_list", AuditLog.entity_id == lst.id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [HistoryOut(action=a.action, summary=a.summary, actor_name=n, created_at=a.created_at) for a, n in rows]


async def search_items(db: AsyncSession, ctx: FamilyContext, query: str | None, only_needed: bool = True, limit: int = 100) -> list[tuple[ShoppingItem, ShoppingList]]:
    stmt = (
        select(ShoppingItem, ShoppingList)
        .join(ShoppingList, ShoppingList.id == ShoppingItem.list_id)
        .where(ShoppingItem.family_id == ctx.family_id, ShoppingList.archived_at.is_(None))
    )
    if only_needed:
        stmt = stmt.where(ShoppingItem.status == ItemStatus.needed)
    if query:
        stmt = stmt.where(ShoppingItem.name.ilike(f"%{query.replace('%', '')}%"))
    return [(i, lst) for i, lst in (await db.execute(stmt.order_by(ShoppingList.created_at, ShoppingItem.position).limit(limit))).all()]


async def default_list(db: AsyncSession, ctx: FamilyContext) -> ShoppingList:
    lst = await db.scalar(
        select(ShoppingList)
        .where(ShoppingList.family_id == ctx.family_id, ShoppingList.archived_at.is_(None))
        .order_by(ShoppingList.created_at)
        .limit(1)
    )
    if lst is None:
        lst = await create_list(db, ctx, ListCreate(name="Покупки"))
    return lst
