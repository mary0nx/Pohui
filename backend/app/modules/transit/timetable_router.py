"""Timetables of Wrocław trams and buses (/transit/…): public schedule data, no personal data.
Login is still required, like the rest of the API."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import DB, CurrentUser
from app.core.errors import NotFound, ValidationFailed
from app.core.rate_limit import get_rate_limiter
from app.modules.transit import feeds, planner, service
from app.modules.transit import timetable as T
from app.modules.transit.gtfs import DayTable
from app.modules.transit.schemas import ScheduleOut

router = APIRouter(prefix="/transit", tags=["timetable"])

Status = Literal["ok", "no_schedule", "loading"]


class DirectionBrief(BaseModel):
    id: str
    headsign: str


class LineOut(BaseModel):
    line: str
    mode: str
    night: bool
    runs: bool  # has trips on the chosen date
    directions: list[DirectionBrief]


class LinesOut(BaseModel):
    status: Status
    date: date
    schedule: ScheduleOut | None
    lines: list[LineOut]


class StopRef(BaseModel):
    id: str
    name: str
    code: str


class DirectionOut(DirectionBrief):
    stops: list[StopRef]


class LineDetailOut(BaseModel):
    status: Status
    date: date
    schedule: ScheduleOut | None
    line: str
    mode: str
    night: bool
    directions: list[DirectionOut]


class DepartureOut(BaseModel):
    at: datetime
    time: str  # HH:MM on the clock
    hour: int  # 0–23 of that clock time
    headsign: str
    other_end: bool
    next: bool  # the first departure from now on (today only)


class DeparturesOut(BaseModel):
    status: Status
    date: date
    schedule: ScheduleOut | None
    line: str
    mode: str
    night: bool
    direction: DirectionBrief | None
    stop: StopRef | None
    departures: list[DepartureOut]
    time_kind: Literal["scheduled"] = "scheduled"


class StopGroupOut(BaseModel):
    name: str
    lines: list[str]


class StopSearchOut(BaseModel):
    status: Status
    stops: list[StopGroupOut]


class BoardRowOut(BaseModel):
    at: datetime
    time: str
    minutes: int
    line: str
    mode: str
    night: bool
    headsign: str
    platform: str


class BoardOut(BaseModel):
    status: Status
    date: date
    schedule: ScheduleOut | None
    name: str
    rows: list[BoardRowOut]
    time_kind: Literal["scheduled"] = "scheduled"


def _today() -> date:
    return datetime.now(planner.ZONE).date()


def _check_day(day: date | None) -> date:
    today = _today()
    day = day or today
    if not today - timedelta(days=1) <= day <= today + timedelta(days=31):
        raise ValidationFailed("Расписание можно смотреть на месяц вперёд")
    return day


async def _day(db: AsyncSession, day: date) -> tuple[Status, DayTable | None, ScheduleOut | None]:
    meta = await feeds.feed_for(db, day)
    if meta is None:
        return "no_schedule", None, await service.schedule_out(db, None)
    schedule = await service.schedule_out(db, meta)
    table = await feeds.get_store().day(db, meta, day, wait=service.LOAD_WAIT)
    if table is None:
        return "loading", None, schedule
    return "ok", table, schedule


def _hhmm(day: date, seconds: int) -> tuple[datetime, str, int]:
    at = planner.to_datetime(day, seconds)
    return at, at.strftime("%H:%M"), at.hour


def _stop_ref(day: DayTable, s: int) -> StopRef:
    tt = day.tt
    return StopRef(id=tt.stop_ids[s], name=tt.stop_names[s], code=tt.stop_codes[s])


def _line(day: DayTable, name: str) -> T.Line:
    line = T.lines(day.tt).get(name)
    if line is None:
        raise NotFound("Такой линии нет в расписании")
    return line


@router.get("/lines", response_model=LinesOut)
async def list_lines(
    user: CurrentUser, db: DB, day: date | None = Query(None, alias="date")
) -> LinesOut:
    d = _check_day(day)
    status, table, schedule = await _day(db, d)
    if table is None:
        return LinesOut(status=status, date=d, schedule=schedule, lines=[])
    out = [
        LineOut(
            line=line.name,
            mode=line.kind,
            night=line.night,
            runs=T.runs_on(table, line),
            directions=[DirectionBrief(id=x.key, headsign=x.headsign) for x in line.directions],
        )
        for line in sorted(T.lines(table.tt).values(), key=T.line_sort_key)
    ]
    return LinesOut(status=status, date=d, schedule=schedule, lines=out)


@router.get("/lines/{name}", response_model=LineDetailOut)
async def line_detail(
    name: str, user: CurrentUser, db: DB, day: date | None = Query(None, alias="date")
) -> LineDetailOut:
    d = _check_day(day)
    status, table, schedule = await _day(db, d)
    if table is None:
        return LineDetailOut(
            status=status,
            date=d,
            schedule=schedule,
            line=name,
            mode="other",
            night=False,
            directions=[],
        )
    line = _line(table, name)
    return LineDetailOut(
        status=status,
        date=d,
        schedule=schedule,
        line=line.name,
        mode=line.kind,
        night=line.night,
        directions=[
            DirectionOut(
                id=x.key,
                headsign=x.headsign,
                stops=[_stop_ref(table, s) for s in T.stop_list(table.tt, x)],
            )
            for x in line.directions
        ],
    )


@router.get("/lines/{name}/departures", response_model=DeparturesOut)
async def line_departures(
    name: str,
    user: CurrentUser,
    db: DB,
    direction: str = Query(..., max_length=80),
    stop: str = Query(..., max_length=40),
    day: date | None = Query(None, alias="date"),
) -> DeparturesOut:
    await get_rate_limiter().hit(f"timetable:{user.id}", 120)
    d = _check_day(day)
    status, table, schedule = await _day(db, d)
    if table is None:
        return DeparturesOut(
            status=status,
            date=d,
            schedule=schedule,
            line=name,
            mode="other",
            night=False,
            direction=None,
            stop=None,
            departures=[],
        )
    line = _line(table, name)
    dirn = next((x for x in line.directions if x.key == direction), None)
    tt = table.tt
    try:
        s = tt.stop_ids.index(stop)
    except ValueError:
        s = -1
    if dirn is None or s < 0:
        raise NotFound("Нет такого направления или остановки")
    now = planner.to_seconds(datetime.now(planner.ZONE), d) if d == _today() else None
    rows = T.departures(table, line, dirn, s)
    first_next = next((r.seconds for r in rows if now is not None and r.seconds >= now), None)
    deps = []
    for r in rows:
        at, hhmm, hour = _hhmm(d, r.seconds)
        deps.append(
            DepartureOut(
                at=at,
                time=hhmm,
                hour=hour,
                headsign=r.headsign,
                other_end=r.other_end,
                next=r.seconds == first_next,
            )
        )
    return DeparturesOut(
        status=status,
        date=d,
        schedule=schedule,
        line=line.name,
        mode=line.kind,
        night=line.night,
        direction=DirectionBrief(id=dirn.key, headsign=dirn.headsign),
        stop=_stop_ref(table, s),
        departures=deps,
    )


@router.get("/stops/search", response_model=StopSearchOut)
async def search_stops(
    user: CurrentUser, db: DB, q: str = Query(..., min_length=2, max_length=60)
) -> StopSearchOut:
    await get_rate_limiter().hit(f"stop-search:{user.id}", 60)
    status, table, _ = await _day(db, _today())
    if table is None:
        return StopSearchOut(status=status, stops=[])
    tt = table.tt
    out = []
    for name, stops in T.stop_groups(tt, q):
        names = {
            tt.routes[tt.patterns[p].route].short_name
            for s in stops
            for p, _ in tt.stop_patterns[s]
        }
        out.append(
            StopGroupOut(
                name=name,
                lines=sorted(
                    names, key=lambda n: (not n.isdigit(), int(n) if n.isdigit() else 0, n)
                ),
            )
        )
    return StopSearchOut(status=status, stops=out)


@router.get("/stops/board", response_model=BoardOut)
async def stop_board(
    user: CurrentUser,
    db: DB,
    name: str = Query(..., min_length=1, max_length=80),
    day: date | None = Query(None, alias="date"),
    time: str | None = Query(None, pattern=r"^\d{2}:\d{2}$"),
) -> BoardOut:
    """The next departures of every line from a stop (all its platforms)."""
    await get_rate_limiter().hit(f"stop-board:{user.id}", 120)
    d = _check_day(day)
    status, table, schedule = await _day(db, d)
    if table is None:
        return BoardOut(status=status, date=d, schedule=schedule, name=name, rows=[])
    stops = T.stops_named(table.tt, name)
    if not stops:
        raise NotFound("Нет такой остановки")
    now = datetime.now(planner.ZONE)
    if time:
        h, m = (int(x) for x in time.split(":"))
        start_at = datetime(d.year, d.month, d.day, h, m, tzinfo=planner.ZONE)
    else:
        start_at = (
            now if d == now.date() else datetime(d.year, d.month, d.day, 4, 0, tzinfo=planner.ZONE)
        )
    start = planner.to_seconds(start_at, d)
    rows = []
    for r in T.board(table, stops, start):
        at, hhmm, _ = _hhmm(d, r.seconds)
        rows.append(
            BoardRowOut(
                at=at,
                time=hhmm,
                minutes=max(0, round((at - start_at).total_seconds() / 60)),
                line=r.line,
                mode=r.kind,
                night=r.night,
                headsign=r.headsign,
                platform=table.tt.stop_codes[r.stop],
            )
        )
    return BoardOut(status=status, date=d, schedule=schedule, name=name, rows=rows)
