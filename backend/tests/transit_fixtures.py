"""A tiny synthetic GTFS feed for routing tests (test data only, never shown to members).

Around two points H (home) and W (work):
  tram T1  H1 → X → W1, 30 min, every 20 min on weekdays, hourly at weekends;
  bus  B2  H1 → X, 8 min;  bus B3  X2 → W1, 8 min (X2 is a short walk from X);
  night N9 H1 → W1 at 23:50 → 00:20 (after midnight, on the weekday service).
11 November (a public holiday) runs the Sunday service.
"""

from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass


@dataclass(frozen=True)
class Net:
    h: tuple[float, float]
    w: tuple[float, float]

    @property
    def stops(self) -> dict[str, tuple[str, float, float]]:
        (hl, ho), (wl, wo) = self.h, self.w
        xl, xo = (hl + wl) / 2, (ho + wo) / 2
        return {
            "H1": ("Dom Przystanek", hl + 0.0010, ho),
            "X": ("Węzeł", xl, xo),
            "X2": ("Węzeł Bus", xl + 0.0006, xo),
            "W1": ("Praca Przystanek", wl + 0.0010, wo),
        }


def _csv(rows: list[list[object]]) -> str:
    out = io.StringIO()
    csv.writer(out, lineterminator="\n").writerows(rows)
    return out.getvalue()


def hm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}:00"


def build(
    net: Net,
    start: str = "20261026",
    end: str = "20261115",
    holiday: str | None = "20261111",
    broken: bool = False,
) -> bytes:
    trips: list[list[object]] = [["route_id", "service_id", "trip_id", "trip_headsign"]]
    times: list[list[object]] = [
        ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "pickup_type", "drop_off_type"]
    ]  # fmt: skip

    def trip(route: str, service: str, tid: str, head: str, stops: list[tuple[str, int]]) -> None:
        trips.append([route, service, tid, head])
        for seq, (stop, minute) in enumerate(stops):
            last = seq == len(stops) - 1
            times.append(
                [tid, hm(minute), hm(minute), stop, seq, 1 if last else 0, 1 if seq == 0 else 0]
            )

    for i, dep in enumerate(range(7 * 60, 9 * 60, 20)):
        trip("T1", "WD", f"T1-{i}", "Praca", [("H1", dep), ("X", dep + 15), ("W1", dep + 30)])
    for i, dep in enumerate(range(7 * 60 + 5, 9 * 60, 20)):
        trip("B2", "WD", f"B2-{i}", "Węzeł", [("H1", dep), ("X", dep + 8)])
        trip("B3", "WD", f"B3-{i}", "Praca", [("X2", dep + 12), ("W1", dep + 20)])
    for i, dep in enumerate(range(7 * 60, 12 * 60, 60)):
        trip("T1", "WE", f"T1w-{i}", "Praca", [("H1", dep), ("X", dep + 15), ("W1", dep + 30)])
    trip("N9", "WD", "N9-0", "Praca", [("H1", 23 * 60 + 50), ("W1", 24 * 60 + 20)])

    files = {
        "agency.txt": _csv([["agency_id", "agency_name", "agency_url", "agency_timezone"], ["1", "Test", "https://example.test", "Europe/Warsaw"]]),
        "feed_info.txt": _csv([["feed_publisher_name", "feed_publisher_url", "feed_lang", "feed_start_date", "feed_end_date"], ["Test", "https://example.test", "pl", start, end]]),
        "calendar.txt": _csv([
            ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"],
            ["WD", 1, 1, 1, 1, 1, 0, 0, start, end],
            ["WE", 0, 0, 0, 0, 0, 1, 1, start, end],
        ]),
        "calendar_dates.txt": _csv(
            [["service_id", "date", "exception_type"]]
            + ([["WD", holiday, 2], ["WE", holiday, 1]] if holiday else [])
        ),
        "routes.txt": _csv([
            ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type"],
            ["T1", "1", "1", "", 0], ["B2", "1", "102", "", 3], ["B3", "1", "103", "", 3], ["N9", "1", "209", "", 3],
        ]),
        "stops.txt": _csv(
            [["stop_id", "stop_code", "stop_name", "stop_lat", "stop_lon"]]
            + [[sid, f"C{sid}", name, f"{lat:.7f}", f"{lon:.7f}"] for sid, (name, lat, lon) in net.stops.items()]
        ),
        "trips.txt": _csv(trips),
        "stop_times.txt": _csv(times),
        "shapes.txt": "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n",
    }  # fmt: skip
    if broken:
        del files["stop_times.txt"]
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, text in files.items():
            z.writestr(name, text)
    return out.getvalue()
