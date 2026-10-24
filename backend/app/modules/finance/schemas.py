from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.schemas import (
    MoneyValue,
    Name,
    ORMModel,
    PositiveMoney,
    ShortText,
)
from app.models.enums import (
    AccountKind,
    CategoryKind,
    Frequency,
    GoalStatus,
    PaymentMethod,
    ScheduledPaymentStatus,
    TransactionKind,
    Visibility,
)

# --- Accounts -------------------------------------------------------------------------


class AccountCreate(BaseModel):
    name: Name
    kind: AccountKind = AccountKind.card
    initial_balance: MoneyValue = Decimal("0")
    visibility: Visibility = Visibility.family


class AccountPatch(BaseModel):
    name: Name | None = None
    kind: AccountKind | None = None
    initial_balance: MoneyValue | None = None
    archived: bool | None = None


class AccountOut(ORMModel):
    id: uuid.UUID
    name: str
    kind: AccountKind
    currency: str
    initial_balance: Decimal
    balance: Decimal = Decimal("0")
    visibility: Visibility
    created_by: uuid.UUID | None
    archived_at: datetime | None


# --- Categories -----------------------------------------------------------------------


class CategoryCreate(BaseModel):
    name: Name
    kind: CategoryKind = CategoryKind.expense
    parent_id: uuid.UUID | None = None
    icon: str | None = Field(None, max_length=32)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")


class CategoryPatch(BaseModel):
    name: Name | None = None
    icon: str | None = Field(None, max_length=32)
    color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    archived: bool | None = None


class CategoryOut(ORMModel):
    id: uuid.UUID
    name: str
    kind: CategoryKind
    parent_id: uuid.UUID | None
    icon: str | None
    color: str | None
    archived_at: datetime | None


# --- Transactions ---------------------------------------------------------------------


class TransactionCreate(BaseModel):
    kind: TransactionKind
    amount: PositiveMoney
    account_id: uuid.UUID
    to_account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    occurred_at: datetime | None = None
    description: ShortText | None = None
    merchant: str | None = Field(None, max_length=200)
    payment_method: PaymentMethod | None = None
    receipt_document_id: uuid.UUID | None = None

    @field_validator("occurred_at")
    @classmethod
    def _aware(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            raise ValueError("Дата должна содержать часовой пояс")
        return v


class TransactionPatch(BaseModel):
    amount: PositiveMoney | None = None
    account_id: uuid.UUID | None = None
    to_account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    clear_category: bool = False
    occurred_at: datetime | None = None
    description: ShortText | None = None
    merchant: str | None = Field(None, max_length=200)
    payment_method: PaymentMethod | None = None
    receipt_document_id: uuid.UUID | None = None


class TransactionOut(ORMModel):
    id: uuid.UUID
    kind: TransactionKind
    amount: Decimal
    currency: str
    account_id: uuid.UUID
    to_account_id: uuid.UUID | None
    category_id: uuid.UUID | None
    occurred_at: datetime
    description: str | None
    merchant: str | None
    payment_method: PaymentMethod | None
    visibility: Visibility
    created_by: uuid.UUID | None
    receipt_document_id: uuid.UUID | None
    scheduled_payment_id: uuid.UUID | None
    created_at: datetime


class TransactionFilters(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    kind: TransactionKind | None = None
    category_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    member_id: uuid.UUID | None = None
    visibility: Visibility | None = None
    q: str | None = Field(None, max_length=100)
    sort: str = Field("-occurred_at", pattern=r"^-?(occurred_at|amount|created_at)$")
    limit: int = Field(50, ge=1, le=200)
    offset: int = Field(0, ge=0)


# --- Summary --------------------------------------------------------------------------


class CategoryTotal(BaseModel):
    category_id: uuid.UUID | None
    name: str
    icon: str | None
    color: str | None
    amount: Decimal
    budget: Decimal | None = None


class MemberTotal(BaseModel):
    user_id: uuid.UUID | None
    name: str
    expense: Decimal
    income: Decimal


class DayTotal(BaseModel):
    day: date
    expense: Decimal
    income: Decimal


class MonthTotal(BaseModel):
    month: date
    expense: Decimal
    income: Decimal


class Totals(BaseModel):
    income: Decimal
    expense: Decimal
    net: Decimal


class BudgetStatus(BaseModel):
    limit: Decimal
    spent: Decimal
    remaining: Decimal
    percent: float
    level: str  # ok | warning | exceeded


class FinanceSummary(BaseModel):
    month: date
    currency: str
    family: Totals
    personal: Totals
    by_category: list[CategoryTotal]
    by_member: list[MemberTotal]
    daily: list[DayTotal]
    history: list[MonthTotal]
    budget: BudgetStatus | None
    category_alerts: list[CategoryTotal]
    other_currency_count: int


# --- Budgets --------------------------------------------------------------------------


class BudgetUpsert(BaseModel):
    month: date
    category_id: uuid.UUID | None = None
    limit_amount: MoneyValue = Field(ge=0)

    @field_validator("month")
    @classmethod
    def _first(cls, v: date) -> date:
        return v.replace(day=1)


class BudgetOut(ORMModel):
    id: uuid.UUID
    month: date
    category_id: uuid.UUID | None
    limit_amount: Decimal
    spent: Decimal = Decimal("0")
    percent: float = 0.0
    level: str = "ok"


class BudgetCopy(BaseModel):
    from_month: date
    to_month: date


# --- Recurring payments ---------------------------------------------------------------


class RecurringCreate(BaseModel):
    name: Name
    kind: TransactionKind = TransactionKind.expense
    amount: PositiveMoney
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    frequency: Frequency = Frequency.monthly
    interval: int = Field(1, ge=1, le=366)
    start_date: date
    end_date: date | None = None
    remind_days_before: int = Field(1, ge=0, le=30)
    auto_create: bool = False
    visibility: Visibility = Visibility.family

    @field_validator("kind")
    @classmethod
    def _kind(cls, v: TransactionKind) -> TransactionKind:
        if v not in (TransactionKind.expense, TransactionKind.income):
            raise ValueError("Регулярной может быть только операция дохода или расхода")
        return v


class RecurringPatch(BaseModel):
    name: Name | None = None
    amount: PositiveMoney | None = None
    account_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    frequency: Frequency | None = None
    interval: int | None = Field(None, ge=1, le=366)
    start_date: date | None = None
    end_date: date | None = None
    clear_end_date: bool = False
    remind_days_before: int | None = Field(None, ge=0, le=30)
    auto_create: bool | None = None
    active: bool | None = None


class RecurringOut(ORMModel):
    id: uuid.UUID
    name: str
    kind: TransactionKind
    amount: Decimal
    currency: str
    account_id: uuid.UUID | None
    category_id: uuid.UUID | None
    frequency: Frequency
    interval: int
    start_date: date
    end_date: date | None
    remind_days_before: int
    auto_create: bool
    active: bool
    visibility: Visibility
    next_due_date: date | None = None


class ScheduledPaymentOut(ORMModel):
    id: uuid.UUID
    rule_id: uuid.UUID
    rule_name: str = ""
    kind: TransactionKind = TransactionKind.expense
    due_date: date
    amount: Decimal
    currency: str = ""
    status: ScheduledPaymentStatus
    transaction_id: uuid.UUID | None
    overdue: bool = False


class PayScheduled(BaseModel):
    account_id: uuid.UUID | None = None
    amount: PositiveMoney | None = None
    occurred_at: datetime | None = None


# --- Savings goals --------------------------------------------------------------------


class GoalCreate(BaseModel):
    name: Name
    target_amount: PositiveMoney
    target_date: date | None = None
    emoji: str | None = Field(None, max_length=16)
    visibility: Visibility = Visibility.family


class GoalPatch(BaseModel):
    name: Name | None = None
    target_amount: PositiveMoney | None = None
    target_date: date | None = None
    emoji: str | None = Field(None, max_length=16)
    status: GoalStatus | None = None


class GoalOut(ORMModel):
    id: uuid.UUID
    name: str
    target_amount: Decimal
    currency: str
    target_date: date | None
    emoji: str | None
    status: GoalStatus
    achieved_at: datetime | None
    visibility: Visibility
    created_by: uuid.UUID | None
    saved: Decimal = Decimal("0")
    percent: float = 0.0
    monthly_rate: Decimal = Decimal("0")
    forecast_date: date | None = None
    on_track: bool | None = None


class ContributionCreate(BaseModel):
    amount: MoneyValue
    contributed_on: date | None = None
    note: str | None = Field(None, max_length=200)

    @field_validator("amount")
    @classmethod
    def _non_zero(cls, v: Decimal) -> Decimal:
        if v == 0:
            raise ValueError("Сумма не может быть нулевой")
        return v


class ContributionOut(ORMModel):
    id: uuid.UUID
    amount: Decimal
    contributed_on: date
    note: str | None
    created_by: uuid.UUID | None
    created_at: datetime


class ImportResult(BaseModel):
    created: int
    skipped_duplicates: int
    errors: list[str]
    dry_run: bool
