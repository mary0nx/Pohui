"""GTFS schedule (the official Wrocław feed) read into a compact timetable for routing.

Only the files the router needs are read: feed_info, calendar, calendar_dates, routes, stops,
trips and stop_times. Trips with the same route, stops and boarding rules form a pattern; a
pattern keeps its trips' times in one flat int array (seconds after the service day's noon
minus 12 h, as GTFS defines, so times after midnight are > 86400). Nothing is invented: a stop,
line or time exists here only if it is in the feed.
"""

from __future__ import annotations

import csv
import io
import math
import zipfile
from array import array
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import date, timedelta

from app.modules.transit.geo import haversine_m, walk_seconds

DAY = 86400
TRANSFER_RADIUS_M = 350  # stops this close are joined by a walking transfer
MIN_TRANSFER_WALK = 60  # even to a stop next door: crossing, finding the platform
NEEDED = ("stops.txt", "routes.txt", "trips.txt", "stop_times.txt", "calendar.txt")


class FeedError(ValueError):
    """The file is not a usable GTFS feed."""


@dataclass(frozen=True)
class FeedInfo:
    publisher: str
    start: date | None
    end: date | None


@dataclass(frozen=True)
class Route:
    short_name: str
    kind: str  # "tram" | "bus" | "rail" | "other"
    night: bool


@dataclass
class Pattern:
    route: int
    stops: array  # stop indices along the pattern
    can_board: bytes  # 1 where pickup is allowed
    can_alight: bytes  # 1 where drop-off is allowed
    trips: list[int] = field(default_factory=list)  # global trip indices
    # Per trip: arrival and departure at every stop: times[(t * n + i) * 2] = arrival, +1 = dep.
    times: array = field(default_factory=lambda: array("i"))


@dataclass
class Timetable:
    info: FeedInfo
    stop_ids: list[str]
    stop_names: list[str]
    stop_codes: list[str]
    lat: array
    lon: array
    routes: list[Route]
    patterns: list[Pattern]
    trip_service: array  # trip -> service index
    trip_headsign: list[str]
    services: list[str]
    # service -> (weekday bit mask Mon=bit0, start, end)
    calendar: list[tuple[int, date, date]]
    # service -> {date: True (added) / False (removed)}
    exceptions: list[dict[date, bool]]
    stop_patterns: list[list[tuple[int, int]]] = field(default_factory=list)
    transfers: list[list[tuple[int, int]]] = field(default_factory=list)

    def active_services(self, day: date) -> set[int]:
        out = set()
        bit = 1 << day.weekday()
        for s, (mask, start, end) in enumerate(self.calendar):
            on = bool(mask & bit) and start <= day <= end
            override = self.exceptions[s].get(day)
            if override is not None:
                on = override
            if on:
                out.add(s)
        return out

    def covers(self, day: date) -> bool:
        info = self.info
        if info.start and day < info.start:
            return False
        return not (info.end and day > info.end)

    def stops_near(self, lat: float, lon: float, radius_m: float) -> list[tuple[int, float]]:
        """(stop, metres) of the stops within radius_m, nearest first."""
        found = []
        # Cheap box filter before the exact distance (1° latitude ≈ 111 km).
        dlat = radius_m / 111_000
        dlon = dlat / max(0.2, math.cos(math.radians(lat)))
        for i in range(len(self.stop_ids)):
            if abs(self.lat[i] - lat) > dlat or abs(self.lon[i] - lon) > dlon:
                continue
            d = haversine_m(lat, lon, self.lat[i], self.lon[i])
            if d <= radius_m:
                found.append((i, d))
        found.sort(key=lambda x: x[1])
        return found


def _rows(z: zipfile.ZipFile, name: str) -> Iterator[dict[str, str]]:
    with z.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig", newline="")
        yield from csv.DictReader(text)


def _time(value: str) -> int:
    h, m, s = value.strip().split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def _date(value: str) -> date:
    v = value.strip()
    return date(int(v[:4]), int(v[4:6]), int(v[6:8]))


def _kind(route_type: str) -> str:
    t = int(route_type or -1)
    if t == 0 or 900 <= t < 1000:
        return "tram"
    if t == 3 or 700 <= t < 800:
        return "bus"
    if t == 2 or 100 <= t < 200:
        return "rail"
    return "other"


def read_feed_info(data: bytes) -> FeedInfo:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        return _feed_info(z)


def _feed_info(z: zipfile.ZipFile) -> FeedInfo:
    if "feed_info.txt" not in z.namelist():
        return FeedInfo("", None, None)
    for row in _rows(z, "feed_info.txt"):
        start = row.get("feed_start_date") or ""
        end = row.get("feed_end_date") or ""
        return FeedInfo(
            row.get("feed_publisher_name", ""),
            _date(start) if start.strip() else None,
            _date(end) if end.strip() else None,
        )
    return FeedInfo("", None, None)


def load(data: bytes) -> Timetable:
    """Parses a GTFS zip. Raises FeedError when a required file or column is missing."""
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise FeedError("not a zip file") from exc
    with z:
        missing = [n for n in NEEDED if n not in z.namelist()]
        if missing:
            raise FeedError(f"missing {', '.join(missing)}")
        try:
            return _load(z)
        except (KeyError, ValueError) as exc:
            raise FeedError(f"bad feed: {exc}") from exc


def _load(z: zipfile.ZipFile) -> Timetable:
    info = _feed_info(z)

    stop_ids: list[str] = []
    stop_names: list[str] = []
    stop_codes: list[str] = []
    lat, lon = array("d"), array("d")
    stop_index: dict[str, int] = {}
    for row in _rows(z, "stops.txt"):
        if row.get("location_type", "0").strip() not in ("", "0"):
            continue  # stations and entrances: boarding happens at their platforms
        stop_index[row["stop_id"]] = len(stop_ids)
        stop_ids.append(row["stop_id"])
        stop_names.append(row["stop_name"].strip())
        stop_codes.append((row.get("stop_code") or "").strip())
        lat.append(float(row["stop_lat"]))
        lon.append(float(row["stop_lon"]))

    routes: list[Route] = []
    route_index: dict[str, int] = {}
    for row in _rows(z, "routes.txt"):
        name = (row.get("route_short_name") or row.get("route_long_name") or "").strip()
        route_index[row["route_id"]] = len(routes)
        # Wrocław marks night lines with route_type2 40 and names them 2xx.
        night = row.get("route_type2_id", "").strip() == "40"
        routes.append(Route(name, _kind(row["route_type"]), night))

    services: list[str] = []
    service_index: dict[str, int] = {}
    calendar: list[tuple[int, date, date]] = []
    exceptions: list[dict[date, bool]] = []

    def service(sid: str) -> int:
        if sid not in service_index:
            service_index[sid] = len(services)
            services.append(sid)
            calendar.append((0, date.max, date.min))
            exceptions.append({})
        return service_index[sid]

    days = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    for row in _rows(z, "calendar.txt"):
        s = service(row["service_id"])
        mask = sum(1 << i for i, d in enumerate(days) if row[d].strip() == "1")
        calendar[s] = (mask, _date(row["start_date"]), _date(row["end_date"]))
    if "calendar_dates.txt" in z.namelist():
        for row in _rows(z, "calendar_dates.txt"):
            s = service(row["service_id"])
            exceptions[s][_date(row["date"])] = row["exception_type"].strip() == "1"

    trip_index: dict[str, int] = {}
    trip_route: list[int] = []
    trip_service = array("i")
    trip_headsign: list[str] = []
    for row in _rows(z, "trips.txt"):
        r = route_index.get(row["route_id"])
        if r is None:
            continue
        trip_index[row["trip_id"]] = len(trip_route)
        trip_route.append(r)
        trip_service.append(service(row["service_id"]))
        trip_headsign.append((row.get("trip_headsign") or "").strip())

    try:
        patterns = _patterns(_grouped(_stop_times(z, trip_index, stop_index)), trip_route)
    except _Unsorted:
        # Rows of a trip are spread over the file: collect everything first (more memory).
        collected: dict[int, list[tuple[int, int, int, int, bool, bool]]] = {}
        for t, seq, stop, arr, dep, board, alight in _stop_times(z, trip_index, stop_index):
            collected.setdefault(t, []).append((seq, stop, arr, dep, board, alight))
        patterns = _patterns(iter(sorted(collected.items())), trip_route)
    if not patterns:
        raise FeedError("no trips with times")

    tt = Timetable(
        info=info,
        stop_ids=stop_ids,
        stop_names=stop_names,
        stop_codes=stop_codes,
        lat=lat,
        lon=lon,
        routes=routes,
        patterns=patterns,
        trip_service=trip_service,
        trip_headsign=trip_headsign,
        services=services,
        calendar=calendar,
        exceptions=exceptions,
    )
    tt.stop_patterns = [[] for _ in stop_ids]
    for p, pat in enumerate(patterns):
        for i, s in enumerate(pat.stops):
            tt.stop_patterns[s].append((p, i))
    tt.transfers = _transfers(tt)
    return tt


class _Unsorted(Exception):
    pass


StopTime = tuple[
    int, int, int, int, bool, bool
]  # sequence, stop, arrival, departure, board, alight


def _stop_times(
    z: zipfile.ZipFile, trip_index: dict[str, int], stop_index: dict[str, int]
) -> Iterator[tuple[int, int, int, int, int, bool, bool]]:
    with z.open("stop_times.txt") as raw:
        reader = csv.reader(io.TextIOWrapper(raw, encoding="utf-8-sig", newline=""))
        head = {name.strip(): i for i, name in enumerate(next(reader))}
        ti, si = head["trip_id"], head["stop_id"]
        ai, di, qi = head["arrival_time"], head["departure_time"], head["stop_sequence"]
        pi, oi = head.get("pickup_type"), head.get("drop_off_type")
        for row in reader:
            t = trip_index.get(row[ti])
            s = stop_index.get(row[si])
            if t is None or s is None:
                continue
            arr_s, dep_s = row[ai].strip(), row[di].strip()
            if not arr_s and not dep_s:
                continue  # untimed stop: no time to promise, skip it
            board = pi is None or row[pi].strip() != "1"
            alight = oi is None or row[oi].strip() != "1"
            yield (
                t,
                int(row[qi]),
                s,
                _time(arr_s or dep_s),
                _time(dep_s or arr_s),
                board,
                alight,
            )


def _grouped(
    rows: Iterator[tuple[int, int, int, int, int, bool, bool]],
) -> Iterator[tuple[int, list[StopTime]]]:
    """Consecutive rows of one trip (the usual layout); raises _Unsorted otherwise."""
    seen: set[int] = set()
    current = -1
    bucket: list[StopTime] = []
    for t, seq, stop, arr, dep, board, alight in rows:
        if t != current:
            if bucket:
                yield current, bucket
            if t in seen:
                raise _Unsorted
            seen.add(t)
            current, bucket = t, []
        bucket.append((seq, stop, arr, dep, board, alight))
    if bucket:
        yield current, bucket


def _patterns(groups: Iterator[tuple[int, list[StopTime]]], trip_route: list[int]) -> list[Pattern]:
    patterns: list[Pattern] = []
    pattern_index: dict[tuple, int] = {}
    for t, rows in groups:
        if len(rows) < 2:
            continue
        rows.sort()
        stops = tuple(r[1] for r in rows)
        board = bytes(1 if r[4] else 0 for r in rows)
        alight = bytes(1 if r[5] else 0 for r in rows)
        key = (trip_route[t], stops, board, alight)
        p = pattern_index.get(key)
        if p is None:
            p = pattern_index[key] = len(patterns)
            patterns.append(Pattern(trip_route[t], array("i", stops), board, alight))
        pat = patterns[p]
        pat.trips.append(t)
        for r in rows:
            pat.times.append(r[2])
            pat.times.append(r[3])
    return patterns


def _transfers(tt: Timetable) -> list[list[tuple[int, int]]]:
    """Walking transfers between nearby stops, from a coarse grid (no transfers.txt in feed)."""
    cell = 0.004  # ≈ 450 m in latitude, ≈ 280 m in longitude at 51°N
    grid: dict[tuple[int, int], list[int]] = {}
    for i in range(len(tt.stop_ids)):
        grid.setdefault((int(tt.lat[i] / cell), int(tt.lon[i] / cell)), []).append(i)
    out: list[list[tuple[int, int]]] = [[] for _ in tt.stop_ids]
    for i in range(len(tt.stop_ids)):
        gy, gx = int(tt.lat[i] / cell), int(tt.lon[i] / cell)
        for dy in (-1, 0, 1):
            for dx in (-2, -1, 0, 1, 2):
                for j in grid.get((gy + dy, gx + dx), ()):
                    if j == i:
                        continue
                    d = haversine_m(tt.lat[i], tt.lon[i], tt.lat[j], tt.lon[j])
                    if d <= TRANSFER_RADIUS_M:
                        out[i].append((j, max(MIN_TRANSFER_WALK, walk_seconds(d))))
    return out


@dataclass
class DayPattern:
    """Trips of one pattern that run on one date, in order, times on that date's clock.

    Trips inside a DayPattern never overtake each other at any stop, so the earliest trip from a
    stop is found by binary search; a trip that would overtake goes to another DayPattern.
    """

    pattern: int
    n: int
    stops: array  # the pattern's stops (shared, not copied)
    trips: list[int]
    times: array


@dataclass
class DayTable:
    """The timetable of one calendar date: its own services plus last night's trips after 24:00."""

    day: date
    tt: Timetable
    by_pattern: dict[int, list[DayPattern]]


def day_table(tt: Timetable, day: date) -> DayTable:
    today = tt.active_services(day)
    yesterday = tt.active_services(day - timedelta(days=1))
    out: dict[int, list[DayPattern]] = {}
    for p, pat in enumerate(tt.patterns):
        n = len(pat.stops)
        width = 2 * n
        rows: list[tuple[int, int, int]] = []  # (first departure, trip slot, offset)
        for slot, trip in enumerate(pat.trips):
            svc = tt.trip_service[trip]
            first_dep = pat.times[slot * width + 1]
            if svc in today:
                rows.append((first_dep, slot, 0))
            if svc in yesterday and pat.times[slot * width + width - 2] >= DAY:
                rows.append((first_dep - DAY, slot, -DAY))
        if not rows:
            continue
        rows.sort()
        groups: list[DayPattern] = []
        last: list[array] = []
        for _, slot, offset in rows:
            chunk = pat.times[slot * width : (slot + 1) * width]
            if offset:
                chunk = array("i", (v + offset for v in chunk))
            # The first group this trip does not overtake at any stop.
            g = next(
                (
                    j
                    for j, prev in enumerate(last)
                    if all(x <= y for x, y in zip(prev, chunk, strict=True))
                ),
                -1,
            )
            if g < 0:
                g = len(groups)
                groups.append(DayPattern(p, n, pat.stops, [], array("i")))
                last.append(chunk)
            groups[g].times.extend(chunk)
            groups[g].trips.append(pat.trips[slot])
            last[g] = chunk
        out[p] = groups
    return DayTable(day, tt, out)


def earliest_trip(dp: DayPattern, i: int, t: int) -> int:
    """Index (in dp.trips) of the first trip leaving stop i at or after t, or -1."""
    n2 = dp.n * 2
    times = dp.times
    lo, hi = 0, len(dp.trips)
    while lo < hi:
        mid = (lo + hi) // 2
        if times[mid * n2 + 2 * i + 1] < t:
            lo = mid + 1
        else:
            hi = mid
    return lo if lo < len(dp.trips) else -1


def latest_trip(dp: DayPattern, i: int, t: int) -> int:
    """Index of the last trip arriving at stop i at or before t, or -1."""
    n2 = dp.n * 2
    times = dp.times
    lo, hi = 0, len(dp.trips)
    while lo < hi:
        mid = (lo + hi) // 2
        if times[mid * n2 + 2 * i] <= t:
            lo = mid + 1
        else:
            hi = mid
    return lo - 1
