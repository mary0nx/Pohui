"""RAPTOR (Delling, Pajor, Werneck 2012) over one date's timetable.

Round k finds the best times that need at most k vehicles. forward() gives the earliest
arrival for a departure time, backward() the latest departure for an "arrive by" time; both
return one journey per round that improves on the rounds before: a Pareto set of
time × number of vehicles. Walking: from the start to nearby stops, between stops close to
each other (one walk between two rides) and from the last stop to the destination.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.modules.transit.gtfs import DayPattern, DayTable, earliest_trip, latest_trip

INF = 1 << 30
CHANGE = 60  # seconds to change vehicles at the same stop


@dataclass(frozen=True)
class RideLeg:
    dp: DayPattern
    trip: int  # index in dp.trips
    board: int  # positions in the pattern
    alight: int

    @property
    def departure(self) -> int:
        return self.dp.times[(self.trip * self.dp.n + self.board) * 2 + 1]

    @property
    def arrival(self) -> int:
        return self.dp.times[(self.trip * self.dp.n + self.alight) * 2]

    @property
    def from_stop(self) -> int:
        return self.dp.stops[self.board]

    @property
    def to_stop(self) -> int:
        return self.dp.stops[self.alight]

    @property
    def trip_id(self) -> int:
        return self.dp.trips[self.trip]


@dataclass(frozen=True)
class WalkLeg:
    from_stop: int | None  # None: the start point
    to_stop: int | None  # None: the destination
    seconds: int


Leg = RideLeg | WalkLeg


@dataclass(frozen=True)
class Found:
    legs: tuple[Leg, ...]  # always walk, ride, [walk, ride, …], walk
    depart: int  # leaving the start point
    arrive: int  # reaching the destination

    @property
    def rides(self) -> tuple[RideLeg, ...]:
        return tuple(leg for leg in self.legs if isinstance(leg, RideLeg))

    @property
    def walk_seconds(self) -> int:
        return sum(leg.seconds for leg in self.legs if isinstance(leg, WalkLeg))

    @property
    def key(self) -> tuple[int, ...]:
        return tuple(r.trip_id for r in self.rides)


def _scan_set(day: DayTable, stops: set[int], first: bool) -> dict[int, int]:
    """pattern → first (forward) or last (backward) position of a marked stop on it."""
    out: dict[int, int] = {}
    for s in stops:
        for p, i in day.tt.stop_patterns[s]:
            if p not in day.by_pattern:
                continue
            seen = out.get(p)
            if seen is None or (i < seen if first else i > seen):
                out[p] = i
    return out


def forward(
    day: DayTable,
    depart: int,
    access: dict[int, int],
    egress: dict[int, int],
    rounds: int = 4,
    horizon: int = INF,
) -> list[Found]:
    """Earliest arrivals leaving at `depart`. access / egress: stop → walking seconds."""
    tt = day.tt
    n = len(tt.stop_ids)
    best = [INF] * n
    labels = [[INF] * n for _ in range(rounds + 1)]
    parents: list[dict[int, tuple]] = [{} for _ in range(rounds + 1)]
    for s, w in access.items():
        labels[0][s] = best[s] = depart + w
        parents[0][s] = ("start",)
    marked = set(access)
    target = INF
    results: list[Found] = []
    for k in range(1, rounds + 1):
        prev, cur, par, prev_par = labels[k - 1], labels[k], parents[k], parents[k - 1]
        reached: set[int] = set()
        for p, start in _scan_set(day, marked, first=True).items():
            pat = tt.patterns[p]
            can_board, can_alight = pat.can_board, pat.can_alight
            for dp in day.by_pattern[p]:
                times, n2, stops = dp.times, dp.n * 2, dp.stops
                trip, board_at = -1, -1
                for i in range(start, dp.n):
                    s = stops[i]
                    if trip >= 0 and can_alight[i]:
                        arr = times[trip * n2 + 2 * i]
                        if arr < best[s] and arr < target:
                            cur[s] = best[s] = arr
                            par[s] = ("ride", dp, trip, board_at, i)
                            reached.add(s)
                    ready = prev[s]
                    if ready >= INF or not can_board[i]:
                        continue
                    if prev_par[s][0] == "ride":
                        ready += CHANGE
                    if trip >= 0:
                        if ready > times[trip * n2 + 2 * i + 1]:
                            continue
                        if trip == 0 or times[(trip - 1) * n2 + 2 * i + 1] < ready:
                            continue  # no earlier trip can be caught here
                    cand = earliest_trip(dp, i, ready)
                    if cand >= 0 and (trip < 0 or cand < trip):
                        if times[cand * n2 + 2 * i + 1] > horizon:
                            continue
                        trip, board_at = cand, i
        walked: set[int] = set()
        for s, base, ride in [(s, cur[s], par[s]) for s in reached]:
            for s2, w in tt.transfers[s]:
                t = base + w
                if t < best[s2] and t < target:
                    cur[s2] = best[s2] = t
                    par[s2] = ("walk", s, w, ride)  # the ride that brought us to s
                    walked.add(s2)
        marked = reached | walked
        arrival, end = INF, -1
        for s in reached:  # a walk between stops never directly precedes the final walk
            if par[s][0] != "ride":
                continue  # its label was improved by a walk from another stop
            ew = egress.get(s)
            if ew is not None and cur[s] + ew < arrival:
                arrival, end = cur[s] + ew, s
        if end >= 0 and arrival < target:
            target = arrival
            legs = _legs_back(parents, k, end, egress[end], access)
            first = legs[1]
            assert isinstance(first, RideLeg)
            results.append(Found(legs, first.departure - access[first.from_stop], arrival))
        if not marked:
            break
    return results


def _legs_back(
    parents: list[dict[int, tuple]], k: int, stop: int, egress_s: int, access: dict[int, int]
) -> tuple[Leg, ...]:
    """Follows the parents of a forward search from the last stop back to the start."""
    out: list[Leg] = [WalkLeg(stop, None, egress_s)]
    s = stop
    while True:
        par = parents[k][s]
        if par[0] == "start":
            break
        if par[0] == "walk":
            out.append(WalkLeg(par[1], s, par[2]))
            s, par = par[1], par[3]
        _, dp, trip, board, alight = par
        out.append(RideLeg(dp, trip, board, alight))
        s = dp.stops[board]
        k -= 1
    out.append(WalkLeg(None, s, access[s]))
    out.reverse()
    return tuple(out)


def backward(
    day: DayTable,
    arrive_by: int,
    access: dict[int, int],
    egress: dict[int, int],
    rounds: int = 4,
    horizon: int = -INF,
) -> list[Found]:
    """Latest departures that still reach the destination by `arrive_by`."""
    tt = day.tt
    n = len(tt.stop_ids)
    best = [-INF] * n
    labels = [[-INF] * n for _ in range(rounds + 1)]
    parents: list[dict[int, tuple]] = [{} for _ in range(rounds + 1)]
    for s, w in egress.items():
        labels[0][s] = best[s] = arrive_by - w
        parents[0][s] = ("end",)
    marked = set(egress)
    source = -INF
    results: list[Found] = []
    for k in range(1, rounds + 1):
        prev, cur, par, prev_par = labels[k - 1], labels[k], parents[k], parents[k - 1]
        reached: set[int] = set()
        for p, last in _scan_set(day, marked, first=False).items():
            pat = tt.patterns[p]
            can_board, can_alight = pat.can_board, pat.can_alight
            for dp in day.by_pattern[p]:
                times, n2, stops = dp.times, dp.n * 2, dp.stops
                trip, alight_at = -1, -1
                for i in range(last, -1, -1):
                    s = stops[i]
                    if trip >= 0 and can_board[i]:
                        dep = times[trip * n2 + 2 * i + 1]
                        if dep > best[s] and dep > source:
                            cur[s] = best[s] = dep
                            par[s] = ("ride", dp, trip, i, alight_at)
                            reached.add(s)
                    ready = prev[s]
                    if ready <= -INF or not can_alight[i]:
                        continue
                    if prev_par[s][0] == "ride":
                        ready -= CHANGE
                    if trip >= 0:
                        if ready < times[trip * n2 + 2 * i]:
                            continue
                        if trip + 1 == len(dp.trips) or times[(trip + 1) * n2 + 2 * i] > ready:
                            continue  # no later trip arrives in time
                    cand = latest_trip(dp, i, ready)
                    if cand >= 0 and cand > trip:
                        if times[cand * n2 + 2 * i] < horizon:
                            continue
                        trip, alight_at = cand, i
        walked: set[int] = set()
        for s, base, ride in [(s, cur[s], par[s]) for s in reached]:
            for s2, w in tt.transfers[s]:
                t = base - w
                if t > best[s2] and t > source:
                    cur[s2] = best[s2] = t
                    par[s2] = ("walk", s, w, ride)  # the ride taken from s
                    walked.add(s2)
        marked = reached | walked
        departure, start = -INF, -1
        for s in reached:  # the first walk is never followed by a walk between stops
            if par[s][0] != "ride":
                continue
            aw = access.get(s)
            if aw is not None and cur[s] - aw > departure:
                departure, start = cur[s] - aw, s
        if start >= 0 and departure > source:
            source = departure
            legs = _legs_forward(parents, k, start, access[start], egress)
            final = legs[-2]
            assert isinstance(final, RideLeg)
            results.append(Found(legs, departure, final.arrival + egress[final.to_stop]))
        if not marked:
            break
    return results


def _legs_forward(
    parents: list[dict[int, tuple]], k: int, stop: int, access_s: int, egress: dict[int, int]
) -> tuple[Leg, ...]:
    """Follows the parents of a backward search from the first stop on to the destination."""
    out: list[Leg] = [WalkLeg(None, stop, access_s)]
    s = stop
    while True:
        par = parents[k][s]
        if par[0] == "end":
            break
        if par[0] == "walk":
            out.append(WalkLeg(s, par[1], par[2]))
            s, par = par[1], par[3]
        _, dp, trip, board, alight = par
        out.append(RideLeg(dp, trip, board, alight))
        s = dp.stops[alight]
        k -= 1
    out.append(WalkLeg(s, None, egress[s]))
    return tuple(out)
