"""Jakdojade: links to its trip planner and, with partner keys, its official REST API.

Links follow the documented URL scheme (docs.jakdojade.pl, «Generowanie URL dla wyszukań»):
https://jakdojade.pl/<city>/<from name>/<to name>?fc=lat:lon&tc=lat:lon&d=DD.MM.YY&h=hh:mm&ia=…
They use the first and last stop of the trip (names and positions from the timetable), never
the member's own address.

The API (https://jakdojade.pl/api/rest/v2/routes, docs.jakdojade.pl/restxml) needs keys that
Jakdojade issues on request; requests without them return sample data only, so without keys
this module never calls it. Its times are reported as scheduled times.
"""

from __future__ import annotations

import hashlib
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import quote, urlencode, urlsplit
from zoneinfo import ZoneInfo

import httpx

from app.config import get_settings

ZONE = ZoneInfo("Europe/Warsaw")
SITE = "https://jakdojade.pl"
API = "https://jakdojade.pl/api/rest/v2/routes"
CITY = "wroclaw"
MAX_XML = 2 * 1024 * 1024


class JakdojadeUnavailable(RuntimeError):
    pass


def link(
    from_name: str,
    from_lat: float,
    from_lon: float,
    to_name: str,
    to_lat: float,
    to_lon: float,
    at: datetime,
    arrive_by: bool = False,
) -> str:
    local = at.astimezone(ZONE)
    query = urlencode(
        {
            "fc": f"{from_lat:.5f}:{from_lon:.5f}",
            "tc": f"{to_lat:.5f}:{to_lon:.5f}",
            "d": local.strftime("%d.%m.%y"),
            "h": local.strftime("%H:%M"),
            "ia": "true" if arrive_by else "false",
        }
    )
    url = f"{SITE}/{CITY}/{quote(from_name, safe='')}/{quote(to_name, safe='')}?{query}"
    if not valid_link(url):
        raise ValueError("unexpected Jakdojade link")
    return url


def valid_link(url: str) -> bool:
    parts = urlsplit(url)
    return (
        parts.scheme == "https"
        and parts.netloc == "jakdojade.pl"
        and parts.path.startswith(f"/{CITY}/")
        and not parts.username
        and not parts.password
    )


@dataclass(frozen=True)
class JdStop:
    name: str
    code: str
    departure: datetime | None
    arrival: datetime | None


@dataclass(frozen=True)
class JdLine:
    vehicle: str  # bus, tram, …, walk
    name: str
    direction: str
    distance_m: int | None
    stops: tuple[JdStop, ...]  # the stops travelled, first to last
    night: bool


@dataclass(frozen=True)
class JdRoute:
    start: datetime
    finish: datetime
    lines: tuple[JdLine, ...]

    @property
    def key(self) -> str:
        raw = "|".join(f"{ln.vehicle}{ln.name}{ln.stops[0].departure}" for ln in self.lines)
        return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _dt(value: str) -> datetime:
    return datetime.strptime(value.strip(), "%d.%m.%y %H:%M").replace(tzinfo=ZONE)


def _clock(base: datetime, hhmm: str | None) -> datetime | None:
    """A stop's hh:mm on the trip's day; times before the trip start belong to the next day."""
    if not hhmm:
        return None
    h, m = (int(x) for x in hhmm.split(":"))
    t = base.replace(hour=h, minute=m)
    return t + timedelta(days=1) if t < base - timedelta(hours=1) else t


def parse(xml: bytes) -> list[JdRoute]:
    if len(xml) > MAX_XML:
        raise JakdojadeUnavailable("response too large")
    try:
        root = ET.fromstring(xml)  # noqa: S314 - size-limited; ElementTree resolves no entities
    except ET.ParseError as exc:
        raise JakdojadeUnavailable("bad XML") from exc
    if root.tag != "ROUTE_SEARCH_RESULT":
        raise JakdojadeUnavailable("unexpected XML")
    for param in root.iter("param"):
        if param.get("key") == "test" and param.get("value") == "true":
            # Jakdojade answered with sample data (no valid authorisation): never show it.
            raise JakdojadeUnavailable("sample data")
    routes = []
    for r in root.iter("route"):
        start, finish = _dt(r.get("startDate", "")), _dt(r.get("finishDate", ""))
        lines = []
        for ln in sorted(r.iter("line"), key=lambda e: int(e.get("orderIndex", "0"))):
            stops = []
            for st in sorted(ln.iter("stop"), key=lambda e: int(e.get("orderIndex", "0"))):
                if st.get("additionalStop") == "true":
                    continue  # context of the line outside this trip
                stops.append(
                    JdStop(
                        name=st.get("name", ""),
                        code=st.get("symbol", ""),
                        departure=_clock(start, st.get("departureTime")),
                        arrival=_clock(start, st.get("arrivalTime")),
                    )
                )
            if not stops:
                continue
            dist = ln.get("distance")
            lines.append(
                JdLine(
                    vehicle=ln.get("vehicleType", "other"),
                    name=ln.get("name", ""),
                    direction=ln.get("direction", ""),
                    distance_m=int(dist) if dist and dist.isdigit() else None,
                    stops=tuple(stops),
                    night="night" in (ln.get("lineType") or "").split(),
                )
            )
        if lines:
            routes.append(JdRoute(start, finish, tuple(lines)))
    return routes


async def search(
    from_lat: float,
    from_lon: float,
    to_lat: float,
    to_lon: float,
    at: datetime,
    arrive_by: bool,
    client: httpx.AsyncClient | None = None,
) -> list[JdRoute]:
    settings = get_settings()
    if not settings.jakdojade_configured:
        raise JakdojadeUnavailable("no partner keys")
    local = at.astimezone(ZONE)
    params = {
        "fc": f"{from_lat:.4f}:{from_lon:.4f}",  # ≈ 10 m: no more precision than needed
        "tc": f"{to_lat:.4f}:{to_lon:.4f}",
        "agg": CITY,
        "d": local.strftime("%d.%m.%y"),
        "h": local.strftime("%H:%M"),
        "ia": "true" if arrive_by else "false",
        "rc": "3",
        "t": "optimal",
        "output": "xml",
    }
    auth = (
        settings.jakdojade_api_key.get_secret_value(),
        settings.jakdojade_api_secret.get_secret_value(),
    )
    own = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(8.0, connect=4.0))
    try:
        r = await client.get(API, params=params, auth=auth)
        if r.status_code != 200:
            raise JakdojadeUnavailable(f"HTTP {r.status_code}")
        routes = parse(r.content)
    except httpx.HTTPError as exc:
        raise JakdojadeUnavailable(type(exc).__name__) from exc
    finally:
        if own:
            await client.aclose()
    # Sample data from an unauthorised request would describe another day: never show it.
    return [rt for rt in routes if abs((rt.start.date() - local.date()).days) <= 1]
