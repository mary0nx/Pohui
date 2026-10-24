"""Shopping lists, tasks, pantry, recipes, meal plans, joint-life items and habits."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk
from app.models.common import family_fk, user_fk, visibility_col
from app.models.enums import (
    Frequency,
    ItemStatus,
    LifeItemKind,
    LifeItemStatus,
    MealType,
    Priority,
    TaskStatus,
    Visibility,
    enum_type,
)


class ShoppingList(UUIDPk, Timestamps, Base):
    __tablename__ = "shopping_lists"

    family_id: Mapped[uuid.UUID] = family_fk()
    name: Mapped[str] = mapped_column(sa.String(100))
    created_by: Mapped[uuid.UUID | None] = user_fk()
    archived_at: Mapped[datetime | None]


class ShoppingItem(UUIDPk, Timestamps, Base):
    __tablename__ = "shopping_items"
    __table_args__ = (
        sa.CheckConstraint("quantity IS NULL OR quantity > 0", name="quantity_positive"),
        sa.CheckConstraint(
            "estimated_price IS NULL OR estimated_price >= 0", name="price_non_negative"
        ),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    list_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("shopping_lists.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(sa.String(200))
    quantity: Mapped[Decimal | None] = mapped_column(sa.Numeric(12, 3))
    unit: Mapped[str | None] = mapped_column(sa.String(16))
    category: Mapped[str | None] = mapped_column(sa.String(32))
    note: Mapped[str | None] = mapped_column(sa.String(300))
    estimated_price: Mapped[Decimal | None] = mapped_column(sa.Numeric(14, 2))
    store: Mapped[str | None] = mapped_column(sa.String(100))
    status: Mapped[ItemStatus] = mapped_column(
        enum_type(ItemStatus, "item_status"),
        server_default=ItemStatus.needed.value,
        default=ItemStatus.needed,
    )
    added_by: Mapped[uuid.UUID | None] = user_fk()
    bought_by: Mapped[uuid.UUID | None] = user_fk()
    bought_at: Mapped[datetime | None]
    position: Mapped[int] = mapped_column(server_default="0")


class Task(UUIDPk, Timestamps, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        sa.CheckConstraint("points IS NULL OR points BETWEEN 0 AND 100", name="points_range"),
        sa.CheckConstraint(
            "recurrence_interval BETWEEN 1 AND 366", name="recurrence_interval_range"
        ),
        sa.Index("ix_tasks_family_status_due", "family_id", "status", "due_at"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    title: Mapped[str] = mapped_column(sa.String(200))
    description: Mapped[str | None] = mapped_column(sa.Text)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    due_at: Mapped[datetime | None]
    priority: Mapped[Priority] = mapped_column(
        enum_type(Priority, "priority"),
        server_default=Priority.normal.value,
        default=Priority.normal,
    )
    category: Mapped[str | None] = mapped_column(sa.String(32))
    status: Mapped[TaskStatus] = mapped_column(
        enum_type(TaskStatus, "task_status"),
        server_default=TaskStatus.todo.value,
        default=TaskStatus.todo,
    )
    points: Mapped[int | None]
    recurrence_freq: Mapped[Frequency | None] = mapped_column(
        enum_type(Frequency, "recurrence_freq")
    )
    recurrence_interval: Mapped[int] = mapped_column(server_default="1", default=1)
    # Completing a recurring task spawns the next one; the link prevents double spawning.
    next_task_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("tasks.id", ondelete="SET NULL"), unique=True
    )
    completed_at: Mapped[datetime | None]
    completed_by: Mapped[uuid.UUID | None] = user_fk()
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()


class TaskComment(UUIDPk, Base):
    __tablename__ = "task_comments"

    family_id: Mapped[uuid.UUID] = family_fk()
    task_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("tasks.id", ondelete="CASCADE"), index=True
    )
    body: Mapped[str] = mapped_column(sa.String(2000))
    created_by: Mapped[uuid.UUID | None] = user_fk()
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())


class PantryItem(UUIDPk, Timestamps, Base):
    __tablename__ = "pantry_items"
    __table_args__ = (
        sa.CheckConstraint("quantity IS NULL OR quantity >= 0", name="quantity_non_negative"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    name: Mapped[str] = mapped_column(sa.String(200))
    quantity: Mapped[Decimal | None] = mapped_column(sa.Numeric(12, 3))
    unit: Mapped[str | None] = mapped_column(sa.String(16))
    category: Mapped[str | None] = mapped_column(sa.String(32))
    expires_on: Mapped[date | None]
    note: Mapped[str | None] = mapped_column(sa.String(300))
    created_by: Mapped[uuid.UUID | None] = user_fk()


class Recipe(UUIDPk, Timestamps, Base):
    __tablename__ = "recipes"
    __table_args__ = (sa.CheckConstraint("servings BETWEEN 1 AND 100", name="servings_range"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    title: Mapped[str] = mapped_column(sa.String(200))
    description: Mapped[str | None] = mapped_column(sa.Text)
    instructions: Mapped[str | None] = mapped_column(sa.Text)
    servings: Mapped[int] = mapped_column(server_default="2")
    prep_minutes: Mapped[int | None]
    tags: Mapped[list[str]] = mapped_column(ARRAY(sa.String(32)), server_default="{}")
    source: Mapped[str] = mapped_column(sa.String(16), server_default="manual")
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()


class RecipeIngredient(UUIDPk, Base):
    __tablename__ = "recipe_ingredients"

    recipe_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("recipes.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(sa.String(200))
    quantity: Mapped[Decimal | None] = mapped_column(sa.Numeric(12, 3))
    unit: Mapped[str | None] = mapped_column(sa.String(16))
    position: Mapped[int] = mapped_column(server_default="0")


class MealPlanEntry(UUIDPk, Timestamps, Base):
    __tablename__ = "meal_plan_entries"
    __table_args__ = (
        sa.UniqueConstraint("family_id", "day", "meal_type"),
        sa.CheckConstraint("servings BETWEEN 1 AND 100", name="servings_range"),
    )

    family_id: Mapped[uuid.UUID] = family_fk()
    day: Mapped[date]
    meal_type: Mapped[MealType] = mapped_column(enum_type(MealType, "meal_type"))
    recipe_id: Mapped[uuid.UUID | None] = mapped_column(
        sa.ForeignKey("recipes.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(sa.String(200))
    servings: Mapped[int] = mapped_column(server_default="2")
    created_by: Mapped[uuid.UUID | None] = user_fk()


class LifeItem(UUIDPk, Timestamps, Base):
    """Joint-life records: shared goals, wishlist, ideas/weekend plans, journal, notes."""

    __tablename__ = "life_items"
    __table_args__ = (sa.Index("ix_life_items_family_kind", "family_id", "kind"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    kind: Mapped[LifeItemKind] = mapped_column(enum_type(LifeItemKind, "life_item_kind"))
    title: Mapped[str] = mapped_column(sa.String(200))
    body: Mapped[str | None] = mapped_column(sa.Text)
    status: Mapped[LifeItemStatus] = mapped_column(
        enum_type(LifeItemStatus, "life_item_status"),
        server_default=LifeItemStatus.open.value,
        default=LifeItemStatus.open,
    )
    happened_on: Mapped[date | None]
    planned_for: Mapped[date | None]
    price: Mapped[Decimal | None] = mapped_column(sa.Numeric(14, 2))
    url: Mapped[str | None] = mapped_column(sa.String(500))
    done_at: Mapped[datetime | None]
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()


class Habit(UUIDPk, Timestamps, Base):
    __tablename__ = "habits"
    __table_args__ = (sa.CheckConstraint("target_per_week BETWEEN 1 AND 7", name="target_range"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    title: Mapped[str] = mapped_column(sa.String(100))
    target_per_week: Mapped[int] = mapped_column(server_default="3")
    archived_at: Mapped[datetime | None]
    visibility: Mapped[Visibility] = visibility_col()
    created_by: Mapped[uuid.UUID | None] = user_fk()


class HabitCheckin(UUIDPk, Base):
    __tablename__ = "habit_checkins"
    __table_args__ = (sa.UniqueConstraint("habit_id", "user_id", "day"),)

    family_id: Mapped[uuid.UUID] = family_fk()
    habit_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("habits.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[date]
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())
