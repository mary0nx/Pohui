"""Joint life: shared goals, wishlist, ideas/weekend plans, journal, personal notes, habits.

Personal notes, wishlist items and journal entries default to private.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import ValidationFailed
from app.core.time import local_today, utcnow
from app.models import Habit, HabitCheckin, LifeItem
from app.models.enums import LifeItemKind, LifeItemStatus, NotificationCategory, Visibility
from app.modules.life.schemas import HabitCreate, HabitOut, LifeItemCreate, LifeItemPatch
from app.modules.notifications.service import notify_family
from app.security.access import FamilyContext, ensure_can_delete, get_visible, visible

PRIVATE_BY_DEFAULT = {LifeItemKind.note, LifeItemKind.wish, LifeItemKind.journal}


async def list_items(
    db: AsyncSession, ctx: FamilyContext, kind: LifeItemKind | None, status: LifeItemStatus | None
) -> list[LifeItem]:
    stmt = select(LifeItem).where(visible(LifeItem, ctx))
    if kind:
        stmt = stmt.where(LifeItem.kind == kind)
    if status:
        stmt = stmt.where(LifeItem.status == status)
    stmt = stmt.order_by(
        LifeItem.status == LifeItemStatus.done,
        LifeItem.happened_on.desc().nulls_last(),
        LifeItem.created_at.desc(),
    )
    return list((await db.execute(stmt.limit(300))).scalars())


async def create_item(db: AsyncSession, ctx: FamilyContext, data: LifeItemCreate) -> LifeItem:
    visibility = data.visibility or (
        Visibility.private if data.kind in PRIVATE_BY_DEFAULT else Visibility.family
    )
    item = LifeItem(
        family_id=ctx.family_id,
        kind=data.kind,
        title=data.title,
        body=data.body,
        status=data.status,
        happened_on=data.happened_on
        or (local_today(ctx.family.timezone) if data.kind == LifeItemKind.journal else None),
        planned_for=data.planned_for,
        price=data.price,
        url=data.url,
        visibility=visibility,
        created_by=ctx.user_id,
        done_at=utcnow() if data.status == LifeItemStatus.done else None,
    )
    db.add(item)
    await db.flush()
    # Audit summaries never contain note bodies.
    audit(
        db,
        ctx,
        f"life.{data.kind.value}.create",
        "life_item",
        item.id,
        item.title if visibility == Visibility.family else None,
        obj=item,
    )
    return item


async def update_item(
    db: AsyncSession, ctx: FamilyContext, item_id: uuid.UUID, data: LifeItemPatch
) -> LifeItem:
    item = await get_visible(db, LifeItem, item_id, ctx, lock=True)
    for field in ("title", "body", "happened_on", "planned_for", "price", "url"):
        if field in data.model_fields_set:
            setattr(item, field, getattr(data, field))
    if data.status is not None and data.status != item.status:
        item.status = data.status
        item.done_at = utcnow() if data.status == LifeItemStatus.done else None
        if data.status == LifeItemStatus.done and item.kind == LifeItemKind.goal:
            await notify_family(
                db,
                ctx,
                category=NotificationCategory.goal_update,
                title=f"Цель достигнута: {item.title} 🎉",
                body=f"Отметил(а) {ctx.user.first_name}",
                dedupe_base=f"life-goal-done:{item.id}:{int(item.done_at.timestamp()) if item.done_at else 0}",
                link="/home/life",
                obj=item,
            )
    audit(
        db,
        ctx,
        f"life.{item.kind.value}.update",
        "life_item",
        item.id,
        item.title if item.visibility == Visibility.family else None,
        obj=item,
    )
    await db.flush()
    return item


async def delete_item(db: AsyncSession, ctx: FamilyContext, item_id: uuid.UUID) -> None:
    item = await get_visible(db, LifeItem, item_id, ctx)
    ensure_can_delete(item, ctx)
    await db.delete(item)


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


async def list_habits(db: AsyncSession, ctx: FamilyContext) -> list[HabitOut]:
    today = local_today(ctx.family.timezone)
    start = _week_start(today)
    habits = (
        (
            await db.execute(
                select(Habit)
                .where(visible(Habit, ctx), Habit.archived_at.is_(None))
                .order_by(Habit.created_at)
            )
        )
        .scalars()
        .all()
    )
    out = []
    for h in habits:
        checkins = (
            (
                await db.execute(
                    select(HabitCheckin).where(
                        HabitCheckin.habit_id == h.id, HabitCheckin.day >= start
                    )
                )
            )
            .scalars()
            .all()
        )
        item = HabitOut.model_validate(h)
        item.week_days = sorted({c.day for c in checkins})
        item.week_count = len(item.week_days)
        item.checked_today_by_me = any(
            c.day == today and c.user_id == ctx.user_id for c in checkins
        )
        out.append(item)
    return out


async def create_habit(db: AsyncSession, ctx: FamilyContext, data: HabitCreate) -> Habit:
    habit = Habit(
        family_id=ctx.family_id,
        title=data.title,
        target_per_week=data.target_per_week,
        visibility=data.visibility,
        created_by=ctx.user_id,
    )
    db.add(habit)
    await db.flush()
    return habit


async def checkin(
    db: AsyncSession, ctx: FamilyContext, habit_id: uuid.UUID, day: date | None, done: bool
) -> None:
    habit = await get_visible(db, Habit, habit_id, ctx)
    today = local_today(ctx.family.timezone)
    day = day or today
    if day > today or day < today - timedelta(days=7):
        raise ValidationFailed("Отметить можно за последние 7 дней")
    if done:
        await db.execute(
            insert(HabitCheckin)
            .values(
                id=uuid.uuid4(),
                family_id=ctx.family_id,
                habit_id=habit.id,
                user_id=ctx.user_id,
                day=day,
            )
            .on_conflict_do_nothing(index_elements=["habit_id", "user_id", "day"])
        )
    else:
        await db.execute(
            delete(HabitCheckin).where(
                HabitCheckin.habit_id == habit.id,
                HabitCheckin.user_id == ctx.user_id,
                HabitCheckin.day == day,
            )
        )


async def archive_habit(db: AsyncSession, ctx: FamilyContext, habit_id: uuid.UUID) -> None:
    habit = await get_visible(db, Habit, habit_id, ctx)
    ensure_can_delete(habit, ctx)
    habit.archived_at = utcnow()
