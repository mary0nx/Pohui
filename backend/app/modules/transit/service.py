"""«Мой маршрут»: places, access rules and route plans.

Access: a member reads and plans with their own places; another member's place only when its
owner switched sharing on and both are in the same family. Addresses are kept encrypted
(app.security.sealed) and never written to logs.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time as clock
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.time import utcnow
from app.models import FamilyMember, Place, User
from app.modules.transit import feeds, jakdojade, planner, raptor
from app.modules.transit.addresses import Address, get_index
from app.modules.transit.geo import haversine_m, walk_metres, walk_seconds
from app.modules.transit.gtfs import DayTable, Timetable
from app.modules.transit.schemas import (
    AddressOut,
    LegOut,
    NearStopOut,
    OptionOut,
    PlaceOut,
    PlanOut,
    ScheduleOut,
    StopOut,
)
from app.security.sealed import SealedError, seal, unseal

log = logging.getLogger(__name__)

PURPOSE = "places/v1"
LOAD_WAIT = 20.0  # seconds a request waits for a schedule that is being loaded
TIGHT_TRANSFER = 3 * 60
SOURCE_NAME = "Rozkład jazdy transportu publicznego — Otwarte dane Wrocławia (UM Wrocław)"


# ---- places -----------------------------------------------------------------


@dataclass(frozen=True)
class PlaceData:
    street: str
    number: str
    postcode: str
    estate: str
    lat: float
    lon: float

    @property
    def label(self) -> str:
        return f"{self.street} {self.number}"


def address_out(a: Address, version: str) -> AddressOut:
    return AddressOut(
        id=f"{version}:{a.id[1:]}",
        label=a.label,
        street=a.street,
        number=a.number,
        postcode=a.postcode,
        estate=a.estate,
        lat=a.lat,
        lon=a.lon,
    )


def resolve_address(address_id: str) -> Address:
    ix = get_index()
    version, _, index = address_id.rpartition(":")
    if version != ix.version:
        raise Conflict("Адресный справочник обновился — найдите адрес ещё раз")
    found = ix.get(f"a{index}")
    if found is None:
        raise NotFound("Адрес не найден")
    return found


def seal_place(a: Address) -> str:
    data = {
        "street": a.street,
        "number": a.number,
        "postcode": a.postcode,
        "estate": a.estate,
        "lat": a.lat,
        "lon": a.lon,
    }
    return seal(data, PURPOSE)


def open_place(place: Place) -> PlaceData | None:
    try:
        d: dict[str, Any] = unseal(place.sealed, PURPOSE)
        return PlaceData(
            str(d["street"]),
            str(d["number"]),
            str(d.get("postcode", "")),
            str(d.get("estate", "")),
            float(d["lat"]),
            float(d["lon"]),
        )
    except (SealedError, KeyError, TypeError, ValueError):
        log.warning("place cannot be opened", extra={"ctx": {"place": str(place.id)}})
        return None


def place_out(place: Place, user: User, owner_name: str | None = None) -> PlaceOut:
    data = open_place(place)
    return PlaceOut(
        id=place.id,
        kind=place.kind,
        title=place.title,
        label=data.label if data else None,
        estate=data.estate if data else None,
        lat=data.lat if data else None,
        lon=data.lon if data else None,
        shared=place.shared,
        mine=place.user_id == user.id,
        owner_name=owner_name,
        position=place.position,
    )


async def family_peers(db: AsyncSession, user: User) -> list[uuid.UUID]:
    """Users who share at least one family with `user` (not the user themself)."""
    mine = select(FamilyMember.family_id).where(FamilyMember.user_id == user.id)
    rows = await db.scalars(
        select(FamilyMember.user_id)
        .where(FamilyMember.family_id.in_(mine), FamilyMember.user_id != user.id)
        .distinct()
    )
    return list(rows)


async def own_places(db: AsyncSession, user: User) -> list[Place]:
    rows = await db.scalars(
        select(Place).where(Place.user_id == user.id).order_by(Place.position, Place.created_at)
    )
    return list(rows)


async def shared_places(db: AsyncSession, user: User) -> list[tuple[Place, User]]:
    peers = await family_peers(db, user)
    if not peers:
        return []
    rows = await db.execute(
        select(Place, User)
        .join(User, User.id == Place.user_id)
        .where(Place.user_id.in_(peers), Place.shared.is_(True))
        .order_by(User.first_name, Place.position)
    )
    return [(p, u) for p, u in rows.all()]


async def own_place(db: AsyncSession, user: User, place_id: uuid.UUID) -> Place:
    place = await db.get(Place, place_id)
    if place is None or place.user_id != user.id:
        raise NotFound("Место не найдено")
    return place


async def usable_place(db: AsyncSession, user: User, place_id: uuid.UUID) -> Place:
    """The member's own place, or one a family member shares; anything else is "not found"."""
    place = await db.get(Place, place_id)
    if place is None:
        raise NotFound("Место не найдено")
    if place.user_id == user.id:
        return place
    if place.shared and place.user_id in await family_peers(db, user):
        return place
    raise NotFound("Место не найдено")


# ---- schedule -----------------------------------------------------------------


async def schedule_out(db: AsyncSession, meta: feeds.FeedMeta | None) -> ScheduleOut:
    state = await feeds.source_state(db)
    return ScheduleOut(
        provider="gtfs",
        source=SOURCE_NAME,
        license=feeds.LICENSE,
        name=meta.name if meta else None,
        valid_from=meta.start if meta else None,
        valid_to=meta.end if meta else None,
        fetched_at=meta.fetched_at if meta else None,
        checked_at=state.ok_at if state else None,
        stale=feeds.is_stale(state, utcnow()),
    )


def near_stops(tt: Timetable, lat: float, lon: float, limit: int = 4) -> list[NearStopOut]:
    out: list[NearStopOut] = []
    seen_names: set[str] = set()
    for s, d in tt.stops_near(lat, lon, 700):
        name = tt.stop_names[s]
        lines: dict[str, str] = {}
        for p, _ in tt.stop_patterns[s]:
            r = tt.routes[tt.patterns[p].route]
            lines.setdefault(r.short_name, r.kind)
        if not lines:
            continue
        if name in seen_names:
            # Two platforms of one stop: merge their lines into the nearer one.
            for o in out:
                if o.name == name:
                    o.lines = sorted(set(o.lines) | set(lines), key=_line_key)
                    o.modes = sorted(set(o.modes) | set(lines.values()))
            continue
        seen_names.add(name)
        out.append(
            NearStopOut(
                name=name,
                code=tt.stop_codes[s],
                near_address=_near_address(tt.lat[s], tt.lon[s]),
                distance_m=walk_metres(d),
                walk_min=walk_seconds(d) // 60,
                lat=tt.lat[s],
                lon=tt.lon[s],
                lines=sorted(lines, key=_line_key),
                modes=sorted(set(lines.values())),
            )
        )
        if len(out) >= limit:
            break
    return out


def _line_key(name: str) -> tuple[int, int, str]:
    return (0, int(name), "") if name.isdigit() else (1, 0, name)


# ---- plan ---------------------------------------------------------------------

_cache: OrderedDict[str, tuple[float, PlanOut]] = OrderedDict()
CACHE_SECONDS = 60
CACHE_SIZE = 200


def _cache_key(*parts: object) -> str:
    return hashlib.sha256("|".join(map(str, parts)).encode()).hexdigest()


def _near_address(lat: float, lon: float) -> str | None:
    a = get_index().nearest(lat, lon)
    return a.label if a else None


def _stop(tt: Timetable, s: int) -> StopOut:
    return StopOut(
        name=tt.stop_names[s],
        code=tt.stop_codes[s],
        lat=tt.lat[s],
        lon=tt.lon[s],
        near_address=_near_address(tt.lat[s], tt.lon[s]),
    )


def option_out(
    tt: Timetable,
    day: DayTable,
    opt: planner.Option,
    a: PlaceData,
    b: PlaceData,
    recommended: bool,
) -> OptionOut:
    at = lambda t: planner.to_datetime(day.day, t)  # noqa: E731
    legs: list[LegOut] = []
    warnings: list[str] = []
    if opt.found is None:
        minutes = (opt.arrive - opt.depart) // 60
        legs.append(LegOut(kind="walk", minutes=minutes, metres=opt.walk_m))
    else:
        clock_t = opt.depart
        for leg in opt.found.legs:
            if isinstance(leg, raptor.WalkLeg):
                fa = (
                    (a.lat, a.lon)
                    if leg.from_stop is None
                    else (tt.lat[leg.from_stop], tt.lon[leg.from_stop])
                )
                tb = (
                    (b.lat, b.lon)
                    if leg.to_stop is None
                    else (tt.lat[leg.to_stop], tt.lon[leg.to_stop])
                )
                legs.append(
                    LegOut(
                        kind="walk",
                        minutes=leg.seconds // 60,
                        metres=walk_metres(haversine_m(*fa, *tb)),
                        from_name=None if leg.from_stop is None else tt.stop_names[leg.from_stop],
                        to_name=None if leg.to_stop is None else tt.stop_names[leg.to_stop],
                    )
                )
                clock_t += leg.seconds
                continue
            pat = tt.patterns[leg.dp.pattern]
            route = tt.routes[pat.route]
            wait = max(0, leg.departure - clock_t)
            if legs and any(lg.kind == "ride" for lg in legs) and wait < TIGHT_TRANSFER:
                warnings.append("tight_transfer")
            legs.append(
                LegOut(
                    kind="ride",
                    minutes=(leg.arrival - leg.departure) // 60,
                    mode=route.kind,
                    line=route.short_name,
                    night=route.night,
                    headsign=tt.trip_headsign[leg.trip_id] or None,
                    from_stop=_stop(tt, leg.from_stop),
                    to_stop=_stop(tt, leg.to_stop),
                    departure_at=at(leg.departure),
                    arrival_at=at(leg.arrival),
                    stops=leg.alight - leg.board,
                    wait_min=wait // 60,
                )
            )
            clock_t = leg.arrival
    rides = [lg for lg in legs if lg.kind == "ride"]
    walk_m = sum(lg.metres or 0 for lg in legs if lg.kind == "walk")
    walk_min = sum(lg.minutes for lg in legs if lg.kind == "walk")
    key = "walk" if opt.found is None else ",".join(map(str, opt.found.key))
    return OptionOut(
        id=hashlib.sha256(f"{day.day}|{key}".encode()).hexdigest()[:16],
        provider="gtfs",
        tags=opt.tags,
        recommended=recommended,
        depart_at=at(opt.depart),
        arrive_at=at(opt.arrive),
        duration_min=(opt.arrive - opt.depart) // 60,
        transfers=max(0, len(rides) - 1),
        walk_m=walk_m,
        walk_min=walk_min,
        legs=legs,
        warnings=sorted(set(warnings)),
        first_ride=rides[0] if rides else None,
    )


PREFER_TAG = {
    "fastest": ("fastest", "latest_departure"),
    "fewer_transfers": ("fewer_transfers",),
    "less_walking": ("less_walking",),
}

MESSAGES = {
    "no_route": "Не нашли поездку общественным транспортом в ближайшие 3 часа.",
    "no_stops_start": "Рядом с местом отправления нет остановок в пределах выбранного пешего пути.",
    "no_stops_end": "Рядом с местом назначения нет остановок в пределах выбранного пешего пути.",
    "no_schedule": "Нет действующего расписания на эту дату — маршрут не строим, чтобы не обмануть.",
    "loading": "Загружаем расписание — это занимает до минуты после перезапуска сервера.",
    "same_place": "Начало и конец маршрута совпадают.",
}


def _jd_mode(vehicle: str) -> str:
    return {
        "tram": "tram",
        "bus": "bus",
        "microbus": "bus",
        "trolleybus": "bus",
        "train": "rail",
    }.get(vehicle, "other")


def jakdojade_options(routes: list[jakdojade.JdRoute], prefer: str) -> list[OptionOut]:
    """Jakdojade connections in the app's option shape (their times count as scheduled)."""
    out: list[OptionOut] = []
    for r in routes:
        legs: list[LegOut] = []
        for ln in r.lines:
            first, last = ln.stops[0], ln.stops[-1]
            dep = first.departure or first.arrival
            arr = last.arrival or last.departure
            minutes = int((arr - dep).total_seconds() // 60) if dep and arr else 0
            if ln.vehicle == "walk":
                legs.append(
                    LegOut(
                        kind="walk",
                        minutes=minutes,
                        metres=ln.distance_m,
                        from_name=first.name or None,
                        to_name=last.name or None,
                    )
                )
                continue
            legs.append(
                LegOut(
                    kind="ride",
                    minutes=minutes,
                    mode=_jd_mode(ln.vehicle),
                    line=ln.name,
                    night=ln.night,
                    headsign=ln.direction or None,
                    from_stop=StopOut(name=first.name, code=first.code),
                    to_stop=StopOut(name=last.name, code=last.code),
                    departure_at=dep,
                    arrival_at=arr,
                    stops=len(ln.stops) - 1,
                )
            )
        rides = [lg for lg in legs if lg.kind == "ride"]
        walks = [lg for lg in legs if lg.kind == "walk"]
        out.append(
            OptionOut(
                id=r.key,
                provider="jakdojade",
                tags=[],
                recommended=False,
                depart_at=r.start,
                arrive_at=r.finish,
                duration_min=int((r.finish - r.start).total_seconds() // 60),
                transfers=max(0, len(rides) - 1),
                walk_m=sum(lg.metres or 0 for lg in walks),
                walk_min=sum(lg.minutes for lg in walks),
                legs=legs,
                first_ride=rides[0] if rides else None,
            )
        )
    if out:
        min(out, key=lambda o: (o.arrive_at, o.transfers)).tags.append("fastest")
        fewest = min(out, key=lambda o: (o.transfers, o.arrive_at))
        if "fastest" not in fewest.tags:
            fewest.tags.append("fewer_transfers")
        least = min(out, key=lambda o: (o.walk_m, o.arrive_at))
        if not least.tags:
            least.tags.append("less_walking")
        for o in out:
            if not o.tags:
                o.tags.append("later")
        wanted = PREFER_TAG.get(prefer, PREFER_TAG["fastest"])
        pick = next((o for o in out if any(t in o.tags for t in wanted)), out[0])
        pick.recommended = True
    return out


def _empty(
    status: str,
    mode: str,
    at: datetime,
    a_title: str,
    b_title: str,
    schedule: ScheduleOut | None,
) -> PlanOut:
    return PlanOut(
        status=status,  # type: ignore[arg-type]
        message=MESSAGES.get(status),
        mode=mode,  # type: ignore[arg-type]
        at=at,
        from_title=a_title,
        to_title=b_title,
        options=[],
        walk_option=None,
        schedule=schedule,
    )


async def plan(
    db: AsyncSession,
    a_place: Place,
    b_place: Place,
    at: datetime,
    arrive_by: bool,
    prefer: str,
    max_walk_m: int,
) -> PlanOut:
    a, b = open_place(a_place), open_place(b_place)
    mode = "arrive" if arrive_by else "depart"
    titles = (a_place.title, b_place.title)
    if a is None or b is None:
        raise ValidationFailed("Адрес места не удалось прочитать — укажите его заново")
    if haversine_m(a.lat, a.lon, b.lat, b.lon) < 30:
        return _empty("same_place", mode, at, *titles, None)

    notes: list[str] = []
    if get_settings().jakdojade_configured:
        try:
            routes = await jakdojade.search(a.lat, a.lon, b.lat, b.lon, at, arrive_by)
            options = jakdojade_options(routes, prefer)
            if options:
                return PlanOut(
                    status="ok",
                    message=None,
                    mode=mode,  # type: ignore[arg-type]
                    at=at,
                    from_title=titles[0],
                    to_title=titles[1],
                    options=options,
                    walk_option=None,
                    schedule=ScheduleOut(
                        provider="jakdojade",
                        source="Jakdojade (API partnerskie)",
                        license=None,
                        name=None,
                        valid_from=None,
                        valid_to=None,
                        fetched_at=utcnow(),
                        checked_at=utcnow(),
                        stale=False,
                    ),
                    notes=["Время — по данным Jakdojade, по расписанию."],
                )
        except jakdojade.JakdojadeUnavailable as exc:
            log.warning("jakdojade unavailable", extra={"ctx": {"error": str(exc)}})
            notes.append("Jakdojade сейчас недоступен — показано по открытому расписанию города.")

    local = at.astimezone(planner.ZONE)
    meta = await feeds.feed_for(db, local.date())
    schedule = await schedule_out(db, meta)
    if meta is None:
        return _empty("no_schedule", mode, at, *titles, schedule)

    key = _cache_key(
        meta.id, a_place.id, b_place.id, arrive_by, at.replace(second=0, microsecond=0),
        prefer, max_walk_m, schedule.stale, a_place.updated_at, b_place.updated_at,
    )  # fmt: skip
    hit = _cache.get(key)
    if hit and clock.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]

    day = await feeds.get_store().day(db, meta, local.date(), wait=LOAD_WAIT)
    if day is None:
        return _empty("loading", mode, at, *titles, schedule)
    result = await asyncio.to_thread(
        planner.plan,
        day,
        planner.Point(a.lat, a.lon),
        planner.Point(b.lat, b.lon),
        at,
        arrive_by,
        max_walk_m,
    )
    wanted = PREFER_TAG.get(prefer, PREFER_TAG["fastest"])
    preferred: planner.Option | None = next(
        (o for o in result.options if any(t in o.tags for t in wanted)), None
    )
    if preferred is None and result.options:
        preferred = result.options[0]
    if result.walk_only is not None and any(t in result.walk_only.tags for t in wanted):
        preferred = result.walk_only
    # Outdated data is never presented as the best choice.
    fresh = not schedule.stale
    tt = day.tt
    options = [option_out(tt, day, o, a, b, fresh and o is preferred) for o in result.options]
    walk = (
        option_out(tt, day, result.walk_only, a, b, fresh and result.walk_only is preferred)
        if result.walk_only
        else None
    )
    notes.append(
        "Время — по расписанию. Задержки не учитываются: данных о движении в реальном времени нет."
    )
    if schedule.stale:
        notes.append("Расписание давно не удавалось обновить — сверьтесь с табло на остановке.")
    out = PlanOut(
        status=result.status,  # type: ignore[arg-type]
        message=MESSAGES.get(result.status),
        mode=mode,  # type: ignore[arg-type]
        at=at,
        from_title=titles[0],
        to_title=titles[1],
        options=options,
        walk_option=walk,
        schedule=schedule,
        jakdojade_url=_jakdojade_link(options, arrive_by),
        notes=notes,
    )
    _cache[key] = (clock.monotonic(), out)
    while len(_cache) > CACHE_SIZE:
        _cache.popitem(last=False)
    return out


def _jakdojade_link(options: list[OptionOut], arrive_by: bool) -> str | None:
    """A link to the same trip in Jakdojade, between its first and last stop."""
    for o in options:
        rides = [lg for lg in o.legs if lg.kind == "ride"]
        if not rides:
            continue
        a, b = rides[0].from_stop, rides[-1].to_stop
        if (
            a is None
            or b is None
            or a.lat is None
            or a.lon is None
            or b.lat is None
            or b.lon is None
        ):
            continue
        when = rides[-1].arrival_at if arrive_by else rides[0].departure_at
        if when is None:
            continue
        return jakdojade.link(a.name, a.lat, a.lon, b.name, b.lat, b.lon, when, arrive_by)
    return None
