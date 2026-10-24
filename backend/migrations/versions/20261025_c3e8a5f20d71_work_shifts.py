"""work shifts: day/night shifts of a member's work schedule

Revision ID: c3e8a5f20d71
Revises: b7d2e41c9a10
Create Date: 2026-10-24 19:20:19.007255
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3e8a5f20d71"
down_revision: str | None = "b7d2e41c9a10"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "work_shifts",
        sa.Column("family_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column(
            "kind",
            sa.Enum(
                "day",
                "night",
                name="shift_kind",
                native_enum=False,
                create_constraint=True,
                length=32,
            ),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["family_id"],
            ["families.id"],
            name=op.f("fk_work_shifts_family_id_families"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_work_shifts_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_work_shifts")),
        sa.UniqueConstraint(
            "family_id", "user_id", "day", name=op.f("uq_work_shifts_family_id_user_id_day")
        ),
    )
    op.create_index(op.f("ix_work_shifts_family_id"), "work_shifts", ["family_id"], unique=False)
    op.create_index("ix_work_shifts_user_day", "work_shifts", ["user_id", "day"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_work_shifts_user_day", table_name="work_shifts")
    op.drop_index(op.f("ix_work_shifts_family_id"), table_name="work_shifts")
    op.drop_table("work_shifts")
