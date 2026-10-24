"""Accounts, categories, transactions, budgets, recurring payments and savings goals."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Money, Timestamps, UUIDPk
from app.models.common import family_fk, user_fk, visibility_col
from app.models.enums import (
    AccountKind,
    CategoryKind,
    Frequency,
    GoalStatus,
    PaymentMethod,
    ScheduledPaymentStatus,
    TransactionKind,
    Visibility,
    enum_type,
)


class Account(UUIDPk, Timestamps, Base):
    __tablename__ = "accounts"

    family_id: Mapped[uuid.UUID] = family_fk()
    name: Mapped[str] = mapped_column(sa.String(100))
    kind: Mapped[AccountKind] = mapped_column(enum_type(AccountKind, "account_kind"))
    currency: Mapped[str] = mapped_column(sa.String(3))
    initial_balance: Mapped[Money] = mapped_column(server_default="0")
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()
    archived_at: Mapped[datetime | None]


class Category(UUIDPk, Timestamps, Base):
    __tablename__ = "categories"
    __table_args__ = (
        sa.UniqueConstraint(
            "family_id", "parent_id", "kind", "name", postgresql_nulls_not_distinct=True
        ),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("categories.id", ondelete="CASCADE")
    )
    kind: Mapped[CategoryKind] = mapped_column(enum_type(CategoryKind, "category_kind"))
    name: Mapped[str] = mapped_column(sa.String(64))
    icon: Mapped[str | None] = mapped_column(sa.String(32))
    color: Mapped[str | None] = mapped_column(sa.String(16))
    archived_at: Mapped[datetime | None]


class Transaction(UUIDPk, Timestamps, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        sa.CheckConstraint("amount > 0", name="amount_positive"),
        sa.CheckConstraint(
            "(kind = 'transfer') = (to_account_id IS NOT NULL)", name="transfer_has_target"
        ),
        sa.CheckConstraint(
            "to_account_id IS NULL OR to_account_id <> account_id", name="transfer_distinct"
        ),
        sa.Index("ix_transactions_family_occurred", "family_id", "occurred_at"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    kind: Mapped[TransactionKind] = mapped_column(enum_type(TransactionKind, "transaction_kind"))
    amount: Mapped[Money]
    currency: Mapped[str] = mapped_column(sa.String(3))
    account_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("accounts.id", ondelete="RESTRICT"), index=True
    )
    to_account_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("accounts.id", ondelete="RESTRICT")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    occurred_at: Mapped[datetime]
    description: Mapped[str | None] = mapped_column(sa.String(500))
    merchant: Mapped[str | None] = mapped_column(sa.String(200))
    payment_method: Mapped[PaymentMethod | None] = mapped_column(
        enum_type(PaymentMethod, "payment_method")
    )
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()
    receipt_document_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("documents.id", ondelete="SET NULL")
    )
    recurring_rule_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("recurring_rules.id", ondelete="SET NULL")
    )
    scheduled_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("scheduled_payments.id", ondelete="SET NULL", use_alter=True), unique=True
    )
    import_hash: Mapped[str | None] = mapped_column(sa.String(64))


class Budget(UUIDPk, Timestamps, Base):
    """Monthly limit. category_id NULL means the overall monthly budget."""

    __tablename__ = "budgets"
    __table_args__ = (
        sa.UniqueConstraint("family_id", "month", "category_id", postgresql_nulls_not_distinct=True),
        sa.CheckConstraint("limit_amount >= 0", name="limit_non_negative"),
        sa.CheckConstraint("EXTRACT(DAY FROM month) = 1", name="month_first_day"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    month: Mapped[date]
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("categories.id", ondelete="CASCADE")
    )
    limit_amount: Mapped[Money]
    created_by: Mapped[uuid.UUID | None] = user_fk()


class RecurringRule(UUIDPk, Timestamps, Base):
    """Recurrence rule for a regular payment; real payments live in scheduled_payments."""

    __tablename__ = "recurring_rules"
    __table_args__ = (
        sa.CheckConstraint("amount > 0", name="amount_positive"),
        sa.CheckConstraint("interval BETWEEN 1 AND 366", name="interval_range"),
        sa.CheckConstraint("remind_days_before BETWEEN 0 AND 30", name="remind_range"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    name: Mapped[str] = mapped_column(sa.String(100))
    kind: Mapped[TransactionKind] = mapped_column(enum_type(TransactionKind, "rule_kind"))
    amount: Mapped[Money]
    currency: Mapped[str] = mapped_column(sa.String(3))
    account_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("accounts.id", ondelete="SET NULL")
    )
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("categories.id", ondelete="SET NULL")
    )
    frequency: Mapped[Frequency] = mapped_column(enum_type(Frequency, "frequency"))
    interval: Mapped[int] = mapped_column(server_default="1")
    start_date: Mapped[date]
    end_date: Mapped[date | None]
    remind_days_before: Mapped[int] = mapped_column(server_default="1")
    auto_create: Mapped[bool] = mapped_column(server_default=sa.false())
    active: Mapped[bool] = mapped_column(server_default=sa.true())
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()
    # Last date up to which occurrences were materialized.
    materialized_until: Mapped[date | None]


class ScheduledPayment(UUIDPk, Timestamps, Base):
    __tablename__ = "scheduled_payments"
    __table_args__ = (
        sa.UniqueConstraint("rule_id", "due_date"),
        sa.Index("ix_scheduled_payments_family_due", "family_id", "due_date"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    rule_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("recurring_rules.id", ondelete="CASCADE")
    )
    due_date: Mapped[date]
    amount: Mapped[Money]
    status: Mapped[ScheduledPaymentStatus] = mapped_column(
        enum_type(ScheduledPaymentStatus, "scheduled_payment_status"),
        server_default=ScheduledPaymentStatus.pending.value,
        default=ScheduledPaymentStatus.pending,
    )
    transaction_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("transactions.id", ondelete="SET NULL")
    )
    resolved_at: Mapped[datetime | None]
    resolved_by: Mapped[uuid.UUID | None] = user_fk()


class SavingsGoal(UUIDPk, Timestamps, Base):
    __tablename__ = "savings_goals"
    __table_args__ = (sa.CheckConstraint("target_amount > 0", name="target_positive"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    name: Mapped[str] = mapped_column(sa.String(100))
    target_amount: Mapped[Money]
    currency: Mapped[str] = mapped_column(sa.String(3))
    target_date: Mapped[date | None]
    emoji: Mapped[str | None] = mapped_column(sa.String(16))
    status: Mapped[GoalStatus] = mapped_column(
        enum_type(GoalStatus, "goal_status"),
        server_default=GoalStatus.active.value,
        default=GoalStatus.active,
    )
    achieved_at: Mapped[datetime | None]
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()


class SavingsContribution(UUIDPk, Base):
    __tablename__ = "savings_contributions"
    __table_args__ = (sa.CheckConstraint("amount <> 0", name="amount_non_zero"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    goal_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("savings_goals.id", ondelete="CASCADE"), index=True
    )
    # Negative amount = withdrawal.
    amount: Mapped[Decimal] = mapped_column(sa.Numeric(14, 2))
    contributed_on: Mapped[date]
    note: Mapped[str | None] = mapped_column(sa.String(200))
    created_by: Mapped[uuid.UUID | None] = user_fk()
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())
