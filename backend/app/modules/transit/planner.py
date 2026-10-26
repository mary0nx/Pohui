"""Route options between two points from the GTFS timetable.

Several searches over the same date give the candidates: the time × vehicles Pareto set, the
same with short walks only, and the next (or, for "arrive by", the previous) departure. Each
candidate is tightened (latest departure for its arrival) and labelled: fastest, fewer
transfers, less walking, later/earlier. All times are scheduled times from the timetable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.modules.transit import raptor
from app.modules.transit.geo import haversine_m, walk_metres, walk_seconds
from app.modules.transit.gtfs import DayTable, Timetable

ZONE = ZoneInfo("Europe/Warsaw")
HORIZON = 3 * 3600  # search window after the departure (before an "arrive by")
NEAR_STOPS = 30  # at most this many stops around each end
SHORT_WALK_M = 450  # the "less walking" search keeps every walk under this
WALK_ONLY_M = 1500  # suggest walking when the whole way is this short
SLACK = 25 * 60  # an option may arrive this much later than the fastest to be worth showing


def day_origin(day: date) -> datetime:
    """GTFS times count from "noon minus 12 h" of the service day (correct across DST)."""
    return datetime.combine(day, time(12), ZONE) - timedelta(hours=12)


def to_seconds(when: datetime, day: date) -> int:
    return int((when - day_origin(day)).total_seconds())


def to_datetime(day: date, seconds: int) -> datetime:
    return (day_origin(day) + timedelta(seconds=seconds)).astimezone(ZONE)


@dataclass(frozen=True)
class Point:
    lat: float
    lon: float


@dataclass
class Option:
    found: raptor.Found | None  # None: walking only
    depart: int
    arrive: int
    walk_m: int
    tags: list[str] = field(default_factory=list)

    @property
    def transfers(self) -> int:
        return max(0, len(self.found.rides) - 1) if self.found else 0

    @property
    def key(self) -> tuple[int, ...]:
        return self.found.key if self.found else ()


@dataclass
class Plan:
    status: str  # ok | no_route | no_stops_start | no_stops_end
    day: date
    options: list[Option]
    walk_only: Option | None = None


def _ends(tt: Timetable, p: Point, radius: int) -> tuple[dict[int, int], dict[int, float]]:
    near = tt.stops_near(p.lat, p.lon, radius)[:NEAR_STOPS]
    return {s: walk_seconds(d) for s, d in near}, dict(near)


def _walk_m(tt: Timetable, f: raptor.Found, a: Point, b: Point) -> int:
    total = 0.0
    for leg in f.legs:
        if not isinstance(leg, raptor.WalkLeg):
            continue
        if leg.from_stop is None and leg.to_stop is not None:
            total += haversine_m(a.lat, a.lon, tt.lat[leg.to_stop], tt.lon[leg.to_stop])
        elif leg.to_stop is None and leg.from_stop is not None:
            total += haversine_m(tt.lat[leg.from_stop], tt.lon[leg.from_stop], b.lat, b.lon)
        elif leg.from_stop is not None and leg.to_stop is not None:
            fs, ts = leg.from_stop, leg.to_stop
            total += haversine_m(tt.lat[fs], tt.lon[fs], tt.lat[ts], tt.lon[ts])
    return walk_metres(total)


def plan(
    day: DayTable,
    start: Point,
    end: Point,
    at: datetime,
    arrive_by: bool = False,
    max_walk_m: int = 1000,
) -> Plan:
    tt = day.tt
    t = to_seconds(at, day.day)
    radius = round(max_walk_m / 1.3)  # walking metres → straight-line radius
    access, _ = _ends(tt, start, radius)
    egress, _ = _ends(tt, end, radius)
    direct = haversine_m(start.lat, start.lon, end.lat, end.lon)
    walk_only = None
    if direct <= WALK_ONLY_M:
        w = walk_seconds(direct)
        walk_only = (
            Option(None, t - w, t, walk_metres(direct), ["walk"])
            if arrive_by
            else Option(None, t, t + w, walk_metres(direct), ["walk"])
        )
    if not access or not egress:
        status = "no_stops_start" if not access else "no_stops_end"
        return Plan(status, day.day, [], walk_only)

    found: list[raptor.Found] = []
    if arrive_by:
        main = raptor.backward(day, t, access, egress, horizon=t - HORIZON)
        found += main
        if main:
            latest = max(f.arrive for f in main)
            found += raptor.backward(day, latest - 60, access, egress, horizon=t - HORIZON)
        short_a = {s: w for s, w in access.items() if s in _within(tt, start, SHORT_WALK_M)}
        short_e = {s: w for s, w in egress.items() if s in _within(tt, end, SHORT_WALK_M)}
        if short_a and short_e:
            found += raptor.backward(day, t, short_a, short_e, horizon=t - HORIZON)
    else:
        main = raptor.forward(day, t, access, egress, horizon=t + HORIZON)
        found += [_tighten(day, f, access, egress) for f in main]
        if main:
            first = min(main, key=lambda f: f.arrive)
            later = raptor.forward(day, _tighten(day, first, access, egress).depart + 60,
                                   access, egress, horizon=t + HORIZON)  # fmt: skip
            found += [_tighten(day, f, access, egress) for f in later]
        short_a = {s: w for s, w in access.items() if s in _within(tt, start, SHORT_WALK_M)}
        short_e = {s: w for s, w in egress.items() if s in _within(tt, end, SHORT_WALK_M)}
        if short_a and short_e:
            short = raptor.forward(day, t, short_a, short_e, horizon=t + HORIZON)
            found += [_tighten(day, f, short_a, short_e) for f in short]

    options = _choose(tt, found, start, end, arrive_by)
    if walk_only and not options:
        walk_only.tags.append("latest_departure" if arrive_by else "fastest")
    if walk_only and options:
        best = options[0]
        tag = best.tags[0]
        if (arrive_by and walk_only.depart >= best.depart) or (
            not arrive_by and walk_only.arrive <= best.arrive
        ):
            best.tags.remove(tag)  # walking gets there sooner: it is the option to show first
            best.tags.insert(0, "by_transit")
            walk_only.tags.append(tag)
    status = "ok" if options or walk_only else "no_route"
    return Plan(status, day.day, options, walk_only)


def _within(tt: Timetable, p: Point, metres: int) -> set[int]:
    return {s for s, _ in tt.stops_near(p.lat, p.lon, round(metres / 1.3))}


def _tighten(
    day: DayTable, f: raptor.Found, access: dict[int, int], egress: dict[int, int]
) -> raptor.Found:
    """The same arrival with the latest possible departure (no needless waiting)."""
    back = raptor.backward(day, f.arrive, access, egress, rounds=len(f.rides))
    good = [b for b in back if b.arrive <= f.arrive and b.depart >= f.depart]
    return max(good, key=lambda b: (b.depart, -len(b.rides))) if good else f


def _choose(
    tt: Timetable, found: list[raptor.Found], a: Point, b: Point, arrive_by: bool
) -> list[Option]:
    unique: dict[tuple[int, ...], Option] = {}
    for f in found:
        opt = Option(f, f.depart, f.arrive, _walk_m(tt, f, a, b))
        old = unique.get(opt.key)
        if old is None or (opt.arrive, -opt.depart) < (old.arrive, -old.depart):
            unique[opt.key] = opt
    if not unique:
        return []
    cands = list(unique.values())
    if arrive_by:
        # Latest departure first: the least time spent waiting at the destination.
        best = max(cands, key=lambda o: (o.depart, -o.transfers, -o.walk_m))
        best.tags.append("latest_departure")
    else:
        best = min(cands, key=lambda o: (o.arrive, o.transfers, o.walk_m, -o.depart))
        best.tags.append("fastest")
    chosen = [best]

    def pool() -> list[Option]:
        if arrive_by:
            return [o for o in cands if o is not best and o.depart >= best.depart - SLACK]
        return [o for o in cands if o is not best and o.arrive <= best.arrive + SLACK]

    fewer = [o for o in pool() if o.transfers < best.transfers]
    if fewer:
        pick = min(fewer, key=lambda o: (o.transfers, o.arrive - o.depart, o.walk_m))
        pick.tags.append("fewer_transfers")
        chosen.append(pick)
    less = [o for o in pool() if o.walk_m <= best.walk_m - 200]
    if less:
        pick = min(less, key=lambda o: (o.walk_m, o.arrive - o.depart))
        pick.tags.append("less_walking")
        if pick not in chosen:
            chosen.append(pick)
    if arrive_by:
        other = [o for o in cands if o not in chosen and o.arrive < best.arrive]
        if other:
            pick = max(other, key=lambda o: (o.transfers <= best.transfers, o.arrive, o.depart))
            pick.tags.append("earlier")
            chosen.append(pick)
    else:
        other = [o for o in cands if o not in chosen and o.depart > best.depart]
        if other:
            # The next departure of a similar journey, not a later one with extra changes.
            pick = min(other, key=lambda o: (o.transfers > best.transfers, o.depart, o.arrive))
            pick.tags.append("later")
            chosen.append(pick)
    return chosen
