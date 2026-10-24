from __future__ import annotations

import uuid
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Query, UploadFile

from app.api.deps import DB, Ctx, IdempotencyKeyHeader
from app.core.errors import ValidationFailed
from app.core.idempotency import Idempotency
from app.core.schemas import Page
from app.core.time import local_today
from app.models.enums import NotificationCategory, ScheduledPaymentStatus
from app.modules.finance import budgets, csv_import, goals, recurring, service, summary
from app.modules.finance.schemas import (
    AccountCreate,
    AccountOut,
    AccountPatch,
    BudgetCopy,
    BudgetOut,
    BudgetUpsert,
    CategoryCreate,
    CategoryOut,
    CategoryPatch,
    ContributionCreate,
    ContributionOut,
    FinanceSummary,
    GoalCreate,
    GoalOut,
    GoalPatch,
    ImportResult,
    PayScheduled,
    RecurringCreate,
    RecurringOut,
    RecurringPatch,
    ScheduledPaymentOut,
    TransactionCreate,
    TransactionFilters,
    TransactionOut,
    TransactionPatch,
)
from app.modules.notifications.service import notify_family

router = APIRouter(prefix="/families/{family_id}/finance", tags=["finance"])


# --- Accounts -------------------------------------------------------------------------


@router.get("/accounts", response_model=list[AccountOut])
async def list_accounts(ctx: Ctx, db: DB, include_archived: bool = False) -> list[AccountOut]:
    return await service.list_accounts(db, ctx, include_archived)


@router.post("/accounts", response_model=AccountOut, status_code=201)
async def create_account(body: AccountCreate, ctx: Ctx, db: DB) -> AccountOut:
    acc = await service.create_account(db, ctx, body)
    await db.commit()
    return next(a for a in await service.list_accounts(db, ctx, True) if a.id == acc.id)


@router.patch("/accounts/{account_id}", response_model=AccountOut)
async def patch_account(account_id: uuid.UUID, body: AccountPatch, ctx: Ctx, db: DB) -> AccountOut:
    await service.update_account(db, ctx, account_id, body)
    await db.commit()
    return next(a for a in await service.list_accounts(db, ctx, True) if a.id == account_id)


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_account(account_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_account(db, ctx, account_id)
    await db.commit()


# --- Categories -----------------------------------------------------------------------


@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(ctx: Ctx, db: DB, include_archived: bool = False) -> list[CategoryOut]:
    return [
        CategoryOut.model_validate(c)
        for c in await service.list_categories(db, ctx, include_archived)
    ]


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryCreate, ctx: Ctx, db: DB) -> CategoryOut:
    cat = await service.create_category(db, ctx, body)
    await db.commit()
    return CategoryOut.model_validate(cat)


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def patch_category(
    category_id: uuid.UUID, body: CategoryPatch, ctx: Ctx, db: DB
) -> CategoryOut:
    cat = await service.update_category(db, ctx, category_id, body)
    await db.commit()
    return CategoryOut.model_validate(cat)


# --- Transactions ---------------------------------------------------------------------


@router.get("/transactions", response_model=Page[TransactionOut])
async def list_transactions(
    ctx: Ctx, db: DB, filters: Annotated[TransactionFilters, Query()]
) -> Page[TransactionOut]:
    return await service.search_transactions(db, ctx, filters)


@router.post("/transactions", response_model=TransactionOut, status_code=201)
async def create_transaction(
    body: TransactionCreate, ctx: Ctx, db: DB, idempotency_key: IdempotencyKeyHeader = None
):  # type: ignore[no-untyped-def]
    idem = Idempotency(db, ctx.user_id, idempotency_key, f"tx:{ctx.family_id}", body)
    if (replay := await idem.begin()) is not None:
        return replay
    tx = await service.create_transaction(db, ctx, body)
    out = TransactionOut.model_validate(tx)
    await idem.finish(201, out)
    return out


@router.get("/transactions/{tx_id}", response_model=TransactionOut)
async def get_transaction(tx_id: uuid.UUID, ctx: Ctx, db: DB) -> TransactionOut:
    return TransactionOut.model_validate(await service.get_transaction(db, ctx, tx_id))


@router.patch("/transactions/{tx_id}", response_model=TransactionOut)
async def patch_transaction(
    tx_id: uuid.UUID, body: TransactionPatch, ctx: Ctx, db: DB
) -> TransactionOut:
    tx = await service.update_transaction(db, ctx, tx_id, body)
    out = TransactionOut.model_validate(tx)
    await db.commit()
    return out


@router.delete("/transactions/{tx_id}", status_code=204)
async def delete_transaction(tx_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_transaction(db, ctx, tx_id)
    await db.commit()


@router.post("/import", response_model=ImportResult)
async def import_transactions(
    ctx: Ctx,
    db: DB,
    file: Annotated[UploadFile, File()],
    account_id: Annotated[uuid.UUID, Form()],
    dry_run: Annotated[bool, Form()] = True,
) -> ImportResult:
    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise ValidationFailed("Файл больше 5 МБ")
    result = await csv_import.import_csv(db, ctx, account_id, content, dry_run)
    if dry_run:
        await db.rollback()
    else:
        await db.commit()
    return result


# --- Summary & budgets ----------------------------------------------------------------


def _month(month: str | None, ctx: Ctx) -> date:
    if not month:
        return local_today(ctx.family.timezone).replace(day=1)
    try:
        year, mon = month.split("-")
        return date(int(year), int(mon), 1)
    except ValueError as exc:
        raise ValidationFailed("Месяц в формате ГГГГ-ММ") from exc


@router.get("/summary", response_model=FinanceSummary)
async def get_summary(
    ctx: Ctx,
    db: DB,
    month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None,
    scope: Literal["family", "personal", "all"] = "family",
) -> FinanceSummary:
    return await summary.finance_summary(db, ctx, _month(month, ctx), scope)


@router.get("/budgets", response_model=list[BudgetOut])
async def list_budgets(
    ctx: Ctx, db: DB, month: Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")] = None
) -> list[BudgetOut]:
    return await budgets.list_budgets(db, ctx, _month(month, ctx))


@router.put("/budgets", response_model=list[BudgetOut])
async def upsert_budget(body: BudgetUpsert, ctx: Ctx, db: DB) -> list[BudgetOut]:
    await budgets.upsert_budget(db, ctx, body)
    await db.commit()
    return await budgets.list_budgets(db, ctx, body.month)


@router.delete("/budgets/{budget_id}", status_code=204)
async def delete_budget(budget_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await budgets.delete_budget(db, ctx, budget_id)
    await db.commit()


@router.post("/budgets/copy", response_model=list[BudgetOut])
async def copy_budgets(body: BudgetCopy, ctx: Ctx, db: DB) -> list[BudgetOut]:
    await budgets.copy_budgets(db, ctx, body)
    await db.commit()
    return await budgets.list_budgets(db, ctx, body.to_month)


# --- Recurring payments ---------------------------------------------------------------


@router.get("/recurring", response_model=list[RecurringOut])
async def list_recurring(ctx: Ctx, db: DB) -> list[RecurringOut]:
    return await recurring.list_rules(db, ctx)


@router.post("/recurring", response_model=RecurringOut, status_code=201)
async def create_recurring(body: RecurringCreate, ctx: Ctx, db: DB) -> RecurringOut:
    rule = await recurring.create_rule(db, ctx, body)
    await db.commit()
    return next(r for r in await recurring.list_rules(db, ctx) if r.id == rule.id)


@router.patch("/recurring/{rule_id}", response_model=RecurringOut)
async def patch_recurring(
    rule_id: uuid.UUID, body: RecurringPatch, ctx: Ctx, db: DB
) -> RecurringOut:
    await recurring.update_rule(db, ctx, rule_id, body)
    await db.commit()
    return next(r for r in await recurring.list_rules(db, ctx) if r.id == rule_id)


@router.delete("/recurring/{rule_id}", status_code=204)
async def delete_recurring(rule_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await recurring.delete_rule(db, ctx, rule_id)
    await db.commit()


@router.get("/scheduled-payments", response_model=list[ScheduledPaymentOut])
async def list_scheduled(
    ctx: Ctx,
    db: DB,
    date_from: date | None = None,
    date_to: date | None = None,
    status: ScheduledPaymentStatus | None = None,
) -> list[ScheduledPaymentOut]:
    return await recurring.list_scheduled(db, ctx, date_from, date_to, status)


async def _scheduled_out(db: DB, ctx: Ctx, sp_id: uuid.UUID) -> ScheduledPaymentOut:
    items = await recurring.list_scheduled(db, ctx, None, None, None, limit=10_000)
    return next(i for i in items if i.id == sp_id)


@router.post("/scheduled-payments/{sp_id}/pay", response_model=ScheduledPaymentOut)
async def pay_scheduled(
    sp_id: uuid.UUID, body: PayScheduled, ctx: Ctx, db: DB
) -> ScheduledPaymentOut:
    await recurring.pay_scheduled(db, ctx, sp_id, body)
    await db.commit()
    return await _scheduled_out(db, ctx, sp_id)


@router.post("/scheduled-payments/{sp_id}/skip", response_model=ScheduledPaymentOut)
async def skip_scheduled(sp_id: uuid.UUID, ctx: Ctx, db: DB) -> ScheduledPaymentOut:
    await recurring.skip_scheduled(db, ctx, sp_id)
    await db.commit()
    return await _scheduled_out(db, ctx, sp_id)


# --- Savings goals --------------------------------------------------------------------


@router.get("/goals", response_model=list[GoalOut])
async def list_goals(ctx: Ctx, db: DB, include_archived: bool = False) -> list[GoalOut]:
    return await goals.list_goals(db, ctx, include_archived)


@router.post("/goals", response_model=GoalOut, status_code=201)
async def create_goal(body: GoalCreate, ctx: Ctx, db: DB) -> GoalOut:
    goal = await goals.create_goal(db, ctx, body)
    await db.commit()
    return await goals.goal_out(db, ctx, goal)


@router.patch("/goals/{goal_id}", response_model=GoalOut)
async def patch_goal(goal_id: uuid.UUID, body: GoalPatch, ctx: Ctx, db: DB) -> GoalOut:
    goal = await goals.update_goal(db, ctx, goal_id, body)
    await db.commit()
    return await goals.goal_out(db, ctx, goal)


@router.delete("/goals/{goal_id}", status_code=204)
async def delete_goal(goal_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await goals.delete_goal(db, ctx, goal_id)
    await db.commit()


@router.get("/goals/{goal_id}/contributions", response_model=list[ContributionOut])
async def list_contributions(goal_id: uuid.UUID, ctx: Ctx, db: DB) -> list[ContributionOut]:
    return [
        ContributionOut.model_validate(c) for c in await goals.list_contributions(db, ctx, goal_id)
    ]


@router.post("/goals/{goal_id}/contributions", response_model=GoalOut, status_code=201)
async def add_contribution(
    goal_id: uuid.UUID, body: ContributionCreate, ctx: Ctx, db: DB
) -> GoalOut:
    goal, achieved = await goals.add_contribution(db, ctx, goal_id, body)
    if achieved:
        await notify_family(
            db,
            ctx,
            category=NotificationCategory.goal_update,
            title=f"Цель достигнута: {goal.name} 🎉",
            body="Поздравляем! Накопления собраны полностью.",
            dedupe_base=f"goal-achieved:{goal.id}",
            link="/finance/goals",
            obj=goal,
            include_actor=True,
        )
    await db.commit()
    return await goals.goal_out(db, ctx, goal)
