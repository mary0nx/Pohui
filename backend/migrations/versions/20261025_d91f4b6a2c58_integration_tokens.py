"""integration tokens: personal keys for external senders (Apple Pay via iPhone Shortcuts)

Revision ID: d91f4b6a2c58
Revises: c3e8a5f20d71
Create Date: 2026-10-25 03:59:40.214820
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d91f4b6a2c58"
down_revision: str | None = "c3e8a5f20d71"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "integration_tokens",
        sa.Column("family_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_prefix", sa.String(length=16), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
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
            ["account_id"],
            ["accounts.id"],
            name=op.f("fk_integration_tokens_account_id_accounts"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["family_id"],
            ["families.id"],
            name=op.f("fk_integration_tokens_family_id_families"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_integration_tokens_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_integration_tokens")),
        sa.UniqueConstraint(
            "family_id",
            "user_id",
            "kind",
            name=op.f("uq_integration_tokens_family_id_user_id_kind"),
        ),
        sa.UniqueConstraint("token_hash", name=op.f("uq_integration_tokens_token_hash")),
    )
    op.create_index(
        op.f("ix_integration_tokens_family_id"), "integration_tokens", ["family_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_integration_tokens_family_id"), table_name="integration_tokens")
    op.drop_table("integration_tokens")
