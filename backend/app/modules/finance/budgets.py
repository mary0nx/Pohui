"""Monthly budgets: overall limit (category_id NULL) and per-category limits."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import NotFound, ValidationFailed
from app.core.time import add_months, local_range_bounds, month_start
from app.models import Budget, Category
from app.models.enums import CategoryKind
from app.modules.finance.schemas import BudgetCopy, BudgetOut, BudgetUpsert
from app.modules.finance.summary import category_spend, level_for, period_totals, scope_condition
from app.security.access import FamilyContext, get_visible


async def list_budgets(db: AsyncSession, ctx: FamilyContext, month: date) -> list[BudgetOut]:
    month = month_start(month)
    budgets = (
        await db.execute(
            select(Budget).where(Budget.family_id == ctx.family_id, Budget.month == month)
        )
    ).scalars().all()
    spend = await category_spend(db, ctx, month, "family")
    start, end = local_range_bounds(month, add_months(month, 1), ctx.family.timezone)
    overall = (await period_totals(db, scope_condition(ctx, "family"), start, end)).expense
    out = []
    for b in budgets:
        spent = overall if b.category_id is None else spend.get(b.category_id, Decimal("0"))
        limit = Decimal(b.limit_amount)
        pct = float(spent / limit * 100) if limit > 0 else (100.0 if spent > 0 else 0.0)
        item = BudgetOut.model_validate(b)
        item.spent = spent
        item.percent = round(pct, 1)
        item.level = level_for(pct)
        out.append(item)
    out.sort(key=lambda b: (b.category_id is not None, -b.percent))
    return out


async def upsert_budget(db: AsyncSession, ctx: FamilyContext, data: BudgetUpsert) -> None:
    if data.category_id is not None:
        cat = await get_visible(db, Category, data.category_id, ctx)
        if cat.kind != CategoryKind.expense or cat.parent_id is not None:
            raise ValidationFailed("Лимит задаётся для основной категории расходов")
    stmt = (
        insert(Budget)
        .values(
            id=uuid.uuid4(),
            family_id=ctx.family_id,
            month=month_start(data.month),
            category_id=data.category_id,
            limit_amount=data.limit_amount,
            created_by=ctx.user_id,
        )
        .on_conflict_do_update(
            constraint="uq_budgets_family_id_month_category_id",
            set_={"limit_amount": data.limit_amount},
        )
    )
    await db.execute(stmt)
    audit(db, ctx, "budget.upsert", "budget", None, f"{data.month:%Y-%m}: {data.limit_amount}")


async def delete_budget(db: AsyncSession, ctx: FamilyContext, budget_id: uuid.UUID) -> None:
    budget = await db.scalar(
        select(Budget).where(Budget.id == budget_id, Budget.family_id == ctx.family_id)
    )
    if budget is None:
        raise NotFound()
    await db.delete(budget)


async def copy_budgets(db: AsyncSession, ctx: FamilyContext, data: BudgetCopy) -> int:
    src = (
        await db.execute(
            select(Budget).where(
                Budget.family_id == ctx.family_id, Budget.month == month_start(data.from_month)
            )
        )
    ).scalars().all()
    for b in src:
        await db.execute(
            insert(Budget)
            .values(
                id=uuid.uuid4(),
                family_id=ctx.family_id,
                month=month_start(data.to_month),
                category_id=b.category_id,
                limit_amount=b.limit_amount,
                created_by=ctx.user_id,
            )
            .on_conflict_do_nothing(constraint="uq_budgets_family_id_month_category_id")
        )
    return len(src)
