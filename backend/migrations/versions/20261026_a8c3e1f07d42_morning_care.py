"""morning care: personal morning message settings, morning_care notification category

Revision ID: a8c3e1f07d42
Revises: f4a1c7d93b20
Create Date: 2026-10-26 13:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a8c3e1f07d42"
down_revision: str | None = "f4a1c7d93b20"
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
    "shopping_reminder",
]
NEW_CATEGORIES = [*OLD_CATEGORIES, "morning_care"]
CATEGORY_TABLES = ("notifications", "notification_preferences")


def _category_check(table: str, values: list[str]) -> None:
    name = f"ck_{table}_notification_category"
    allowed = ", ".join(f"'{v}'" for v in values)
    op.drop_constraint(op.f(name), table, type_="check")
    op.create_check_constraint(op.f(name), table, f"category IN ({allowed})")


def upgrade() -> None:
    op.create_table(
        "care_settings",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("recipient_name", sa.String(length=64), nullable=True),
        sa.Column("gender", sa.String(length=1), server_default="f", nullable=False),
        sa.Column("city", sa.String(length=100), nullable=False),
        sa.Column("country", sa.String(length=64), nullable=True),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("send_time", sa.Time(), nullable=False),
        sa.Column("leave_time", sa.Time(), nullable=False),
        sa.Column("weekdays", sa.SmallInteger(), server_default="127", nullable=False),
        sa.Column("tone", sa.String(length=16), server_default="tender", nullable=False),
        sa.Column("weather_tips", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("signature", sa.String(length=64), nullable=True),
        sa.Column("last_sent_on", sa.Date(), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("gender IN ('f', 'm')", name=op.f("ck_care_settings_gender_valid")),
        sa.CheckConstraint(
            "tone IN ('tender', 'romantic', 'friendly', 'short')",
            name=op.f("ck_care_settings_tone_valid"),
        ),
        sa.CheckConstraint(
            "weekdays BETWEEN 0 AND 127", name=op.f("ck_care_settings_weekdays_valid")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_care_settings_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_care_settings")),
    )
    for table in CATEGORY_TABLES:
        _category_check(table, NEW_CATEGORIES)


def downgrade() -> None:
    for table in CATEGORY_TABLES:
        # Table names come from the fixed tuple above.
        op.execute(sa.text(f"DELETE FROM {table} WHERE category = 'morning_care'"))  # noqa: S608
        _category_check(table, OLD_CATEGORIES)
    op.drop_table("care_settings")
