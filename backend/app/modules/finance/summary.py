"""Monthly finance summary and budget status.

Rules: transfers are excluded; refunds reduce expenses; only operations in the family
currency are aggregated (other currencies are counted, not converted).
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal

from sqlalchemy import ColumnElement, and_, case, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.types import Date

from app.core.time import add_months, local_range_bounds, month_start
from app.models import Budget, Category, FamilyMember, Transaction, User
from app.models.enums import TransactionKind, Visibility
from app.modules.finance.schemas import (
    BudgetStatus,
    CategoryTotal,
    DayTotal,
    FinanceSummary,
    MemberTotal,
    MonthTotal,
    Totals,
)
from app.security.access import FamilyContext, visible

Scope = Literal["family", "personal", "all"]

EXPENSE_SIGNED = case(
    (Transaction.kind == TransactionKind.expense, Transaction.amount),
    (Transaction.kind == TransactionKind.refund, -Transaction.amount),
    else_=Decimal("0"),
)
INCOME = case((Transaction.kind == TransactionKind.income, Transaction.amount), else_=Decimal("0"))


def scope_condition(ctx: FamilyContext, scope: Scope) -> ColumnElement[bool]:
    base = and_(
        Transaction.family_id == ctx.family_id,
        Transaction.currency == ctx.family.currency,
        Transaction.kind != TransactionKind.transfer,
    )
    family = Transaction.visibility == Visibility.family
    mine = and_(Transaction.visibility == Visibility.private, Transaction.created_by == ctx.user_id)
    if scope == "family":
        return and_(base, family)
    if scope == "personal":
        return and_(base, mine)
    return and_(base, family | mine)


def level_for(percent: float) -> str:
    if percent >= 100:
        return "exceeded"
    if percent >= 80:
        return "warning"
    return "ok"


async def period_totals(db: AsyncSession, cond: ColumnElement[bool], start, end) -> Totals:  # type: ignore[no-untyped-def]
    row = (
        await db.execute(
            select(func.coalesce(func.sum(INCOME), 0), func.coalesce(func.sum(EXPENSE_SIGNED), 0)).where(
                cond, Transaction.occurred_at >= start, Transaction.occurred_at < end
            )
        )
    ).one()
    income, expense = Decimal(row[0]), Decimal(row[1])
    return Totals(income=income, expense=expense, net=income - expense)


async def category_spend(
    db: AsyncSession, ctx: FamilyContext, month: date, scope: Scope = "family"
) -> dict[uuid.UUID | None, Decimal]:
    """Expense per top-level category (sub-categories roll up to their parent)."""
    start, end = local_range_bounds(month, add_months(month, 1), ctx.family.timezone)
    top = func.coalesce(Category.parent_id, Category.id)
    rows = (
        await db.execute(
            select(top.label("cat"), func.sum(EXPENSE_SIGNED))
            .select_from(Transaction)
            .outerjoin(Category, Category.id == Transaction.category_id)
            .where(
                scope_condition(ctx, scope),
                Transaction.kind.in_([TransactionKind.expense, TransactionKind.refund]),
                Transaction.occurred_at >= start,
                Transaction.occurred_at < end,
            )
            .group_by(top)
        )
    ).all()
    return {r[0]: Decimal(r[1] or 0) for r in rows}


async def budget_status(db: AsyncSession, ctx: FamilyContext, month: date) -> BudgetStatus | None:
    budget = await db.scalar(
        select(Budget).where(
            Budget.family_id == ctx.family_id, Budget.month == month, Budget.category_id.is_(None)
        )
    )
    if budget is None:
        return None
    start, end = local_range_bounds(month, add_months(month, 1), ctx.family.timezone)
    spent = (await period_totals(db, scope_condition(ctx, "family"), start, end)).expense
    limit = Decimal(budget.limit_amount)
    percent = float(spent / limit * 100) if limit > 0 else (100.0 if spent > 0 else 0.0)
    return BudgetStatus(
        limit=limit,
        spent=spent,
        remaining=limit - spent,
        percent=round(percent, 1),
        level=level_for(percent),
    )


async def finance_summary(
    db: AsyncSession, ctx: FamilyContext, month: date, scope: Scope = "family"
) -> FinanceSummary:
    month = month_start(month)
    tz = ctx.family.timezone
    start, end = local_range_bounds(month, add_months(month, 1), tz)
    cond = scope_condition(ctx, scope)

    family_totals = await period_totals(db, scope_condition(ctx, "family"), start, end)
    personal_totals = await period_totals(db, scope_condition(ctx, "personal"), start, end)

    # By category
    spend = await category_spend(db, ctx, month, scope)
    cats = {
        c.id: c
        for c in (
            await db.execute(select(Category).where(Category.family_id == ctx.family_id))
        ).scalars()
    }
    budgets = {
        b.category_id: Decimal(b.limit_amount)
        for b in (
            await db.execute(
                select(Budget).where(Budget.family_id == ctx.family_id, Budget.month == month)
            )
        ).scalars()
    }
    by_category = []
    for cat_id, amount in sorted(spend.items(), key=lambda kv: kv[1], reverse=True):
        if amount == 0:
            continue
        cat = cats.get(cat_id) if cat_id else None
        by_category.append(
            CategoryTotal(
                category_id=cat_id,
                name=cat.name if cat else "Без категории",
                icon=cat.icon if cat else None,
                color=cat.color if cat else None,
                amount=amount,
                budget=budgets.get(cat_id) if cat_id else None,
            )
        )
    family_spend = spend if scope == "family" else await category_spend(db, ctx, month, "family")
    alerts = []
    for cat_id, limit in budgets.items():
        if cat_id is None:
            continue
        spent = family_spend.get(cat_id, Decimal("0"))
        pct = float(spent / limit * 100) if limit > 0 else (100.0 if spent > 0 else 0.0)
        if pct >= 80:
            cat = cats.get(cat_id)
            alerts.append(
                CategoryTotal(
                    category_id=cat_id,
                    name=cat.name if cat else "—",
                    icon=cat.icon if cat else None,
                    color=cat.color if cat else None,
                    amount=spent,
                    budget=limit,
                )
            )

    # By member (who recorded the operation)
    member_rows = (
        await db.execute(
            select(
                Transaction.created_by,
                func.coalesce(func.sum(EXPENSE_SIGNED), 0),
                func.coalesce(func.sum(INCOME), 0),
            )
            .where(cond, Transaction.occurred_at >= start, Transaction.occurred_at < end)
            .group_by(Transaction.created_by)
        )
    ).all()
    names = {
        u.id: u.first_name
        for u in (
            await db.execute(
                select(User)
                .join(FamilyMember, FamilyMember.user_id == User.id)
                .where(FamilyMember.family_id == ctx.family_id)
            )
        ).scalars()
    }
    by_member = [
        MemberTotal(
            user_id=uid,
            name=names.get(uid, "Бывший участник") if uid else "—",
            expense=Decimal(exp),
            income=Decimal(inc),
        )
        for uid, exp, inc in member_rows
    ]

    # Daily series (local dates)
    local_day = cast(func.timezone(tz, Transaction.occurred_at), Date)
    day_rows = (
        await db.execute(
            select(
                local_day,
                func.coalesce(func.sum(EXPENSE_SIGNED), 0),
                func.coalesce(func.sum(INCOME), 0),
            )
            .where(cond, Transaction.occurred_at >= start, Transaction.occurred_at < end)
            .group_by(local_day)
        )
    ).all()
    per_day = {r[0]: (Decimal(r[1]), Decimal(r[2])) for r in day_rows}
    daily = []
    d = month
    while d < add_months(month, 1):
        exp, inc = per_day.get(d, (Decimal("0"), Decimal("0")))
        daily.append(DayTotal(day=d, expense=exp, income=inc))
        d += timedelta(days=1)

    # Six-month history
    history = []
    for i in range(5, -1, -1):
        m = add_months(month, -i)
        s, e = local_range_bounds(m, add_months(m, 1), tz)
        t = await period_totals(db, cond, s, e)
        history.append(MonthTotal(month=m, expense=t.expense, income=t.income))

    other = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(
            visible(Transaction, ctx),
            Transaction.currency != ctx.family.currency,
            Transaction.occurred_at >= start,
            Transaction.occurred_at < end,
        )
    )

    return FinanceSummary(
        month=month,
        currency=ctx.family.currency,
        family=family_totals,
        personal=personal_totals,
        by_category=by_category,
        by_member=by_member,
        daily=daily,
        history=history,
        budget=await budget_status(db, ctx, month),
        category_alerts=alerts,
        other_currency_count=other or 0,
    )
