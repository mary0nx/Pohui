"""device login and web push: sign-in requests confirmed in the bot, push subscriptions

Revision ID: f4a1c7d93b20
Revises: e9223acd5a5f
Create Date: 2026-10-26 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f4a1c7d93b20"
down_revision: str | None = "e9223acd5a5f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

AUTH_CHECK = "ck_user_sessions_auth_method"


def upgrade() -> None:
    op.drop_constraint(op.f(AUTH_CHECK), "user_sessions", type_="check")
    op.create_check_constraint(
        op.f(AUTH_CHECK), "user_sessions", "auth_method IN ('telegram', 'dev', 'device')"
    )
    op.add_column("user_sessions", sa.Column("device_label", sa.String(length=64), nullable=True))
    op.add_column(
        "notifications", sa.Column("push_sent_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_table(
        "login_requests",
        sa.Column("poll_hash", sa.String(length=64), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("device_label", sa.String(length=64), nullable=False),
        sa.Column("claimed_telegram_id", sa.BigInteger(), nullable=True),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_login_requests_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_login_requests")),
        sa.UniqueConstraint("code_hash", name=op.f("uq_login_requests_code_hash")),
        sa.UniqueConstraint("poll_hash", name=op.f("uq_login_requests_poll_hash")),
    )
    op.create_table(
        "push_subscriptions",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.String(length=1024), nullable=False),
        sa.Column("p256dh", sa.String(length=128), nullable=False),
        sa.Column("auth", sa.String(length=64), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("last_success_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["user_sessions.id"],
            name=op.f("fk_push_subscriptions_session_id_user_sessions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_push_subscriptions_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_push_subscriptions")),
        sa.UniqueConstraint("endpoint", name=op.f("uq_push_subscriptions_endpoint")),
    )
    op.create_index(op.f("ix_push_subscriptions_session_id"), "push_subscriptions", ["session_id"])
    op.create_index(op.f("ix_push_subscriptions_user_id"), "push_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_push_subscriptions_user_id"), table_name="push_subscriptions")
    op.drop_index(op.f("ix_push_subscriptions_session_id"), table_name="push_subscriptions")
    op.drop_table("push_subscriptions")
    op.drop_table("login_requests")
    op.drop_column("notifications", "push_sent_at")
    op.drop_column("user_sessions", "device_label")
    # Device sessions cannot exist under the old constraint.
    op.execute("DELETE FROM user_sessions WHERE auth_method = 'device'")
    op.drop_constraint(op.f(AUTH_CHECK), "user_sessions", type_="check")
    op.create_check_constraint(
        op.f(AUTH_CHECK), "user_sessions", "auth_method IN ('telegram', 'dev')"
    )
