"""«Мой маршрут»: places, favourite routes, route preferences, cached transit schedule

Revision ID: c7e2a9d4b501
Revises: b2d4f6a8c013
Create Date: 2026-10-27 09:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c7e2a9d4b501"
down_revision: str | None = "b2d4f6a8c013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "places",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=8), nullable=False),
        sa.Column("title", sa.String(length=40), nullable=False),
        sa.Column("sealed", sa.Text(), nullable=False),
        sa.Column("shared", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("position", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("kind IN ('home', 'work', 'other')", name=op.f("ck_places_kind_valid")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_places_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_places")),
    )
    op.create_index("ix_places_user", "places", ["user_id", "position"])
    op.create_table(
        "favorite_routes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("from_place_id", sa.UUID(), nullable=False),
        sa.Column("to_place_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "from_place_id <> to_place_id", name=op.f("ck_favorite_routes_distinct_places")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_favorite_routes_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["from_place_id"],
            ["places.id"],
            name=op.f("fk_favorite_routes_from_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["to_place_id"],
            ["places.id"],
            name=op.f("fk_favorite_routes_to_place_id_places"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_favorite_routes")),
        sa.UniqueConstraint(
            "user_id",
            "from_place_id",
            "to_place_id",
            name=op.f("uq_favorite_routes_user_id_from_place_id_to_place_id"),
        ),
    )
    op.create_index(op.f("ix_favorite_routes_user_id"), "favorite_routes", ["user_id"])
    op.create_table(
        "route_preferences",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("prefer", sa.String(length=16), server_default="fastest", nullable=False),
        sa.Column("max_walk_m", sa.SmallInteger(), server_default="1000", nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "prefer IN ('fastest', 'fewer_transfers', 'less_walking')",
            name=op.f("ck_route_preferences_prefer_valid"),
        ),
        sa.CheckConstraint(
            "max_walk_m BETWEEN 300 AND 2000", name=op.f("ck_route_preferences_max_walk_range")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_route_preferences_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_route_preferences")),
    )
    op.create_table(
        "transit_feeds",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("remote_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("feed_start", sa.Date(), nullable=True),
        sa.Column("feed_end", sa.Date(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "fetched_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False),
        sa.Column("data", sa.LargeBinary(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transit_feeds")),
        sa.UniqueConstraint("source", "remote_id", name=op.f("uq_transit_feeds_source_remote_id")),
    )
    op.create_table(
        "transit_sources",
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ok_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.String(length=300), nullable=True),
        sa.PrimaryKeyConstraint("source", name=op.f("pk_transit_sources")),
    )


def downgrade() -> None:
    op.drop_table("transit_sources")
    op.drop_table("transit_feeds")
    op.drop_table("route_preferences")
    op.drop_index(op.f("ix_favorite_routes_user_id"), table_name="favorite_routes")
    op.drop_table("favorite_routes")
    op.drop_index("ix_places_user", table_name="places")
    op.drop_table("places")
