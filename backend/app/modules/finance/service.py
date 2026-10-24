"""Accounts, categories and transactions.

Visibility rule: a transaction inherits the visibility of its account. Private accounts
are usable only by their owner, transfers are only allowed between accounts with the same
visibility. This keeps balances identical for every member who can see an account.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import Conflict, ValidationFailed
from app.core.schemas import Page
from app.core.time import local_day_bounds, utcnow
from app.models import Account, Category, Document, Transaction
from app.models.enums import CategoryKind, TransactionKind
from app.modules.finance.schemas import (
    AccountCreate,
    AccountOut,
    AccountPatch,
    CategoryCreate,
    CategoryPatch,
    TransactionCreate,
    TransactionFilters,
    TransactionOut,
    TransactionPatch,
)
from app.security.access import FamilyContext, ensure_can_delete, get_visible, visible

# --- Accounts -------------------------------------------------------------------------


async def account_balances(db: AsyncSession, ctx: FamilyContext) -> dict[uuid.UUID, Decimal]:
    rows = (
        await db.execute(select(Account.id, Account.initial_balance).where(visible(Account, ctx)))
    ).all()
    balances = {r.id: Decimal(r.initial_balance) for r in rows}
    if not balances:
        return balances
    src = (
        await db.execute(
            select(
                Transaction.account_id,
                func.sum(
                    case(
                        (
                            Transaction.kind.in_([TransactionKind.income, TransactionKind.refund]),
                            Transaction.amount,
                        ),
                        else_=-Transaction.amount,
                    )
                ),
            )
            .where(visible(Transaction, ctx))
            .group_by(Transaction.account_id)
        )
    ).all()
    for account_id, total in src:
        if account_id in balances:
            balances[account_id] += Decimal(total or 0)
    dst = (
        await db.execute(
            select(Transaction.to_account_id, func.sum(Transaction.amount))
            .where(visible(Transaction, ctx), Transaction.to_account_id.is_not(None))
            .group_by(Transaction.to_account_id)
        )
    ).all()
    for account_id, total in dst:
        if account_id in balances:
            balances[account_id] += Decimal(total or 0)
    return balances


async def list_accounts(
    db: AsyncSession, ctx: FamilyContext, include_archived: bool = False
) -> list[AccountOut]:
    stmt = select(Account).where(visible(Account, ctx)).order_by(Account.created_at)
    if not include_archived:
        stmt = stmt.where(Account.archived_at.is_(None))
    accounts = (await db.execute(stmt)).scalars().all()
    balances = await account_balances(db, ctx)
    out = []
    for acc in accounts:
        item = AccountOut.model_validate(acc)
        item.balance = balances.get(acc.id, Decimal(acc.initial_balance))
        out.append(item)
    return out


async def create_account(db: AsyncSession, ctx: FamilyContext, data: AccountCreate) -> Account:
    acc = Account(
        family_id=ctx.family_id,
        name=data.name,
        kind=data.kind,
        currency=ctx.family.currency,
        initial_balance=data.initial_balance,
        visibility=data.visibility,
        created_by=ctx.user_id,
    )
    db.add(acc)
    await db.flush()
    audit(db, ctx, "account.create", "account", acc.id, acc.name, obj=acc)
    return acc


async def update_account(
    db: AsyncSession, ctx: FamilyContext, account_id: uuid.UUID, data: AccountPatch
) -> Account:
    acc = await get_visible(db, Account, account_id, ctx)
    if data.name is not None:
        acc.name = data.name
    if data.kind is not None:
        acc.kind = data.kind
    if data.initial_balance is not None:
        acc.initial_balance = data.initial_balance
    if data.archived is not None:
        acc.archived_at = utcnow() if data.archived else None
    audit(db, ctx, "account.update", "account", acc.id, acc.name, obj=acc)
    await db.flush()
    return acc


async def delete_account(db: AsyncSession, ctx: FamilyContext, account_id: uuid.UUID) -> None:
    acc = await get_visible(db, Account, account_id, ctx)
    ensure_can_delete(acc, ctx)
    used = await db.scalar(
        select(func.count())
        .select_from(Transaction)
        .where(or_(Transaction.account_id == acc.id, Transaction.to_account_id == acc.id))
    )
    if used:
        raise Conflict(
            "По счёту есть операции — его можно только архивировать", code="account_in_use"
        )
    audit(db, ctx, "account.delete", "account", acc.id, acc.name, obj=acc)
    await db.delete(acc)


async def _usable_account(db: AsyncSession, ctx: FamilyContext, account_id: uuid.UUID) -> Account:
    acc = await get_visible(db, Account, account_id, ctx)
    if acc.archived_at is not None:
        raise ValidationFailed("Счёт в архиве")
    return acc


# --- Categories -----------------------------------------------------------------------


async def list_categories(
    db: AsyncSession, ctx: FamilyContext, include_archived: bool = False
) -> list[Category]:
    stmt = select(Category).where(Category.family_id == ctx.family_id)
    if not include_archived:
        stmt = stmt.where(Category.archived_at.is_(None))
    return list((await db.execute(stmt.order_by(Category.kind, Category.name))).scalars())


async def create_category(db: AsyncSession, ctx: FamilyContext, data: CategoryCreate) -> Category:
    if data.parent_id:
        parent = await get_visible(db, Category, data.parent_id, ctx)
        if parent.parent_id is not None:
            raise ValidationFailed("Допускается только один уровень подкатегорий")
        if parent.kind != data.kind:
            raise ValidationFailed("Тип подкатегории должен совпадать с родительской")
    exists = await db.scalar(
        select(Category.id).where(
            Category.family_id == ctx.family_id,
            Category.kind == data.kind,
            Category.name == data.name,
            Category.parent_id.is_(None)
            if data.parent_id is None
            else Category.parent_id == data.parent_id,
        )
    )
    if exists:
        raise Conflict("Такая категория уже есть")
    cat = Category(
        family_id=ctx.family_id,
        parent_id=data.parent_id,
        kind=data.kind,
        name=data.name,
        icon=data.icon,
        color=data.color,
    )
    db.add(cat)
    await db.flush()
    return cat


async def update_category(
    db: AsyncSession, ctx: FamilyContext, category_id: uuid.UUID, data: CategoryPatch
) -> Category:
    cat = await get_visible(db, Category, category_id, ctx)
    for field in ("name", "icon", "color"):
        value = getattr(data, field)
        if value is not None:
            setattr(cat, field, value)
    if data.archived is not None:
        cat.archived_at = utcnow() if data.archived else None
    await db.flush()
    return cat


async def resolve_category(
    db: AsyncSession, ctx: FamilyContext, category_id: uuid.UUID | None, kind: TransactionKind
) -> Category | None:
    if category_id is None or kind == TransactionKind.transfer:
        return None
    cat = await get_visible(db, Category, category_id, ctx)
    expected = CategoryKind.income if kind == TransactionKind.income else CategoryKind.expense
    if cat.kind != expected:
        raise ValidationFailed("Категория не подходит для этого типа операции")
    return cat


# --- Transactions ---------------------------------------------------------------------


async def _validate_accounts(
    db: AsyncSession,
    ctx: FamilyContext,
    kind: TransactionKind,
    account_id: uuid.UUID,
    to_account_id: uuid.UUID | None,
) -> tuple[Account, Account | None]:
    account = await _usable_account(db, ctx, account_id)
    target = None
    if kind == TransactionKind.transfer:
        if to_account_id is None:
            raise ValidationFailed("Для перевода укажите счёт получателя")
        if to_account_id == account_id:
            raise ValidationFailed("Счета перевода должны различаться")
        target = await _usable_account(db, ctx, to_account_id)
        if target.currency != account.currency:
            raise ValidationFailed("Переводы между валютами пока не поддерживаются")
        if target.visibility != account.visibility:
            raise ValidationFailed(
                "Перевод возможен только между общими или только между личными счетами"
            )
    elif to_account_id is not None:
        raise ValidationFailed("Счёт получателя указывается только для перевода")
    return account, target


async def _validate_receipt(
    db: AsyncSession, ctx: FamilyContext, document_id: uuid.UUID | None
) -> None:
    if document_id is not None:
        await get_visible(db, Document, document_id, ctx)


async def create_transaction(
    db: AsyncSession, ctx: FamilyContext, data: TransactionCreate, *, source: str = "app"
) -> Transaction:
    account, _ = await _validate_accounts(db, ctx, data.kind, data.account_id, data.to_account_id)
    await resolve_category(db, ctx, data.category_id, data.kind)
    await _validate_receipt(db, ctx, data.receipt_document_id)
    tx = Transaction(
        family_id=ctx.family_id,
        kind=data.kind,
        amount=data.amount,
        currency=account.currency,
        account_id=account.id,
        to_account_id=data.to_account_id,
        category_id=data.category_id if data.kind != TransactionKind.transfer else None,
        occurred_at=data.occurred_at or utcnow(),
        description=data.description or None,
        merchant=data.merchant or None,
        payment_method=data.payment_method,
        visibility=account.visibility,
        created_by=ctx.user_id,
        receipt_document_id=data.receipt_document_id,
    )
    db.add(tx)
    await db.flush()
    audit(
        db,
        ctx,
        f"transaction.create.{source}",
        "transaction",
        tx.id,
        f"{tx.kind}: {tx.amount} {tx.currency}",
        obj=tx,
    )
    return tx


async def update_transaction(
    db: AsyncSession, ctx: FamilyContext, tx_id: uuid.UUID, data: TransactionPatch
) -> Transaction:
    tx = await get_visible(db, Transaction, tx_id, ctx, lock=True)
    account_id = data.account_id or tx.account_id
    to_account_id = data.to_account_id if data.to_account_id is not None else tx.to_account_id
    if data.account_id is not None or data.to_account_id is not None:
        account, _ = await _validate_accounts(db, ctx, tx.kind, account_id, to_account_id)
        if account.visibility != tx.visibility:
            raise ValidationFailed("Нельзя перенести операцию между общим и личным счётом")
        tx.account_id = account_id
        tx.to_account_id = to_account_id
    if data.clear_category:
        tx.category_id = None
    elif data.category_id is not None:
        await resolve_category(db, ctx, data.category_id, tx.kind)
        tx.category_id = data.category_id
    if data.receipt_document_id is not None:
        await _validate_receipt(db, ctx, data.receipt_document_id)
        tx.receipt_document_id = data.receipt_document_id
    for field in ("amount", "occurred_at", "description", "merchant", "payment_method"):
        value = getattr(data, field)
        if value is not None:
            setattr(tx, field, value)
    audit(db, ctx, "transaction.update", "transaction", tx.id, f"{tx.amount} {tx.currency}", obj=tx)
    await db.flush()
    return tx


async def delete_transaction(db: AsyncSession, ctx: FamilyContext, tx_id: uuid.UUID) -> None:
    from app.models import ScheduledPayment
    from app.models.enums import ScheduledPaymentStatus

    tx = await get_visible(db, Transaction, tx_id, ctx, lock=True)
    ensure_can_delete(tx, ctx)
    if tx.scheduled_payment_id:
        sp = await db.get(ScheduledPayment, tx.scheduled_payment_id)
        if sp is not None:
            sp.status = ScheduledPaymentStatus.pending
            sp.transaction_id = None
            sp.resolved_at = None
    audit(db, ctx, "transaction.delete", "transaction", tx.id, f"{tx.amount} {tx.currency}", obj=tx)
    await db.delete(tx)


def _apply_filters(stmt, ctx: FamilyContext, f: TransactionFilters):  # type: ignore[no-untyped-def]
    tz = ctx.family.timezone
    stmt = stmt.where(visible(Transaction, ctx))
    if f.date_from:
        stmt = stmt.where(Transaction.occurred_at >= local_day_bounds(f.date_from, tz)[0])
    if f.date_to:
        stmt = stmt.where(Transaction.occurred_at < local_day_bounds(f.date_to, tz)[1])
    if f.kind:
        stmt = stmt.where(Transaction.kind == f.kind)
    if f.category_id:
        sub = select(Category.id).where(
            Category.family_id == ctx.family_id,
            or_(Category.id == f.category_id, Category.parent_id == f.category_id),
        )
        stmt = stmt.where(Transaction.category_id.in_(sub))
    if f.account_id:
        stmt = stmt.where(
            or_(Transaction.account_id == f.account_id, Transaction.to_account_id == f.account_id)
        )
    if f.member_id:
        stmt = stmt.where(Transaction.created_by == f.member_id)
    if f.visibility:
        stmt = stmt.where(Transaction.visibility == f.visibility)
    if f.q:
        pattern = f"%{f.q.replace('%', r'\%').replace('_', r'\_')}%"
        stmt = stmt.where(
            or_(Transaction.description.ilike(pattern), Transaction.merchant.ilike(pattern))
        )
    return stmt


async def search_transactions(
    db: AsyncSession, ctx: FamilyContext, f: TransactionFilters
) -> Page[TransactionOut]:
    base = _apply_filters(select(Transaction), ctx, f)
    total = await db.scalar(select(func.count()).select_from(base.subquery()))
    column = getattr(Transaction, f.sort.lstrip("-"))
    order = column.desc() if f.sort.startswith("-") else column.asc()
    rows = (
        await db.execute(base.order_by(order, Transaction.id).limit(f.limit).offset(f.offset))
    ).scalars()
    return Page(
        items=[TransactionOut.model_validate(t) for t in rows],
        total=total or 0,
        limit=f.limit,
        offset=f.offset,
    )


async def get_transaction(db: AsyncSession, ctx: FamilyContext, tx_id: uuid.UUID) -> Transaction:
    return await get_visible(db, Transaction, tx_id, ctx)
