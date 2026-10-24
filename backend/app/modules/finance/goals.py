"""Savings goals with contribution history and a simple linear forecast."""

from __future__ import annotations

import math
import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import ValidationFailed
from app.core.time import local_today, utcnow
from app.models import SavingsContribution, SavingsGoal
from app.models.enums import GoalStatus
from app.modules.finance.schemas import ContributionCreate, GoalCreate, GoalOut, GoalPatch
from app.security.access import FamilyContext, ensure_can_delete, get_visible, visible

FORECAST_WINDOW_DAYS = 90


async def _enrich(db: AsyncSession, goal: SavingsGoal, today: date) -> GoalOut:
    saved = Decimal(
        await db.scalar(
            select(func.coalesce(func.sum(SavingsContribution.amount), 0)).where(
                SavingsContribution.goal_id == goal.id
            )
        )
        or 0
    )
    since = today - timedelta(days=FORECAST_WINDOW_DAYS)
    recent = Decimal(
        await db.scalar(
            select(func.coalesce(func.sum(SavingsContribution.amount), 0)).where(
                SavingsContribution.goal_id == goal.id,
                SavingsContribution.contributed_on > since,
            )
        )
        or 0
    )
    first = await db.scalar(
        select(func.min(SavingsContribution.contributed_on)).where(
            SavingsContribution.goal_id == goal.id
        )
    )
    out = GoalOut.model_validate(goal)
    target = Decimal(goal.target_amount)
    out.saved = saved
    out.percent = round(min(float(saved / target * 100), 100.0), 1) if target > 0 else 0.0
    if first is not None:
        window_days = max(min((today - first).days + 1, FORECAST_WINDOW_DAYS), 30)
        monthly = (recent / window_days * 30).quantize(Decimal("0.01"))
        out.monthly_rate = monthly
        remaining = target - saved
        if remaining <= 0:
            out.forecast_date = today
        elif monthly > 0:
            months = math.ceil(remaining / monthly)
            out.forecast_date = today + timedelta(days=months * 30)
    if goal.target_date and goal.status == GoalStatus.active:
        out.on_track = out.forecast_date is not None and out.forecast_date <= goal.target_date
    return out


async def list_goals(
    db: AsyncSession, ctx: FamilyContext, include_archived: bool = False
) -> list[GoalOut]:
    stmt = select(SavingsGoal).where(visible(SavingsGoal, ctx))
    if not include_archived:
        stmt = stmt.where(SavingsGoal.status != GoalStatus.archived)
    goals = (await db.execute(stmt.order_by(SavingsGoal.created_at))).scalars().all()
    today = local_today(ctx.family.timezone)
    return [await _enrich(db, g, today) for g in goals]


async def goal_out(db: AsyncSession, ctx: FamilyContext, goal: SavingsGoal) -> GoalOut:
    return await _enrich(db, goal, local_today(ctx.family.timezone))


async def create_goal(db: AsyncSession, ctx: FamilyContext, data: GoalCreate) -> SavingsGoal:
    goal = SavingsGoal(
        family_id=ctx.family_id,
        name=data.name,
        target_amount=data.target_amount,
        currency=ctx.family.currency,
        target_date=data.target_date,
        emoji=data.emoji,
        visibility=data.visibility,
        created_by=ctx.user_id,
    )
    db.add(goal)
    await db.flush()
    audit(db, ctx, "goal.create", "savings_goal", goal.id, goal.name, obj=goal)
    return goal


async def update_goal(
    db: AsyncSession, ctx: FamilyContext, goal_id: uuid.UUID, data: GoalPatch
) -> SavingsGoal:
    goal = await get_visible(db, SavingsGoal, goal_id, ctx, lock=True)
    for field in ("name", "target_amount", "target_date", "emoji"):
        value = getattr(data, field)
        if value is not None:
            setattr(goal, field, value)
    if data.status is not None and data.status != goal.status:
        goal.status = data.status
        goal.achieved_at = utcnow() if data.status == GoalStatus.achieved else None
    audit(db, ctx, "goal.update", "savings_goal", goal.id, goal.name, obj=goal)
    await db.flush()
    return goal


async def delete_goal(db: AsyncSession, ctx: FamilyContext, goal_id: uuid.UUID) -> None:
    goal = await get_visible(db, SavingsGoal, goal_id, ctx)
    ensure_can_delete(goal, ctx)
    audit(db, ctx, "goal.delete", "savings_goal", goal.id, goal.name, obj=goal)
    await db.delete(goal)


async def add_contribution(
    db: AsyncSession, ctx: FamilyContext, goal_id: uuid.UUID, data: ContributionCreate
) -> tuple[SavingsGoal, bool]:
    """Returns (goal, just_achieved)."""
    goal = await get_visible(db, SavingsGoal, goal_id, ctx, lock=True)
    if goal.status == GoalStatus.archived:
        raise ValidationFailed("Цель в архиве")
    db.add(
        SavingsContribution(
            family_id=ctx.family_id,
            goal_id=goal.id,
            amount=data.amount,
            contributed_on=data.contributed_on or local_today(ctx.family.timezone),
            note=data.note,
            created_by=ctx.user_id,
        )
    )
    await db.flush()
    saved = Decimal(
        await db.scalar(
            select(func.coalesce(func.sum(SavingsContribution.amount), 0)).where(
                SavingsContribution.goal_id == goal.id
            )
        )
        or 0
    )
    if saved < 0:
        raise ValidationFailed("Нельзя снять больше, чем накоплено")
    just_achieved = False
    if goal.status == GoalStatus.active and saved >= goal.target_amount:
        goal.status = GoalStatus.achieved
        goal.achieved_at = utcnow()
        just_achieved = True
    audit(
        db, ctx, "goal.contribute", "savings_goal", goal.id, f"{goal.name}: {data.amount}", obj=goal
    )
    return goal, just_achieved


async def list_contributions(
    db: AsyncSession, ctx: FamilyContext, goal_id: uuid.UUID
) -> list[SavingsContribution]:
    goal = await get_visible(db, SavingsGoal, goal_id, ctx)
    return list(
        (
            await db.execute(
                select(SavingsContribution)
                .where(SavingsContribution.goal_id == goal.id)
                .order_by(
                    SavingsContribution.contributed_on.desc(), SavingsContribution.created_at.desc()
                )
            )
        ).scalars()
    )
