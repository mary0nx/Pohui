"""API shapes of «Мой маршрут». Every time carries its kind: "scheduled" (from a timetable).
Predicted or confirmed times would need a permitted realtime source, which is not connected."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

PlaceKind = Literal["home", "work", "other"]
Prefer = Literal["fastest", "fewer_transfers", "less_walking"]
TimeKind = Literal["scheduled", "predicted", "confirmed"]


class AddressOut(BaseModel):
    id: str  # "<register version>:<index>", valid for the register it came from
    label: str
    street: str
    number: str
    postcode: str
    estate: str
    lat: float
    lon: float


class StreetOut(BaseModel):
    street: str
    count: int


class SearchIn(BaseModel):
    q: str = Field(min_length=1, max_length=80)


class SearchOut(BaseModel):
    addresses: list[AddressOut]
    streets: list[StreetOut]
    source: str


class NearStopOut(BaseModel):
    name: str
    code: str
    distance_m: int
    walk_min: int
    lat: float
    lon: float
    lines: list[str]
    modes: list[str]


class CheckIn(BaseModel):
    address_id: str = Field(max_length=40)


class CheckOut(BaseModel):
    address: AddressOut
    stops: list[NearStopOut] | None  # None: the schedule is not loaded yet
    osm_url: str


class PlaceIn(BaseModel):
    kind: PlaceKind
    title: str = Field(min_length=1, max_length=40)
    address_id: str = Field(max_length=40)
    shared: bool = False

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("пустое название")
        return v


class PlacePatch(BaseModel):
    kind: PlaceKind | None = None
    title: str | None = Field(None, min_length=1, max_length=40)
    address_id: str | None = Field(None, max_length=40)
    shared: bool | None = None
    position: int | None = Field(None, ge=0, le=100)


class PlaceOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    label: str | None  # None: the stored address could not be opened
    estate: str | None
    lat: float | None
    lon: float | None
    shared: bool
    mine: bool
    owner_name: str | None = None
    position: int


class PlacesOut(BaseModel):
    places: list[PlaceOut]
    shared: list[PlaceOut]  # places other family members chose to share


class FavoriteIn(BaseModel):
    from_place_id: uuid.UUID
    to_place_id: uuid.UUID


class FavoriteOut(BaseModel):
    id: uuid.UUID
    from_place_id: uuid.UUID
    to_place_id: uuid.UUID


class PreferencesIn(BaseModel):
    prefer: Prefer = "fastest"
    max_walk_m: int = Field(1000, ge=300, le=2000)


class PreferencesOut(PreferencesIn):
    pass


class PlanIn(BaseModel):
    from_place_id: uuid.UUID
    to_place_id: uuid.UUID
    mode: Literal["depart", "arrive"] = "depart"
    at: datetime | None = None  # default: now

    @field_validator("at")
    @classmethod
    def _aware(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            raise ValueError("время должно быть с часовым поясом")
        return v


class StopOut(BaseModel):
    name: str
    code: str
    lat: float | None = None
    lon: float | None = None


class LegOut(BaseModel):
    kind: Literal["walk", "ride"]
    minutes: int
    # walk
    metres: int | None = None
    from_name: str | None = None  # None: the start place
    to_name: str | None = None  # None: the destination
    # ride
    mode: str | None = None  # tram | bus | rail | other
    line: str | None = None
    night: bool = False
    headsign: str | None = None
    from_stop: StopOut | None = None
    to_stop: StopOut | None = None
    departure_at: datetime | None = None
    arrival_at: datetime | None = None
    stops: int | None = None  # stops travelled
    time_kind: TimeKind = "scheduled"
    delay_min: int | None = None  # only from a realtime source
    wait_min: int | None = None  # waiting at the stop before this ride


class OptionOut(BaseModel):
    id: str
    provider: Literal["gtfs", "jakdojade"]
    tags: list[str]
    recommended: bool
    depart_at: datetime
    arrive_at: datetime
    duration_min: int
    transfers: int
    walk_m: int
    walk_min: int
    legs: list[LegOut]
    time_kind: TimeKind = "scheduled"
    warnings: list[str] = []
    first_ride: LegOut | None = None


class ScheduleOut(BaseModel):
    provider: Literal["gtfs", "jakdojade"]
    source: str
    license: str | None
    name: str | None
    valid_from: date | None
    valid_to: date | None
    fetched_at: datetime | None
    checked_at: datetime | None
    stale: bool


class PlanOut(BaseModel):
    status: Literal[
        "ok", "no_route", "no_stops_start", "no_stops_end", "no_schedule", "loading", "same_place"
    ]
    message: str | None
    mode: Literal["depart", "arrive"]
    at: datetime
    from_title: str
    to_title: str
    options: list[OptionOut]
    walk_option: OptionOut | None
    schedule: ScheduleOut | None
    realtime: bool = False
    jakdojade_url: str | None = None
    notes: list[str] = []


class StatusOut(BaseModel):
    schedule: ScheduleOut | None
    loaded: bool
    jakdojade_configured: bool
    realtime: bool
    addresses_version: str
    addresses_source: str
    addresses_count: int
