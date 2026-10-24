"""shopping day plan: planned_for on items, shopping_reminder notification category

Revision ID: b7d2e41c9a10
Revises: 3599527fbfca
Create Date: 2026-10-25 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7d2e41c9a10"
down_revision: str | None = "3599527fbfca"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_CATEGORIES = [
    "event_reminder",
    "payment_due",
    "task_overdue",
    "task_assigned",
    "task_reminder",
    "shopping_update",
    "goal_update",
    "document_expiry",
    "custom_reminder",
    "system",
]
NEW_CATEGORIES = [*OLD_CATEGORIES, "shopping_reminder"]
CATEGORY_TABLES = ("notifications", "notification_preferences")


def _category_check(table: str, values: list[str]) -> None:
    name = f"ck_{table}_notification_category"
    allowed = ", ".join(f"'{v}'" for v in values)
    op.drop_constraint(op.f(name), table, type_="check")
    op.create_check_constraint(op.f(name), table, f"category IN ({allowed})")


def upgrade() -> None:
    op.add_column("shopping_items", sa.Column("planned_for", sa.Date(), nullable=True))
    op.create_index(
        op.f("ix_shopping_items_family_planned"),
        "shopping_items",
        ["family_id", "planned_for"],
        unique=False,
    )
    for table in CATEGORY_TABLES:
        _category_check(table, NEW_CATEGORIES)


def downgrade() -> None:
    for table in CATEGORY_TABLES:
        # Table names come from the fixed tuple above.
        op.execute(sa.text(f"DELETE FROM {table} WHERE category = 'shopping_reminder'"))  # noqa: S608
        _category_check(table, OLD_CATEGORIES)
    op.drop_index(op.f("ix_shopping_items_family_planned"), table_name="shopping_items")
    op.drop_column("shopping_items", "planned_for")
