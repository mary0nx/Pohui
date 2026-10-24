"""Recurring payment rules and their materialized occurrences (scheduled_payments).

Materialization is idempotent: (rule_id, due_date) is unique and inserts use
ON CONFLICT DO NOTHING, so re-running the worker never duplicates occurrences, and
scheduled_payments.transaction_id / transactions.scheduled_payment_id are unique, so a
payment can be recorded only once.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import NotFound, ValidationFailed
from app.core.time import local_today, step_date, utcnow
from app.models import Account, Family, RecurringRule, ScheduledPayment, Transaction
from app.models.enums import ScheduledPaymentStatus, TransactionKind
from app.modules.finance.schemas import (
    PayScheduled,
    RecurringCreate,
    RecurringOut,
    RecurringPatch,
    ScheduledPaymentOut,
    TransactionCreate,
)
from app.modules.finance.service import create_transaction, resolve_category
from app.security.access import FamilyContext, ensure_can_delete, get_visible, visible

HORIZON_DAYS = 62
MAX_OCCURRENCES_PER_RUN = 400


def occurrences(rule: RecurringRule, until: date, after: date | None = None) -> list[date]:
    out: list[date] = []
    n = 0
    while len(out) < MAX_OCCURRENCES_PER_RUN:
        d = step_date(rule.start_date, rule.frequency, rule.interval, n, rule.start_date.day)
        n += 1
        if d > until or (rule.end_date and d > rule.end_date):
            break
        if after is not None and d <= after:
            continue
        out.append(d)
    return out


async def materialize_rule(db: AsyncSession, rule: RecurringRule, today: date) -> int:
    if not rule.active:
        return 0
    until = today + timedelta(days=HORIZON_DAYS)
    if rule.materialized_until and rule.materialized_until >= until:
        return 0
    dates = occurrences(rule, until, after=rule.materialized_until)
    created = 0
    for d in dates:
        result = await db.execute(
            insert(ScheduledPayment)
            .values(
                id=uuid.uuid4(),
                family_id=rule.family_id,
                rule_id=rule.id,
                due_date=d,
                amount=rule.amount,
                status=ScheduledPaymentStatus.pending,
            )
            .on_conflict_do_nothing(index_elements=["rule_id", "due_date"])
        )
        created += result.rowcount or 0  # type: ignore[attr-defined]
    rule.materialized_until = until
    return created


async def _validate_refs(
    db: AsyncSession,
    ctx: FamilyContext,
    kind: TransactionKind,
    account_id: uuid.UUID | None,
    category_id: uuid.UUID | None,
    visibility_required: object | None = None,
) -> Account | None:
    account = None
    if account_id:
        account = await get_visible(db, Account, account_id, ctx)
        if visibility_required is not None and account.visibility != visibility_required:
            raise ValidationFailed("Видимость счёта должна совпадать с видимостью платежа")
    await resolve_category(db, ctx, category_id, kind)
    return account


async def create_rule(db: AsyncSession, ctx: FamilyContext, data: RecurringCreate) -> RecurringRule:
    if data.end_date and data.end_date < data.start_date:
        raise ValidationFailed("Дата окончания раньше даты начала")
    await _validate_refs(db, ctx, data.kind, data.account_id, data.category_id, data.visibility)
    rule = RecurringRule(
        family_id=ctx.family_id,
        name=data.name,
        kind=data.kind,
        amount=data.amount,
        currency=ctx.family.currency,
        account_id=data.account_id,
        category_id=data.category_id,
        frequency=data.frequency,
        interval=data.interval,
        start_date=data.start_date,
        end_date=data.end_date,
        remind_days_before=data.remind_days_before,
        auto_create=data.auto_create,
        active=True,
        visibility=data.visibility,
        created_by=ctx.user_id,
    )
    db.add(rule)
    await db.flush()
    await materialize_rule(db, rule, local_today(ctx.family.timezone))
    audit(db, ctx, "recurring.create", "recurring_rule", rule.id, rule.name, obj=rule)
    return rule


async def update_rule(
    db: AsyncSession, ctx: FamilyContext, rule_id: uuid.UUID, data: RecurringPatch
) -> RecurringRule:
    rule = await get_visible(db, RecurringRule, rule_id, ctx, lock=True)
    today = local_today(ctx.family.timezone)
    schedule_changed = False
    for field in ("frequency", "interval", "start_date", "end_date"):
        value = getattr(data, field)
        if value is not None and value != getattr(rule, field):
            setattr(rule, field, value)
            schedule_changed = True
    if data.clear_end_date and rule.end_date is not None:
        rule.end_date = None
        schedule_changed = True
    if rule.end_date and rule.end_date < rule.start_date:
        raise ValidationFailed("Дата окончания раньше даты начала")
    if data.account_id is not None or data.category_id is not None:
        await _validate_refs(
            db, ctx, rule.kind, data.account_id, data.category_id, rule.visibility
        )
        if data.account_id is not None:
            rule.account_id = data.account_id
        if data.category_id is not None:
            rule.category_id = data.category_id
    for field in ("name", "remind_days_before", "auto_create"):
        value = getattr(data, field)
        if value is not None:
            setattr(rule, field, value)
    pending_future = (
        ScheduledPayment.rule_id == rule.id,
        ScheduledPayment.status == ScheduledPaymentStatus.pending,
        ScheduledPayment.due_date >= today,
    )
    if data.active is not None and data.active != rule.active:
        rule.active = data.active
        if not data.active:
            await db.execute(delete(ScheduledPayment).where(*pending_future))
            rule.materialized_until = None
        else:
            schedule_changed = True
    if data.amount is not None and data.amount != rule.amount:
        rule.amount = data.amount
        for sp in (await db.execute(select(ScheduledPayment).where(*pending_future))).scalars():
            sp.amount = data.amount
    if schedule_changed:
        await db.execute(delete(ScheduledPayment).where(*pending_future))
        # Re-materialize from today: keep past occurrences, regenerate the future ones.
        rule.materialized_until = today - timedelta(days=1)
        await db.flush()
        await materialize_rule(db, rule, today)
    audit(db, ctx, "recurring.update", "recurring_rule", rule.id, rule.name, obj=rule)
    await db.flush()
    return rule


async def delete_rule(db: AsyncSession, ctx: FamilyContext, rule_id: uuid.UUID) -> None:
    rule = await get_visible(db, RecurringRule, rule_id, ctx)
    ensure_can_delete(rule, ctx)
    audit(db, ctx, "recurring.delete", "recurring_rule", rule.id, rule.name, obj=rule)
    await db.delete(rule)


async def list_rules(db: AsyncSession, ctx: FamilyContext) -> list[RecurringOut]:
    rules = (
        await db.execute(
            select(RecurringRule).where(visible(RecurringRule, ctx)).order_by(RecurringRule.name)
        )
    ).scalars().all()
    next_due = dict(
        (
            await db.execute(
                select(ScheduledPayment.rule_id, func.min(ScheduledPayment.due_date))
                .where(
                    ScheduledPayment.family_id == ctx.family_id,
                    ScheduledPayment.status == ScheduledPaymentStatus.pending,
                )
                .group_by(ScheduledPayment.rule_id)
            )
        ).all()
    )
    out = []
    for r in rules:
        item = RecurringOut.model_validate(r)
        item.next_due_date = next_due.get(r.id)
        out.append(item)
    return out


async def list_scheduled(
    db: AsyncSession,
    ctx: FamilyContext,
    date_from: date | None,
    date_to: date | None,
    status: ScheduledPaymentStatus | None,
    limit: int = 100,
) -> list[ScheduledPaymentOut]:
    today = local_today(ctx.family.timezone)
    stmt = (
        select(ScheduledPayment, RecurringRule)
        .join(RecurringRule, RecurringRule.id == ScheduledPayment.rule_id)
        .where(visible(RecurringRule, ctx))
    )
    if date_from:
        stmt = stmt.where(ScheduledPayment.due_date >= date_from)
    if date_to:
        stmt = stmt.where(ScheduledPayment.due_date <= date_to)
    if status:
        stmt = stmt.where(ScheduledPayment.status == status)
    rows = (await db.execute(stmt.order_by(ScheduledPayment.due_date).limit(limit))).all()
    out = []
    for sp, rule in rows:
        item = ScheduledPaymentOut.model_validate(sp)
        item.rule_name = rule.name
        item.kind = rule.kind
        item.currency = rule.currency
        item.overdue = sp.status == ScheduledPaymentStatus.pending and sp.due_date < today
        out.append(item)
    return out


async def _load_scheduled(
    db: AsyncSession, ctx: FamilyContext, sp_id: uuid.UUID
) -> tuple[ScheduledPayment, RecurringRule]:
    row = (
        await db.execute(
            select(ScheduledPayment, RecurringRule)
            .join(RecurringRule, RecurringRule.id == ScheduledPayment.rule_id)
            .where(ScheduledPayment.id == sp_id, visible(RecurringRule, ctx))
            .with_for_update(of=ScheduledPayment)
        )
    ).first()
    if row is None:
        raise NotFound("Платёж не найден")
    return row[0], row[1]


def _due_instant(due: date, zone: str) -> datetime:
    return datetime.combine(due, time(12, 0), tzinfo=ZoneInfo(zone))


async def pay_scheduled(
    db: AsyncSession, ctx: FamilyContext, sp_id: uuid.UUID, data: PayScheduled
) -> ScheduledPayment:
    sp, rule = await _load_scheduled(db, ctx, sp_id)
    if sp.status == ScheduledPaymentStatus.paid:
        return sp  # idempotent: paying twice does not create a second transaction
    account_id = data.account_id or rule.account_id
    if account_id is None:
        raise ValidationFailed("Укажите счёт для оплаты")
    account = await get_visible(db, Account, account_id, ctx)
    if account.visibility != rule.visibility:
        raise ValidationFailed("Видимость счёта должна совпадать с видимостью платежа")
    tx = await create_transaction(
        db,
        ctx,
        TransactionCreate(
            kind=rule.kind,
            amount=data.amount or sp.amount,
            account_id=account_id,
            category_id=rule.category_id,
            occurred_at=data.occurred_at or min(utcnow(), _due_instant(sp.due_date, ctx.family.timezone)),
            description=rule.name,
        ),
        source="scheduled",
    )
    tx.recurring_rule_id = rule.id
    tx.scheduled_payment_id = sp.id
    sp.status = ScheduledPaymentStatus.paid
    sp.transaction_id = tx.id
    sp.resolved_at = utcnow()
    sp.resolved_by = ctx.user_id
    await db.flush()
    return sp


async def skip_scheduled(db: AsyncSession, ctx: FamilyContext, sp_id: uuid.UUID) -> ScheduledPayment:
    sp, rule = await _load_scheduled(db, ctx, sp_id)
    if sp.status == ScheduledPaymentStatus.paid:
        raise ValidationFailed("Платёж уже оплачен")
    sp.status = ScheduledPaymentStatus.skipped
    sp.resolved_at = utcnow()
    sp.resolved_by = ctx.user_id
    audit(db, ctx, "scheduled.skip", "scheduled_payment", sp.id, rule.name, obj=rule)
    await db.flush()
    return sp


async def auto_create_due(db: AsyncSession) -> int:
    """Worker job: record transactions for auto_create rules whose due date has come."""
    from app.models import FamilyMember, User
    from app.security.access import FamilyContext as Ctx

    rows = (
        await db.execute(
            select(ScheduledPayment, RecurringRule, Family)
            .join(RecurringRule, RecurringRule.id == ScheduledPayment.rule_id)
            .join(Family, Family.id == ScheduledPayment.family_id)
            .where(
                ScheduledPayment.status == ScheduledPaymentStatus.pending,
                RecurringRule.auto_create.is_(True),
                RecurringRule.active.is_(True),
                RecurringRule.account_id.is_not(None),
                ScheduledPayment.due_date <= func.date(func.timezone(Family.timezone, func.now())),
            )
            .with_for_update(of=ScheduledPayment, skip_locked=True)
            .limit(200)
        )
    ).all()
    created = 0
    for sp, rule, family in rows:
        if rule.created_by is None:
            continue
        member = await db.scalar(
            select(FamilyMember).where(
                FamilyMember.family_id == family.id, FamilyMember.user_id == rule.created_by
            )
        )
        user = await db.get(User, rule.created_by)
        if member is None or user is None:
            continue
        ctx = Ctx(user=user, family=family, member=member)
        account = await db.get(Account, rule.account_id)
        if account is None or account.archived_at is not None or account.visibility != rule.visibility:
            continue
        tx = Transaction(
            family_id=family.id,
            kind=rule.kind,
            amount=sp.amount,
            currency=account.currency,
            account_id=account.id,
            category_id=rule.category_id,
            occurred_at=_due_instant(sp.due_date, family.timezone),
            description=rule.name,
            visibility=rule.visibility,
            created_by=rule.created_by,
            recurring_rule_id=rule.id,
            scheduled_payment_id=sp.id,
        )
        db.add(tx)
        await db.flush()
        sp.status = ScheduledPaymentStatus.paid
        sp.transaction_id = tx.id
        sp.resolved_at = utcnow()
        audit(db, ctx, "scheduled.auto_pay", "scheduled_payment", sp.id, rule.name, obj=rule)
        created += 1
    return created
