"""pending invitation: invitation a user opened in the bot

Additive only: a nullable column on users. The bot remembers an invitation from
/start inv_... so the app can offer to join however it is opened next.

Revision ID: 3099891930b5
Revises: cd9b868f72da
Create Date: 2026-10-25 15:07:37.654137
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "3099891930b5"
down_revision: str | None = "cd9b868f72da"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_invitation_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_users_pending_invitation_id_family_invitations"),
        "users",
        "family_invitations",
        ["pending_invitation_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_users_pending_invitation_id_family_invitations"), "users", type_="foreignkey"
    )
    op.drop_column("users", "pending_invitation_id")
