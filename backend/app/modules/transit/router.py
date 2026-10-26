"""«Мой маршрут» API. Personal: /me/… only ever reads the caller's own places, plus places a
family member explicitly shares. Addresses travel in request bodies, never in URLs, so they do
not end up in access logs."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Response
from sqlalchemy import delete, func, select

from app.api.deps import DB, CurrentUser
from app.config import get_settings
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.rate_limit import get_rate_limiter
from app.core.time import utcnow
from app.models import FavoriteRoute, Place, RoutePreference
from app.modules.transit import feeds, planner, service
from app.modules.transit.addresses import get_index
from app.modules.transit.schemas import (
    CheckIn,
    CheckOut,
    FavoriteIn,
    FavoriteOut,
    PlaceIn,
    PlaceOut,
    PlacePatch,
    PlacesOut,
    PlanIn,
    PlanOut,
    PreferencesIn,
    PreferencesOut,
    SearchIn,
    SearchOut,
    StatusOut,
    StreetOut,
)

router = APIRouter(tags=["route"])
MAX_PLACES = 12


@router.post("/me/places/search", response_model=SearchOut)
async def search_addresses(body: SearchIn, user: CurrentUser) -> SearchOut:
    await get_rate_limiter().hit(f"place-search:{user.id}", 60)
    ix = get_index()
    found, streets = ix.search(body.q)
    return SearchOut(
        addresses=[service.address_out(a, ix.version) for a in found],
        streets=[StreetOut(street=s.street, count=s.count) for s in streets],
        source=ix.source,
    )


@router.post("/me/places/check", response_model=CheckOut)
async def check_address(body: CheckIn, user: CurrentUser, db: DB) -> CheckOut:
    """The chosen address with its nearest stops, to confirm before saving."""
    await get_rate_limiter().hit(f"place-check:{user.id}", 30)
    ix = get_index()
    a = service.resolve_address(body.address_id)
    stops = None
    meta = await feeds.feed_for(db, utcnow().astimezone(planner.ZONE).date())
    if meta is not None:
        tt = await feeds.get_store().timetable(db, meta, wait=8.0)
        if tt is not None:
            stops = service.near_stops(tt, a.lat, a.lon)
    return CheckOut(
        address=service.address_out(a, ix.version),
        stops=stops,
        osm_url=f"https://www.openstreetmap.org/?mlat={a.lat:.5f}&mlon={a.lon:.5f}#map=18/{a.lat:.5f}/{a.lon:.5f}",
    )


@router.get("/me/places", response_model=PlacesOut)
async def list_places(user: CurrentUser, db: DB) -> PlacesOut:
    own = await service.own_places(db, user)
    shared = await service.shared_places(db, user)
    return PlacesOut(
        places=[service.place_out(p, user) for p in own],
        shared=[service.place_out(p, user, owner.first_name) for p, owner in shared],
    )


@router.post("/me/places", response_model=PlaceOut, status_code=201)
async def create_place(body: PlaceIn, user: CurrentUser, db: DB) -> PlaceOut:
    count = await db.scalar(select(func.count()).select_from(Place).where(Place.user_id == user.id))
    if (count or 0) >= MAX_PLACES:
        raise ValidationFailed(f"Можно сохранить до {MAX_PLACES} мест")
    if body.kind in ("home", "work"):
        taken = await db.scalar(
            select(func.count())
            .select_from(Place)
            .where(Place.user_id == user.id, Place.kind == body.kind)
        )
        if taken:
            raise Conflict(
                "Дом уже сохранён — измените его"
                if body.kind == "home"
                else "Работа уже сохранена — измените её"
            )
    a = service.resolve_address(body.address_id)
    place = Place(
        user_id=user.id,
        kind=body.kind,
        title=body.title,
        sealed=service.seal_place(a),
        shared=body.shared,
        position={"home": 0, "work": 1}.get(body.kind, 2 + (count or 0)),
    )
    db.add(place)
    await db.commit()
    return service.place_out(place, user)


@router.patch("/me/places/{place_id}", response_model=PlaceOut)
async def update_place(
    place_id: uuid.UUID, body: PlacePatch, user: CurrentUser, db: DB
) -> PlaceOut:
    place = await service.own_place(db, user, place_id)
    if body.kind is not None and body.kind != place.kind and body.kind in ("home", "work"):
        taken = await db.scalar(
            select(func.count())
            .select_from(Place)
            .where(Place.user_id == user.id, Place.kind == body.kind, Place.id != place.id)
        )
        if taken:
            raise Conflict("Такое место уже есть")
    if body.kind is not None:
        place.kind = body.kind
    if body.title is not None:
        place.title = body.title.strip() or place.title
    if body.address_id is not None:
        place.sealed = service.seal_place(service.resolve_address(body.address_id))
    if body.shared is not None:
        place.shared = body.shared
    if body.position is not None:
        place.position = body.position
    await db.commit()
    return service.place_out(place, user)


@router.delete("/me/places/{place_id}", status_code=204)
async def delete_place(place_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    place = await service.own_place(db, user, place_id)
    await db.delete(place)
    await db.commit()
    return Response(status_code=204)


@router.get("/me/route/favorites", response_model=list[FavoriteOut])
async def list_favorites(user: CurrentUser, db: DB) -> list[FavoriteOut]:
    rows = await db.scalars(
        select(FavoriteRoute)
        .where(FavoriteRoute.user_id == user.id)
        .order_by(FavoriteRoute.created_at)
    )
    return [
        FavoriteOut(id=f.id, from_place_id=f.from_place_id, to_place_id=f.to_place_id) for f in rows
    ]


@router.post("/me/route/favorites", response_model=FavoriteOut, status_code=201)
async def add_favorite(body: FavoriteIn, user: CurrentUser, db: DB) -> FavoriteOut:
    if body.from_place_id == body.to_place_id:
        raise ValidationFailed("Выберите два разных места")
    await service.usable_place(db, user, body.from_place_id)
    await service.usable_place(db, user, body.to_place_id)
    existing = await db.scalar(
        select(FavoriteRoute).where(
            FavoriteRoute.user_id == user.id,
            FavoriteRoute.from_place_id == body.from_place_id,
            FavoriteRoute.to_place_id == body.to_place_id,
        )
    )
    if existing is None:
        count = await db.scalar(
            select(func.count()).select_from(FavoriteRoute).where(FavoriteRoute.user_id == user.id)
        )
        if (count or 0) >= 20:
            raise ValidationFailed("Можно сохранить до 20 избранных маршрутов")
        existing = FavoriteRoute(
            user_id=user.id, from_place_id=body.from_place_id, to_place_id=body.to_place_id
        )
        db.add(existing)
        await db.commit()
    return FavoriteOut(
        id=existing.id, from_place_id=existing.from_place_id, to_place_id=existing.to_place_id
    )


@router.delete("/me/route/favorites/{favorite_id}", status_code=204)
async def delete_favorite(favorite_id: uuid.UUID, user: CurrentUser, db: DB) -> Response:
    r = await db.execute(
        delete(FavoriteRoute).where(
            FavoriteRoute.id == favorite_id, FavoriteRoute.user_id == user.id
        )
    )
    if not r.rowcount:  # type: ignore[attr-defined]
        raise NotFound("Маршрут не найден")
    await db.commit()
    return Response(status_code=204)


async def _prefs(db: DB, user: CurrentUser) -> RoutePreference:
    return await db.get(RoutePreference, user.id) or RoutePreference(
        user_id=user.id, prefer="fastest", max_walk_m=1000
    )


@router.get("/me/route/preferences", response_model=PreferencesOut)
async def get_preferences(user: CurrentUser, db: DB) -> PreferencesOut:
    p = await _prefs(db, user)
    return PreferencesOut(prefer=p.prefer, max_walk_m=p.max_walk_m)  # type: ignore[arg-type]


@router.put("/me/route/preferences", response_model=PreferencesOut)
async def put_preferences(body: PreferencesIn, user: CurrentUser, db: DB) -> PreferencesOut:
    p = await db.get(RoutePreference, user.id)
    if p is None:
        p = RoutePreference(user_id=user.id)
        db.add(p)
    p.prefer = body.prefer
    p.max_walk_m = body.max_walk_m
    await db.commit()
    return PreferencesOut(prefer=body.prefer, max_walk_m=body.max_walk_m)


@router.post("/me/route/plan", response_model=PlanOut)
async def plan_route(body: PlanIn, user: CurrentUser, db: DB) -> PlanOut:
    await get_rate_limiter().hit(f"route-plan:{user.id}", 40)
    a = await service.usable_place(db, user, body.from_place_id)
    b = await service.usable_place(db, user, body.to_place_id)
    now = utcnow()
    at = (body.at or now).astimezone(planner.ZONE).replace(second=0, microsecond=0)
    if abs((at - now).days) > 30:
        raise ValidationFailed("Можно планировать поездку не дальше месяца вперёд")
    prefs = await _prefs(db, user)
    return await service.plan(db, a, b, at, body.mode == "arrive", prefs.prefer, prefs.max_walk_m)


@router.get("/me/route/status", response_model=StatusOut)
async def route_status(user: CurrentUser, db: DB) -> StatusOut:
    ix = get_index()
    today = datetime.now(planner.ZONE).date()
    meta = await feeds.feed_for(db, today)
    return StatusOut(
        schedule=await service.schedule_out(db, meta) if meta else None,
        loaded=bool(meta and feeds.get_store().loaded(meta.id)),
        jakdojade_configured=get_settings().jakdojade_configured,
        realtime=False,
        addresses_version=ix.version,
        addresses_source=ix.source,
        addresses_count=len(ix),
    )
