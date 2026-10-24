"""Enumerations stored as VARCHAR + CHECK constraint (no native PG enums: simpler migrations)."""

from __future__ import annotations

from enum import StrEnum

import sqlalchemy as sa


def enum_type(enum_cls: type[StrEnum], name: str) -> sa.Enum:
    return sa.Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        values_callable=lambda e: [m.value for m in e],
        validate_strings=True,
    )


class Role(StrEnum):
    owner = "owner"
    admin = "admin"
    member = "member"


class Visibility(StrEnum):
    family = "family"
    private = "private"


class AuthMethod(StrEnum):
    telegram = "telegram"
    dev = "dev"


class AccountKind(StrEnum):
    cash = "cash"
    bank = "bank"
    card = "card"
    savings = "savings"
    other = "other"


class CategoryKind(StrEnum):
    expense = "expense"
    income = "income"


class TransactionKind(StrEnum):
    income = "income"
    expense = "expense"
    refund = "refund"
    transfer = "transfer"


class PaymentMethod(StrEnum):
    cash = "cash"
    card = "card"
    bank_transfer = "bank_transfer"
    other = "other"


class Frequency(StrEnum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"
    yearly = "yearly"


class ScheduledPaymentStatus(StrEnum):
    pending = "pending"
    paid = "paid"
    skipped = "skipped"


class GoalStatus(StrEnum):
    active = "active"
    achieved = "achieved"
    archived = "archived"


class EventStatus(StrEnum):
    confirmed = "confirmed"
    cancelled = "cancelled"


class Rsvp(StrEnum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class ReminderTarget(StrEnum):
    event = "event"
    task = "task"
    payment = "payment"
    document = "document"
    custom = "custom"


class ItemStatus(StrEnum):
    needed = "needed"
    bought = "bought"


class TaskStatus(StrEnum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"
    cancelled = "cancelled"


class Priority(StrEnum):
    low = "low"
    normal = "normal"
    high = "high"


class MealType(StrEnum):
    breakfast = "breakfast"
    lunch = "lunch"
    dinner = "dinner"
    snack = "snack"


class LifeItemKind(StrEnum):
    goal = "goal"
    wish = "wish"
    idea = "idea"
    journal = "journal"
    note = "note"


class LifeItemStatus(StrEnum):
    open = "open"
    planned = "planned"
    done = "done"
    archived = "archived"


class NotificationCategory(StrEnum):
    event_reminder = "event_reminder"
    payment_due = "payment_due"
    task_overdue = "task_overdue"
    task_assigned = "task_assigned"
    task_reminder = "task_reminder"
    shopping_update = "shopping_update"
    goal_update = "goal_update"
    document_expiry = "document_expiry"
    custom_reminder = "custom_reminder"
    system = "system"


class NotificationStatus(StrEnum):
    pending = "pending"
    sending = "sending"
    sent = "sent"
    failed = "failed"
    skipped = "skipped"


class AiRole(StrEnum):
    user = "user"
    assistant = "assistant"
    tool = "tool"


class ProposalStatus(StrEnum):
    pending = "pending"
    executing = "executing"
    executed = "executed"
    cancelled = "cancelled"
    expired = "expired"
    failed = "failed"


class Channel(StrEnum):
    app = "app"
    bot = "bot"
