"""AI tools for finance. All data access goes through finance services (visibility-aware)."""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Literal

from pydantic import Field

from app.ai.tools.common import ToolError, day_noon, parse_date, resolve_account, resolve_category
from app.ai.tools.registry import Prepared, Tool, ToolArgs, ToolContext, register
from app.core.time import local_today
from app.models import Category, Transaction
from app.models.enums import CategoryKind, TransactionKind
from app.modules.finance import goals, service, summary
from app.modules.finance.schemas import (
    GoalCreate,
    TransactionCreate,
    TransactionFilters,
    TransactionPatch,
)
from app.security.access import get_visible


def _month(value: str | None, zone: str) -> date:
    if not value:
        return local_today(zone).replace(day=1)
    try:
        y, m = value.split("-")[:2]
        return date(int(y), int(m), 1)
    except ValueError as exc:
        raise ToolError("Месяц в формате ГГГГ-ММ") from exc


async def _cat_names(tc: ToolContext) -> dict[uuid.UUID, str]:
    return {c.id: c.name for c in await service.list_categories(tc.db, tc.ctx, include_archived=True)}


def _tx_dict(t: Any, cats: dict[uuid.UUID, str], zone: str) -> dict[str, Any]:
    from zoneinfo import ZoneInfo

    return {
        "id": str(t.id),
        "kind": t.kind,
        "amount": str(t.amount),
        "currency": t.currency,
        "date": t.occurred_at.astimezone(ZoneInfo(zone)).date().isoformat(),
        "category": cats.get(t.category_id) if t.category_id else None,
        "description": t.description,
        "merchant": t.merchant,
        "private": t.visibility == "private",
    }


# --- read --------------------------------------------------------------------------


class SummaryArgs(ToolArgs):
    month: str | None = Field(None, description="Месяц ГГГГ-ММ; по умолчанию текущий")
    scope: Literal["family", "personal", "all"] = Field("family", description="family — общие, personal — мои личные, all — всё мне доступное")


async def finance_summary(tc: ToolContext, a: SummaryArgs) -> dict[str, Any]:
    s = await summary.finance_summary(tc.db, tc.ctx, _month(a.month, tc.ctx.family.timezone), a.scope)
    return {
        "month": s.month.isoformat()[:7],
        "currency": s.currency,
        "family": s.family.model_dump(mode="json"),
        "personal_mine": s.personal.model_dump(mode="json"),
        "by_category": [{"category": c.name, "spent": str(c.amount), "budget": str(c.budget) if c.budget else None} for c in s.by_category[:12]],
        "budget": s.budget.model_dump(mode="json") if s.budget else None,
        "history": [{"month": h.month.isoformat()[:7], "expense": str(h.expense), "income": str(h.income)} for h in s.history],
        "operations_in_other_currencies": s.other_currency_count,
    }


register(Tool("get_finance_summary", "Сводка доходов и расходов за месяц: итоги, по категориям, бюджет, история 6 месяцев.", SummaryArgs, "read", finance_summary))


class BudgetArgs(ToolArgs):
    month: str | None = Field(None, description="ГГГГ-ММ")


async def budget_status(tc: ToolContext, a: BudgetArgs) -> dict[str, Any]:
    from app.modules.finance.budgets import list_budgets

    month = _month(a.month, tc.ctx.family.timezone)
    items = await list_budgets(tc.db, tc.ctx, month)
    cats = await _cat_names(tc)
    return {
        "month": month.isoformat()[:7],
        "budgets": [
            {"category": cats.get(b.category_id) if b.category_id else "Весь месяц", "limit": str(b.limit_amount), "spent": str(b.spent), "percent": b.percent, "level": b.level}
            for b in items
        ],
    }


register(Tool("get_budget_status", "Лимиты бюджета и их исполнение за месяц.", BudgetArgs, "read", budget_status))


class SearchArgs(ToolArgs):
    date_from: str | None = Field(None, description="ГГГГ-ММ-ДД")
    date_to: str | None = Field(None, description="ГГГГ-ММ-ДД")
    kind: Literal["income", "expense", "refund", "transfer"] | None = None
    category: str | None = Field(None, description="Название категории")
    query: str | None = Field(None, max_length=100, description="Поиск по описанию/магазину")
    limit: int = Field(20, ge=1, le=50)


async def search_transactions(tc: ToolContext, a: SearchArgs) -> dict[str, Any]:
    category_id = None
    if a.category:
        kind = CategoryKind.income if a.kind == "income" else CategoryKind.expense
        cat = await resolve_category(tc, a.category, kind)
        category_id = cat.id if cat else None
    page = await service.search_transactions(
        tc.db,
        tc.ctx,
        TransactionFilters(
            date_from=parse_date(a.date_from) if a.date_from else None,
            date_to=parse_date(a.date_to) if a.date_to else None,
            kind=TransactionKind(a.kind) if a.kind else None,
            category_id=category_id,
            q=a.query,
            limit=a.limit,
        ),
    )
    cats = await _cat_names(tc)
    total = sum((Decimal(t.amount) for t in page.items), Decimal("0"))
    return {
        "total_found": page.total,
        "shown": len(page.items),
        "sum_of_shown": str(total),
        "transactions": [_tx_dict(t, cats, tc.ctx.family.timezone) for t in page.items],
    }


register(Tool("search_transactions", "Найти операции по периоду, типу, категории или тексту.", SearchArgs, "read", search_transactions))


# --- create_transaction (auto) -------------------------------------------------------


class CreateTxArgs(ToolArgs):
    kind: Literal["expense", "income", "refund"] = "expense"
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    category: str | None = Field(None, description="Название категории, например «Продукты»")
    account: str | None = Field(None, description="Название счёта; если не указано — последний использованный")
    description: str | None = Field(None, max_length=300)
    merchant: str | None = Field(None, max_length=200)
    date: str | None = Field(None, description="ГГГГ-ММ-ДД; по умолчанию сегодня")
    private: bool | None = Field(None, description="true — личный расход с личного счёта")


async def prepare_tx(tc: ToolContext, a: CreateTxArgs) -> Prepared:
    kind = TransactionKind(a.kind)
    cat = await resolve_category(tc, a.category, CategoryKind.income if kind == TransactionKind.income else CategoryKind.expense)
    account = await resolve_account(tc, a.account, a.private)
    day = parse_date(a.date) if a.date else None
    labels = {"expense": "Расход", "income": "Доход", "refund": "Возврат"}
    details = [f"Сумма: {a.amount} {account.currency}", f"Счёт: {account.name}"]
    if cat:
        details.append(f"Категория: {cat.name}")
    if a.description:
        details.append(f"Описание: {a.description}")
    if day:
        details.append(f"Дата: {day:%d.%m.%Y}")
    if account.visibility == "private":
        details.append("Видимость: личная")
    return Prepared(
        arguments={
            "kind": kind.value,
            "amount": str(a.amount),
            "category_id": str(cat.id) if cat else None,
            "account_id": str(account.id),
            "description": a.description,
            "merchant": a.merchant,
            "date": day.isoformat() if day else None,
        },
        summary=f"{labels[a.kind]} {a.amount} {account.currency}" + (f" — {cat.name}" if cat else ""),
        details=details,
    )


async def execute_tx(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    zone = tc.ctx.family.timezone
    tx = await service.create_transaction(
        tc.db,
        tc.ctx,
        TransactionCreate(
            kind=TransactionKind(args["kind"]),
            amount=Decimal(args["amount"]),
            account_id=uuid.UUID(args["account_id"]),
            category_id=uuid.UUID(args["category_id"]) if args.get("category_id") else None,
            description=args.get("description"),
            merchant=args.get("merchant"),
            occurred_at=day_noon(date.fromisoformat(args["date"]), zone) if args.get("date") else None,
        ),
        source="ai",
    )
    return {"created_transaction_id": str(tx.id), "amount": str(tx.amount), "currency": tx.currency}


register(Tool("create_transaction", "Записать расход, доход или возврат.", CreateTxArgs, "auto", execute_tx, prepare=prepare_tx))


# --- update/delete (confirm) ---------------------------------------------------------


class UpdateTxArgs(ToolArgs):
    transaction_id: uuid.UUID
    amount: Decimal | None = Field(None, gt=0, max_digits=14, decimal_places=2)
    category: str | None = None
    description: str | None = Field(None, max_length=300)
    date: str | None = Field(None, description="ГГГГ-ММ-ДД")


async def _tx_version(tc: ToolContext, args: dict[str, Any]) -> str | None:
    tx = await get_visible(tc.db, Transaction, uuid.UUID(args["transaction_id"]), tc.ctx)
    return tx.updated_at.isoformat()


async def prepare_update_tx(tc: ToolContext, a: UpdateTxArgs) -> Prepared:
    tx = await get_visible(tc.db, Transaction, a.transaction_id, tc.ctx)
    cat: Category | None = None
    if a.category:
        cat = await resolve_category(tc, a.category, CategoryKind.income if tx.kind == TransactionKind.income else CategoryKind.expense)
    details = [f"Операция: {tx.amount} {tx.currency}" + (f" «{tx.description}»" if tx.description else "")]
    if a.amount is not None:
        details.append(f"Новая сумма: {a.amount}")
    if cat:
        details.append(f"Новая категория: {cat.name}")
    if a.description is not None:
        details.append(f"Новое описание: {a.description}")
    if a.date:
        details.append(f"Новая дата: {parse_date(a.date):%d.%m.%Y}")
    return Prepared(
        arguments={
            "transaction_id": str(tx.id),
            "amount": str(a.amount) if a.amount is not None else None,
            "category_id": str(cat.id) if cat else None,
            "description": a.description,
            "date": parse_date(a.date).isoformat() if a.date else None,
        },
        summary="Изменить операцию",
        details=details,
        target_version=tx.updated_at.isoformat(),
    )


async def execute_update_tx(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    zone = tc.ctx.family.timezone
    tx = await service.update_transaction(
        tc.db,
        tc.ctx,
        uuid.UUID(args["transaction_id"]),
        TransactionPatch(
            amount=Decimal(args["amount"]) if args.get("amount") else None,
            category_id=uuid.UUID(args["category_id"]) if args.get("category_id") else None,
            description=args.get("description"),
            occurred_at=day_noon(date.fromisoformat(args["date"]), zone) if args.get("date") else None,
        ),
    )
    return {"updated_transaction_id": str(tx.id)}


register(Tool("update_transaction", "Изменить существующую операцию (нужен её id из search_transactions).", UpdateTxArgs, "confirm", execute_update_tx, prepare=prepare_update_tx, current_version=_tx_version))


class DeleteTxArgs(ToolArgs):
    transaction_id: uuid.UUID


async def prepare_delete_tx(tc: ToolContext, a: DeleteTxArgs) -> Prepared:
    tx = await get_visible(tc.db, Transaction, a.transaction_id, tc.ctx)
    return Prepared(
        arguments={"transaction_id": str(tx.id)},
        summary=f"Удалить операцию {tx.amount} {tx.currency}",
        details=[f"Дата: {tx.occurred_at:%d.%m.%Y}"] + ([f"Описание: {tx.description}"] if tx.description else []),
        target_version=tx.updated_at.isoformat(),
    )


async def execute_delete_tx(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    await service.delete_transaction(tc.db, tc.ctx, uuid.UUID(args["transaction_id"]))
    return {"deleted": True}


register(Tool("delete_transaction", "Удалить операцию (всегда требует подтверждения).", DeleteTxArgs, "confirm", execute_delete_tx, prepare=prepare_delete_tx, current_version=_tx_version))


# --- recurring & goals ---------------------------------------------------------------


class UpcomingArgs(ToolArgs):
    days: int = Field(7, ge=1, le=62, description="На сколько дней вперёд")


async def upcoming_payments(tc: ToolContext, a: UpcomingArgs) -> dict[str, Any]:
    from datetime import timedelta

    from app.models.enums import ScheduledPaymentStatus
    from app.modules.finance.recurring import list_scheduled

    today = local_today(tc.ctx.family.timezone)
    items = await list_scheduled(tc.db, tc.ctx, today - timedelta(days=60), today + timedelta(days=a.days), ScheduledPaymentStatus.pending)
    return {
        "today": today.isoformat(),
        "payments": [
            {"name": i.rule_name, "amount": str(i.amount), "currency": i.currency, "due_date": i.due_date.isoformat(), "overdue": i.overdue}
            for i in items
        ],
    }


register(Tool("get_upcoming_payments", "Регулярные платежи к оплате (включая просроченные) на ближайшие дни.", UpcomingArgs, "read", upcoming_payments))


class GoalsArgs(ToolArgs):
    pass


async def list_goals(tc: ToolContext, a: GoalsArgs) -> dict[str, Any]:
    items = await goals.list_goals(tc.db, tc.ctx)
    return {
        "goals": [
            {"name": g.name, "target": str(g.target_amount), "saved": str(g.saved), "percent": g.percent, "status": g.status, "target_date": g.target_date.isoformat() if g.target_date else None, "forecast_date": g.forecast_date.isoformat() if g.forecast_date else None}
            for g in items
        ]
    }


register(Tool("get_savings_goals", "Цели накоплений и прогресс.", GoalsArgs, "read", list_goals))


class CreateGoalArgs(ToolArgs):
    name: str = Field(min_length=1, max_length=100)
    target_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    target_date: str | None = Field(None, description="ГГГГ-ММ-ДД")
    private: bool = False


async def prepare_goal(tc: ToolContext, a: CreateGoalArgs) -> Prepared:
    target_date = parse_date(a.target_date) if a.target_date else None
    details = [f"Сумма: {a.target_amount} {tc.ctx.family.currency}"]
    if target_date:
        details.append(f"Срок: {target_date:%d.%m.%Y}")
    if a.private:
        details.append("Видимость: личная")
    return Prepared(
        arguments={"name": a.name, "target_amount": str(a.target_amount), "target_date": target_date.isoformat() if target_date else None, "private": a.private},
        summary=f"Новая цель накоплений «{a.name}»",
        details=details,
    )


async def execute_goal(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    goal = await goals.create_goal(
        tc.db,
        tc.ctx,
        GoalCreate(
            name=args["name"],
            target_amount=Decimal(args["target_amount"]),
            target_date=date.fromisoformat(args["target_date"]) if args.get("target_date") else None,
            visibility="private" if args.get("private") else "family",
        ),
    )
    return {"created_goal_id": str(goal.id)}


register(Tool("create_savings_goal", "Создать цель накоплений.", CreateGoalArgs, "confirm", execute_goal, prepare=prepare_goal))
