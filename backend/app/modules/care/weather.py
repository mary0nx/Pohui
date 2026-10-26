"""Today's weather for the morning message: real forecasts only, never invented values.

Two free sources without keys: Open-Meteo (primary) and MET Norway (fallback; Open-Meteo
answers "daily request limit exceeded" to busy shared IPs). Both are normalised to hourly
points in the city's local time, then summarised for the part of the day people are outside
(from leaving home until the evening). Forecasts are cached for 30 minutes per place and day;
a failure is remembered for 2 minutes so a broken source is not hammered every tick.
Neither source publishes official weather warnings, so the message never claims one.
"""

from __future__ import annotations

import logging
import time as clock
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any
from zoneinfo import ZoneInfo

import httpx

log = logging.getLogger(__name__)

USER_AGENT = "FamilyOS/0.12 (+https://github.com/yurypatsko-ctrl/Pohui)"
CACHE_SECONDS = 30 * 60
FAILURE_SECONDS = 2 * 60
DAY_END = time(21, 0)

# Simplified conditions, ordered by how much they matter for the day's advice.
CONDITIONS = ("thunder", "snow", "rain", "drizzle", "fog", "overcast", "cloudy", "clear")
WET = {"thunder", "snow", "rain", "drizzle"}


class WeatherUnavailable(Exception):
    """No source could give a forecast; the message is sent without weather claims."""


@dataclass(frozen=True)
class Place:
    name: str
    latitude: float
    longitude: float
    timezone: str


WROCLAW = Place("Вроцлав", 51.10286, 17.03006, "Europe/Warsaw")


@dataclass(frozen=True)
class HourPoint:
    at: datetime  # local time of the place
    temp: float
    feels: float | None
    precip_mm: float
    precip_prob: float | None
    wind_kmh: float
    gust_kmh: float | None
    condition: str
    uv: float | None = None


@dataclass(frozen=True)
class DayWeather:
    """What the day outside looks like, from the time of leaving home until the evening."""

    day: date
    place: str
    source: str
    temp_min: float
    temp_max: float
    leave_temp: float
    leave_feels: float
    leave_hour: int  # hour of the forecast point used; later than leaving when that has passed
    precip_prob_max: float | None
    precip_mm: float
    wind_max_kmh: float
    gust_max_kmh: float | None
    condition: str  # the most significant condition of the daytime hours
    rain_from: int | None  # local hour when rain / snow is expected to start, if any
    uv_max: float | None

    @property
    def wet(self) -> bool:
        return (
            self.condition in ("rain", "drizzle", "thunder")
            or self.precip_mm >= 1.0
            or (self.precip_prob_max is not None and self.precip_prob_max >= 50)
        )

    @property
    def maybe_wet(self) -> bool:
        return not self.wet and (
            self.precip_mm >= 0.3
            or (self.precip_prob_max is not None and self.precip_prob_max >= 30)
        )


def wmo_condition(code: int) -> str:
    if code >= 95:
        return "thunder"
    if code in (71, 73, 75, 77, 85, 86):
        return "snow"
    if code in (61, 63, 65, 66, 67, 80, 81, 82):  # 66/67: freezing rain
        return "rain"
    if code in (51, 53, 55, 56, 57):
        return "drizzle"
    if code in (45, 48):
        return "fog"
    if code == 3:
        return "overcast"
    if code == 2:
        return "cloudy"
    return "clear"  # 0 clear, 1 mainly clear


def met_condition(symbol: str) -> str:
    s = symbol.split("_")[0]
    if "thunder" in s:
        return "thunder"
    if "snow" in s or "sleet" in s:
        return "snow"
    if "drizzle" in s:
        return "drizzle"
    if "rain" in s:
        return "rain"
    if s == "fog":
        return "fog"
    if s == "cloudy":
        return "overcast"
    if s == "partlycloudy":
        return "cloudy"
    return "clear"


def summarize(
    points: list[HourPoint], day: date, leave: time, place: str, source: str
) -> DayWeather:
    """The daytime picture: hours from leaving home (at the latest 12:00) until 21:00."""
    start = min(leave, time(12, 0))
    hours = [p for p in points if p.at.date() == day and start.hour <= p.at.hour <= DAY_END.hour]
    if len(hours) < 3:
        raise WeatherUnavailable("forecast does not cover today")
    at_leave = min(
        hours, key=lambda p: abs(p.at.hour * 60 + p.at.minute - (leave.hour * 60 + leave.minute))
    )
    probs = [p.precip_prob for p in hours if p.precip_prob is not None]
    gusts = [p.gust_kmh for p in hours if p.gust_kmh is not None]
    uvs = [p.uv for p in hours if p.uv is not None]
    # A single drizzly hour does not make a rainy day: rain counts from two wet hours on.
    wet_hours = [p for p in hours if p.condition in WET or p.precip_mm >= 0.2]
    thunder = any(p.condition == "thunder" for p in hours)
    if thunder:
        condition = "thunder"
    elif len(wet_hours) >= 2:
        wet = {p.condition for p in wet_hours}
        condition = next((c for c in ("snow", "rain", "drizzle") if c in wet), "rain")
    else:
        dry = {p.condition for p in hours if p.condition not in WET}
        condition = next((c for c in CONDITIONS if c in dry), "cloudy")
    rain_from = wet_hours[0].at.hour if thunder or len(wet_hours) >= 2 else None
    return DayWeather(
        day=day,
        place=place,
        source=source,
        temp_min=min(p.temp for p in hours),
        temp_max=max(p.temp for p in hours),
        leave_temp=at_leave.temp,
        leave_feels=at_leave.feels if at_leave.feels is not None else at_leave.temp,
        leave_hour=at_leave.at.hour,
        precip_prob_max=max(probs) if probs else None,
        precip_mm=round(sum(p.precip_mm for p in hours), 1),
        wind_max_kmh=max(p.wind_kmh for p in hours),
        gust_max_kmh=max(gusts) if gusts else None,
        condition=condition,
        rain_from=rain_from,
        uv_max=max(uvs) if uvs else None,
    )


Fetcher = Callable[[str, dict[str, Any], dict[str, str]], Awaitable[Any]]


async def http_get_json(url: str, params: dict[str, Any], headers: dict[str, str]) -> Any:
    async with httpx.AsyncClient(
        timeout=10, headers={"User-Agent": USER_AGENT, **headers}
    ) as client:
        r = await client.get(url, params=params)
    if r.status_code != 200:
        raise WeatherUnavailable(f"{url.split('/')[2]} answered {r.status_code}")
    data = r.json()
    if isinstance(data, dict) and data.get("error"):
        raise WeatherUnavailable(f"{url.split('/')[2]}: {str(data.get('reason', 'error'))[:80]}")
    return data


async def open_meteo(place: Place, fetch: Fetcher) -> list[HourPoint]:
    data = await fetch(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": place.latitude,
            "longitude": place.longitude,
            "hourly": "temperature_2m,apparent_temperature,precipitation_probability,precipitation,"
            "weather_code,wind_speed_10m,wind_gusts_10m,uv_index",
            "timezone": place.timezone,
            "forecast_days": 2,
            "wind_speed_unit": "kmh",
        },
        {},
    )
    h = data["hourly"]
    zone = ZoneInfo(place.timezone)
    points = []
    for i, stamp in enumerate(h["time"]):
        if h["temperature_2m"][i] is None:
            continue
        points.append(
            HourPoint(
                at=datetime.fromisoformat(stamp).replace(tzinfo=zone),
                temp=float(h["temperature_2m"][i]),
                feels=_num(h.get("apparent_temperature"), i),
                precip_mm=_num(h.get("precipitation"), i) or 0.0,
                precip_prob=_num(h.get("precipitation_probability"), i),
                wind_kmh=_num(h.get("wind_speed_10m"), i) or 0.0,
                gust_kmh=_num(h.get("wind_gusts_10m"), i),
                condition=wmo_condition(int(h["weather_code"][i] or 0)),
                uv=_num(h.get("uv_index"), i),
            )
        )
    return points


async def met_norway(place: Place, fetch: Fetcher) -> list[HourPoint]:
    data = await fetch(
        "https://api.met.no/weatherapi/locationforecast/2.0/complete",
        {"lat": round(place.latitude, 4), "lon": round(place.longitude, 4)},
        {},
    )
    zone = ZoneInfo(place.timezone)
    points = []
    for entry in data["properties"]["timeseries"]:
        nxt = entry["data"].get("next_1_hours")
        if not nxt:
            continue  # beyond ~2.5 days only 6-hour steps are given
        d = entry["data"]["instant"]["details"]
        details = nxt.get("details", {})
        gust = d.get("wind_speed_of_gust")
        points.append(
            HourPoint(
                at=datetime.fromisoformat(entry["time"].replace("Z", "+00:00")).astimezone(zone),
                temp=float(d["air_temperature"]),
                feels=d.get("apparent_air_temperature"),
                precip_mm=float(details.get("precipitation_amount", 0.0)),
                precip_prob=details.get("probability_of_precipitation"),
                wind_kmh=float(d.get("wind_speed", 0.0)) * 3.6,
                gust_kmh=float(gust) * 3.6 if gust is not None else None,
                condition=met_condition(nxt["summary"]["symbol_code"]),
                uv=d.get("ultraviolet_index_clear_sky"),
            )
        )
    return points


def _num(values: list[Any] | None, i: int) -> float | None:
    if not values or values[i] is None:
        return None
    return float(values[i])


SOURCES: list[tuple[str, Callable[[Place, Fetcher], Awaitable[list[HourPoint]]]]] = [
    ("Open-Meteo", open_meteo),
    ("MET Norway", met_norway),
]

_cache: dict[tuple[float, float, date], tuple[float, list[HourPoint], str]] = {}
_failed: dict[tuple[float, float, date], float] = {}


def clear_cache() -> None:
    _cache.clear()
    _failed.clear()


async def day_weather(
    place: Place, day: date, leave: time, fetch: Fetcher = http_get_json
) -> DayWeather:
    key = (round(place.latitude, 2), round(place.longitude, 2), day)
    now = clock.monotonic()
    cached = _cache.get(key)
    if cached and now - cached[0] < CACHE_SECONDS:
        return summarize(cached[1], day, leave, place.name, cached[2])
    if now - _failed.get(key, -FAILURE_SECONDS) < FAILURE_SECONDS:
        raise WeatherUnavailable("recently failed")
    errors = []
    for name, source in SOURCES:
        try:
            points = await source(place, fetch)
            result = summarize(points, day, leave, place.name, name)
        except (WeatherUnavailable, httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
            errors.append(f"{name}: {type(exc).__name__}: {str(exc)[:80]}")
            continue
        _cache[key] = (now, points, name)
        return result
    _failed[key] = now
    log.warning("weather unavailable", extra={"ctx": {"errors": errors}})
    raise WeatherUnavailable("; ".join(errors))


async def geocode(query: str, fetch: Fetcher = http_get_json) -> Place | None:
    """City name → coordinates and time zone (Open-Meteo geocoding, no key)."""
    data = await fetch(
        "https://geocoding-api.open-meteo.com/v1/search",
        {"name": query.strip()[:100], "count": 1, "language": "ru", "format": "json"},
        {},
    )
    results = data.get("results") or []
    if not results:
        return None
    r = results[0]
    return Place(
        r["name"], float(r["latitude"]), float(r["longitude"]), r.get("timezone") or "Europe/Warsaw"
    )
