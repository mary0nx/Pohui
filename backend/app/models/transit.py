"""«Мой маршрут»: a member's places and route choices, and the cached public transport schedule."""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPk


class Place(UUIDPk, Timestamps, Base):
    """A member's own place (home, work, …). The address and position are encrypted at rest
    (`sealed`); only the owner sees them, family members only when `shared` is switched on."""

    __tablename__ = "places"
    __table_args__ = (
        sa.CheckConstraint("kind IN ('home', 'work', 'other')", name="kind_valid"),
        sa.Index("ix_places_user", "user_id", "position"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(sa.String(8))
    title: Mapped[str] = mapped_column(sa.String(40))
    sealed: Mapped[str] = mapped_column(sa.Text)
    shared: Mapped[bool] = mapped_column(server_default=sa.false(), default=False)
    position: Mapped[int] = mapped_column(sa.SmallInteger, server_default="0", default=0)


class FavoriteRoute(UUIDPk, Base):
    __tablename__ = "favorite_routes"
    __table_args__ = (
        sa.UniqueConstraint("user_id", "from_place_id", "to_place_id"),
        sa.CheckConstraint("from_place_id <> to_place_id", name="distinct_places"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    from_place_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("places.id", ondelete="CASCADE"))
    to_place_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("places.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())


class RoutePreference(Base):
    __tablename__ = "route_preferences"
    __table_args__ = (
        sa.CheckConstraint(
            "prefer IN ('fastest', 'fewer_transfers', 'less_walking')", name="prefer_valid"
        ),
        sa.CheckConstraint("max_walk_m BETWEEN 300 AND 2000", name="max_walk_range"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    prefer: Mapped[str] = mapped_column(sa.String(16), server_default="fastest", default="fastest")
    max_walk_m: Mapped[int] = mapped_column(sa.SmallInteger, server_default="1000", default=1000)
    updated_at: Mapped[datetime] = mapped_column(
        server_default=sa.func.now(), onupdate=lambda: datetime.now(UTC)
    )


class TransitFeed(UUIDPk, Base):
    """A downloaded schedule file (GTFS), kept so a restart or an outage of the open data
    portal does not leave the app without a timetable. `data` holds the zip without shapes."""

    __tablename__ = "transit_feeds"
    __table_args__ = (sa.UniqueConstraint("source", "remote_id"),)

    source: Mapped[str] = mapped_column(sa.String(32))
    remote_id: Mapped[int]
    name: Mapped[str] = mapped_column(sa.String(200))
    feed_start: Mapped[date | None]
    feed_end: Mapped[date | None]
    published_at: Mapped[datetime | None]
    fetched_at: Mapped[datetime] = mapped_column(server_default=sa.func.now())
    sha256: Mapped[str] = mapped_column(sa.String(64))
    size: Mapped[int]
    data: Mapped[bytes] = mapped_column(sa.LargeBinary, deferred=True)


class TransitSource(Base):
    """When the open data portal was last asked for a new schedule, and how that went."""

    __tablename__ = "transit_sources"

    source: Mapped[str] = mapped_column(sa.String(32), primary_key=True)
    checked_at: Mapped[datetime | None]
    ok_at: Mapped[datetime | None]
    error: Mapped[str | None] = mapped_column(sa.String(300))
