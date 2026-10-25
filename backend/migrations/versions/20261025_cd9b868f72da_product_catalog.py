"""product catalog: shared everyday products; catalog link and thumbnail on shopping items

Additive only: existing shopping items keep their data (catalog_id/image stay NULL).
The catalogue rows are upserted from app/modules/catalog/data.py at API startup.

Revision ID: cd9b868f72da
Revises: d91f4b6a2c58
Create Date: 2026-10-25 13:46:36.753132
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "cd9b868f72da"
down_revision: str | None = "d91f4b6a2c58"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_catalog",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("name_pl", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("unit", sa.String(length=16), nullable=True),
        sa.Column("image", sa.String(length=32), nullable=False),
        sa.Column(
            "synonyms", postgresql.ARRAY(sa.String(length=120)), server_default="{}", nullable=False
        ),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_product_catalog")),
    )
    op.create_index(
        op.f("ix_product_catalog_category"), "product_catalog", ["category"], unique=False
    )
    op.add_column("shopping_items", sa.Column("catalog_id", sa.String(length=64), nullable=True))
    op.add_column("shopping_items", sa.Column("image", sa.String(length=300), nullable=True))
    op.create_foreign_key(
        op.f("fk_shopping_items_catalog_id_product_catalog"),
        "shopping_items",
        "product_catalog",
        ["catalog_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("fk_shopping_items_catalog_id_product_catalog"), "shopping_items", type_="foreignkey"
    )
    op.drop_column("shopping_items", "image")
    op.drop_column("shopping_items", "catalog_id")
    op.drop_index(op.f("ix_product_catalog_category"), table_name="product_catalog")
    op.drop_table("product_catalog")
