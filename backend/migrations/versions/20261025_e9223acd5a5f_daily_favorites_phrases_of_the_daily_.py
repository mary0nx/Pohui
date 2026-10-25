"""daily favorites: phrases of the daily leaf a user saved

Additive only: one new table, personal per user (cascade with the user).

Revision ID: e9223acd5a5f
Revises: 3099891930b5
Create Date: 2026-10-25 16:49:35.631484
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e9223acd5a5f"
down_revision: str | None = "3099891930b5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "daily_favorites",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("phrase_id", sa.String(length=40), nullable=False),
        sa.Column("text", sa.String(length=300), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_daily_favorites_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_daily_favorites")),
        sa.UniqueConstraint(
            "user_id", "phrase_id", name=op.f("uq_daily_favorites_user_id_phrase_id")
        ),
    )
    op.create_index(
        op.f("ix_daily_favorites_user_id"), "daily_favorites", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_daily_favorites_user_id"), table_name="daily_favorites")
    op.drop_table("daily_favorites")
