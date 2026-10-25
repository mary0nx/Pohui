"""Home screen aggregate: every number is computed from the family's real data."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app.api.deps import DB, Ctx
from app.core.time import local_range_bounds, local_today, utcnow
from app.models import AuditLog, CalendarEvent, LifeItem, Notification, Task, Transaction, User
from app.models.enums import (
    LifeItemKind,
    LifeItemStatus,
    ScheduledPaymentStatus,
)
from app.modules.calendar.schemas import OccurrenceOut
from app.modules.calendar.service import list_occurrences
from app.modules.finance.goals import list_goals
from app.modules.finance.recurring import list_scheduled
from app.modules.finance.schemas import BudgetStatus, GoalOut, ScheduledPaymentOut, Totals
from app.modules.finance.summary import budget_status, period_totals, scope_condition
from app.modules.notifications.service import inbox_condition
from app.modules.shopping.service import list_detail, list_lists
from app.modules.tasks.schemas import TaskOut, TaskStats
from app.modules.tasks.service import list_tasks, stats
from app.security.access import visible

router = APIRouter(prefix="/families/{family_id}", tags=["dashboard"])


class ShoppingEntry(BaseModel):
    id: uuid.UUID
    name: str
    quantity: Decimal | None
    unit: str | None
    image: str | None
    category: str | None
    status: str


class ShoppingPreview(BaseModel):
    list_id: uuid.UUID | None
    list_name: str | None
    needed_total: int
    items: list[str]  # names, kept for older clients
    entries: list[ShoppingEntry] = []


class ActivityOut(BaseModel):
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    summary: str | None
    actor_name: str | None
    is_me: bool
    created_at: datetime


class Dashboard(BaseModel):
    user_name: str
    family_name: str
    currency: str
    month_family: Totals
    month_personal: Totals
    budget: BudgetStatus | None
    events: list[OccurrenceOut]
    payments: list[ScheduledPaymentOut]
    shopping: ShoppingPreview
    my_tasks: list[TaskOut]
    task_stats: TaskStats
    goals: list[GoalOut]
    life_goals_open: int
    activity: list[ActivityOut]
    unread_notifications: int
    is_empty: bool


@router.get("/dashboard", response_model=Dashboard)
async def dashboard(ctx: Ctx, db: DB) -> Dashboard:
    zone = ctx.family.timezone
    today = local_today(zone)
    month = today.replace(day=1)
    next_month = (month + timedelta(days=32)).replace(day=1)
    m_start, m_end = local_range_bounds(month, next_month, zone)

    w_start, w_end = local_range_bounds(today, today + timedelta(days=8), zone)
    events = (await list_occurrences(db, ctx, max(utcnow() - timedelta(hours=2), w_start), w_end))[
        :5
    ]

    payments = await list_scheduled(
        db,
        ctx,
        today - timedelta(days=60),
        today + timedelta(days=7),
        ScheduledPaymentStatus.pending,
        limit=8,
    )

    lists = await list_lists(db, ctx)
    preview = ShoppingPreview(
        list_id=None, list_name=None, needed_total=sum(x.items_needed for x in lists), items=[]
    )
    if lists:
        main = max(lists, key=lambda x: (x.items_needed, -x.created_at.timestamp()))
        detail = await list_detail(db, ctx, main.id)
        preview.list_id, preview.list_name = main.id, main.name
        needed = [i for i in detail.items if i.status == "needed"][:6]
        preview.items = [i.name for i in needed]
        preview.entries = [
            ShoppingEntry(
                id=i.id,
                name=i.name,
                quantity=i.quantity,
                unit=i.unit,
                image=i.image,
                category=i.category,
                status=i.status,
            )
            for i in needed
        ]

    my_tasks = await list_tasks(db, ctx, status="open", assignee="me", limit=5)
    if len(my_tasks) < 5:
        shared = await list_tasks(
            db, ctx, status="open", assignee="unassigned", limit=5 - len(my_tasks)
        )
        my_tasks += shared

    goals = [g for g in await list_goals(db, ctx) if g.status == "active"][:3]
    life_open = await db.scalar(
        select(func.count())
        .select_from(LifeItem)
        .where(
            visible(LifeItem, ctx),
            LifeItem.kind == LifeItemKind.goal,
            LifeItem.status != LifeItemStatus.done,
        )
    )

    rows = (
        await db.execute(
            select(AuditLog, User.first_name)
            .outerjoin(User, User.id == AuditLog.actor_id)
            .where(
                AuditLog.family_id == ctx.family_id,
                or_(AuditLog.is_private.is_(False), AuditLog.actor_id == ctx.user_id),
                AuditLog.action.not_like("ai.%"),
            )
            .order_by(AuditLog.created_at.desc())
            .limit(10)
        )
    ).all()
    activity = [
        ActivityOut(
            action=a.action,
            entity_type=a.entity_type,
            entity_id=a.entity_id,
            summary=a.summary,
            actor_name=n,
            is_me=a.actor_id == ctx.user_id,
            created_at=a.created_at,
        )
        for a, n in rows
    ]
    unread = await db.scalar(
        select(func.count())
        .select_from(Notification)
        .where(inbox_condition(ctx.user_id), Notification.read_at.is_(None))
    )
    has_tx = await db.scalar(
        select(func.count()).select_from(Transaction).where(visible(Transaction, ctx))
    )
    has_events = await db.scalar(
        select(func.count()).select_from(CalendarEvent).where(visible(CalendarEvent, ctx))
    )
    has_tasks = await db.scalar(select(func.count()).select_from(Task).where(visible(Task, ctx)))
    return Dashboard(
        user_name=ctx.user.first_name,
        family_name=ctx.family.name,
        currency=ctx.family.currency,
        month_family=await period_totals(db, scope_condition(ctx, "family"), m_start, m_end),
        month_personal=await period_totals(db, scope_condition(ctx, "personal"), m_start, m_end),
        budget=await budget_status(db, ctx, month),
        events=events,
        payments=payments,
        shopping=preview,
        my_tasks=my_tasks,
        task_stats=await stats(db, ctx),
        goals=goals,
        life_goals_open=life_open or 0,
        activity=activity,
        unread_notifications=unread or 0,
        is_empty=not (has_tx or has_events or has_tasks or preview.needed_total),
    )
