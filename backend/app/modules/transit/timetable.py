"""Timetables for browsing, like a printed stop schedule: lines, their two directions with the
stops in order, the departures of a line from a stop on a date, and a stop's next departures.

Everything comes from the GTFS feed; a direction is the feed's direction_id (or, when a feed
has none, the last stop of the trip). Variants of a line in one direction (a trip that ends
early, a detour) are listed with their own destination.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass

from app.modules.transit.addresses import fold
from app.modules.transit.gtfs import DayTable, Timetable, earliest_trip


@dataclass(frozen=True)
class Direction:
    key: str
    headsign: str
    patterns: tuple[int, ...]
    main: int  # the pattern with the most trips: its stops are the line's stops


@dataclass(frozen=True)
class Line:
    name: str
    kind: str
    night: bool
    routes: tuple[int, ...]
    directions: tuple[Direction, ...]


def _dir_key(tt: Timetable, p: int) -> str:
    pat = tt.patterns[p]
    d = tt.trip_direction[pat.trips[0]] if len(tt.trip_direction) else -1
    return str(d) if d >= 0 else f"to:{tt.stop_names[pat.stops[-1]]}"


def line_sort_key(line: Line) -> tuple[int, int, str]:
    group = 0 if line.kind == "tram" else 2 if line.night else 1
    return (group, int(line.name) if line.name.isdigit() else -1, line.name)


def lines(tt: Timetable) -> dict[str, Line]:
    """All lines of the feed by name (computed once per feed, kept with it)."""
    if tt.lines_cache is not None:
        return tt.lines_cache
    by_name: dict[str, list[int]] = {}
    for r, route in enumerate(tt.routes):
        if tt.route_patterns[r]:
            by_name.setdefault(route.short_name, []).append(r)
    out: dict[str, Line] = {}
    for name, routes in by_name.items():
        groups: dict[str, list[int]] = {}
        for r in routes:
            for p in tt.route_patterns[r]:
                groups.setdefault(_dir_key(tt, p), []).append(p)
        directions = []
        for key, pats in sorted(groups.items()):
            main = max(pats, key=lambda p: len(tt.patterns[p].trips))
            heads = Counter(tt.trip_headsign[t] for t in tt.patterns[main].trips)
            headsign = heads.most_common(1)[0][0] or tt.stop_names[tt.patterns[main].stops[-1]]
            directions.append(Direction(key, headsign, tuple(pats), main))
        first = tt.routes[routes[0]]
        out[name] = Line(name, first.kind, first.night, tuple(routes), tuple(directions))
    tt.lines_cache = out
    return out


def runs_on(day: DayTable, line: Line) -> bool:
    """Has trips of this date (last night's trips after midnight do not count)."""
    for d in line.directions:
        for p in d.patterns:
            for dp in day.by_pattern.get(p, ()):
                n2 = dp.n * 2
                if any(dp.times[k * n2 + 1] >= 0 for k in range(len(dp.trips))):
                    return True
    return False


def stop_list(tt: Timetable, d: Direction) -> list[int]:
    return list(tt.patterns[d.main].stops)


@dataclass(frozen=True)
class Departure:
    seconds: int  # on the date's clock (may be ≥ 24 h after midnight)
    headsign: str
    other_end: bool  # this trip ends somewhere else than the line's usual end


def departures(day: DayTable, line: Line, d: Direction, stop: int) -> list[Departure]:
    tt = day.tt
    out: list[Departure] = []
    for p in d.patterns:
        pat = tt.patterns[p]
        positions = [
            i
            for i, s in enumerate(pat.stops)
            if s == stop and pat.can_board[i] and i < len(pat.stops) - 1
        ]
        if not positions:
            continue
        for dp in day.by_pattern.get(p, ()):
            n2 = dp.n * 2
            for k, trip in enumerate(dp.trips):
                if dp.times[k * n2 + 1] < 0:
                    continue  # yesterday's trip after midnight: listed under yesterday
                head = tt.trip_headsign[trip] or tt.stop_names[pat.stops[-1]]
                for i in positions:
                    out.append(Departure(dp.times[k * n2 + 2 * i + 1], head, head != d.headsign))
    out.sort(key=lambda x: x.seconds)
    return out


def stop_groups(tt: Timetable, query: str, limit: int = 12) -> list[tuple[str, list[int]]]:
    """Stops by name ("plac grunw" → «PL. GRUNWALDZKI»), all platforms of a name together."""
    synonyms = {"plac": "pl", "aleja": "al", "ulica": "", "ul": "", "ul.": ""}
    words = [synonyms.get(w, w) for w in fold(query).split()]
    words = [w for w in words if w]
    if not words:
        return []
    names: dict[str, list[int]] = {}
    for s, name in enumerate(tt.stop_names):
        if tt.stop_patterns[s]:
            names.setdefault(name, []).append(s)
    hits = []
    for name, stops in names.items():
        f = fold(name)
        if all(w in f for w in words):
            hits.append((0 if f.startswith(words[0]) else 1, len(name), name, stops))
    hits.sort()
    return [(name, stops) for _, _, name, stops in hits[:limit]]


def stops_named(tt: Timetable, name: str) -> list[int]:
    return [s for s, n in enumerate(tt.stop_names) if n == name and tt.stop_patterns[s]]


@dataclass(frozen=True)
class BoardRow:
    seconds: int
    line: str
    kind: str
    night: bool
    headsign: str
    stop: int


def board(
    day: DayTable, stops: list[int], start: int, horizon: int = 2 * 3600, limit: int = 40
) -> list[BoardRow]:
    """Next departures of every line from these platforms, from `start` (day seconds)."""
    tt = day.tt
    rows: list[BoardRow] = []
    for s in stops:
        for p, i in tt.stop_patterns[s]:
            pat = tt.patterns[p]
            if not pat.can_board[i] or i == len(pat.stops) - 1:
                continue
            route = tt.routes[pat.route]
            for dp in day.by_pattern.get(p, ()):
                n2 = dp.n * 2
                k = earliest_trip(dp, i, start)
                if k < 0:
                    continue
                for kk in range(k, len(dp.trips)):
                    t = dp.times[kk * n2 + 2 * i + 1]
                    if t > start + horizon:
                        break
                    trip = dp.trips[kk]
                    rows.append(
                        BoardRow(
                            t,
                            route.short_name,
                            route.kind,
                            route.night,
                            tt.trip_headsign[trip] or tt.stop_names[pat.stops[-1]],
                            s,
                        )
                    )
    rows.sort(key=lambda r: (r.seconds, r.line))
    return rows[:limit]
