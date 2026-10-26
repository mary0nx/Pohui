"""notification channel: the installed app first, Telegram as fallback or in addition

Revision ID: b2d4f6a8c013
Revises: a8c3e1f07d42
Create Date: 2026-10-26 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2d4f6a8c013"
down_revision: str | None = "a8c3e1f07d42"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "notification_settings",
        sa.Column("channel", sa.String(length=16), server_default="app", nullable=False),
    )
    op.create_check_constraint(
        op.f("ck_notification_settings_channel_valid"),
        "notification_settings",
        "channel IN ('app', 'both')",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_notification_settings_channel_valid"), "notification_settings", type_="check"
    )
    op.drop_column("notification_settings", "channel")
