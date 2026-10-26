"""Distances and walking times, plus the Polish CS2000 grid used by Wrocław's address register.

Walking time is an estimate: straight-line distance × a detour factor at an unhurried pace.
It is always shown as approximate ("≈"), never as a measured street route.
"""

from __future__ import annotations

import math

EARTH_R = 6_371_008.8
WALK_SPEED = 1.25  # m/s ≈ 4.5 km/h
DETOUR = 1.3  # streets are rarely a straight line


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_R * math.asin(min(1.0, math.sqrt(a)))


def walk_metres(straight_m: float) -> int:
    return round(straight_m * DETOUR)


def walk_seconds(straight_m: float) -> int:
    """Walking time for a straight-line distance, rounded up to whole minutes."""
    return math.ceil(walk_metres(straight_m) / WALK_SPEED / 60) * 60


# GRS80 ellipsoid (ETRF2000-PL, equal to WGS 84 within centimetres).
_A = 6378137.0
_F = 1 / 298.257222101


def cs2000_to_wgs84(easting: float, northing: float, zone: int = 6) -> tuple[float, float]:
    """EPSG:2176–2179 (PL-2000, zones 5–8) grid → (latitude, longitude) in degrees.

    Inverse transverse Mercator (Krüger series to n³, sub-millimetre at city scale).
    Wrocław lies in zone 6: central meridian 18°E, scale 0.999923, false easting 6 500 000 m.
    """
    lon0 = {5: 15.0, 6: 18.0, 7: 21.0, 8: 24.0}[zone]
    k0 = 0.999923
    fe = zone * 1_000_000 + 500_000
    n = _F / (2 - _F)
    a_r = _A / (1 + n) * (1 + n**2 / 4 + n**4 / 64)
    b = (n / 2 - 2 * n**2 / 3 + 37 * n**3 / 96, n**2 / 48 + n**3 / 15, 17 * n**3 / 480)
    xi = northing / (k0 * a_r)
    eta = (easting - fe) / (k0 * a_r)
    xp = xi - sum(bj * math.sin(2 * j * xi) * math.cosh(2 * j * eta) for j, bj in enumerate(b, 1))
    ep = eta - sum(bj * math.cos(2 * j * xi) * math.sinh(2 * j * eta) for j, bj in enumerate(b, 1))
    chi = math.asin(math.sin(xp) / math.cosh(ep))
    d = (2 * n - 2 * n**2 / 3 - 2 * n**3, 7 * n**2 / 3 - 8 * n**3 / 5, 56 * n**3 / 15)
    phi = chi + sum(dj * math.sin(2 * j * chi) for j, dj in enumerate(d, 1))
    lam = math.radians(lon0) + math.atan2(math.sinh(ep), math.cos(xp))
    return math.degrees(phi), math.degrees(lam)
