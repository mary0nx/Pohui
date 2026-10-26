"""Builds app/modules/transit/data/wroclaw_addresses.json.gz from Wrocław's address register.

    python scripts/build_addresses.py <gml_EMUiA_wroclaw_wersja_pelna.zip> [Adresy.zip]

Source: Ewidencja miejscowości, ulic i adresów (EMUiA), Urząd Miejski Wrocławia,
https://geoportal.wroclaw.pl/zasoby/?zasob=emuia — "Warunki wykorzystania: brak ograniczeń".
The GML holds every address point with its position (EPSG:2177); the optional Adresy.zip
(XLSX) adds the estate (osiedle) of each address. The output keeps street names, house numbers,
postcodes, estates and WGS 84 positions — nothing else.
"""

from __future__ import annotations

import gzip
import io
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.modules.transit.geo import cs2000_to_wgs84

MUA = "{urn:gugik:specyfikacje:gmlas:ewidencjaMiejscowosciUlicAdresow:1.0}"
GML = "{http://www.opengis.net/gml/3.2}"
BT = "{urn:gugik:specyfikacje:gmlas:modelPodstawowy:1.0}"
XLINK = "{http://www.w3.org/1999/xlink}href"
OUT = Path(__file__).resolve().parent.parent / "app/modules/transit/data/wroclaw_addresses.json.gz"


def street_name(el: ET.Element) -> tuple[str, str]:
    """("ul. Wisławy Szymborskiej", "Szymborskiej") from an AD_NazwaUlicy."""
    parts = [
        el.findtext(MUA + "przedrostek1Czesc"),
        el.findtext(MUA + "przedrostek2Czesc"),
        el.findtext(MUA + "nazwaCzesc"),
        el.findtext(MUA + "nazwaGlownaCzesc"),
    ]
    main = (parts[3] or "").strip()
    prefix = (parts[0] or "").strip()
    if prefix.isupper() and len(prefix) > 1:
        prefix = prefix.lower()
    full = " ".join(p.strip() for p in [prefix, *parts[1:]] if p and p.strip())
    return full, main


def estates(xlsx_zip: Path) -> dict[str, str]:
    import openpyxl  # only needed here, not by the app

    with zipfile.ZipFile(xlsx_zip) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".xlsx"))
        wb = openpyxl.load_workbook(io.BytesIO(z.read(name)), read_only=True)
    rows = wb.worksheets[0].iter_rows(values_only=True)
    head = [str(h) for h in next(rows)]
    i_id, i_os = head.index("LOKALNYID"), head.index("RMWROC_OSIEDLE")
    return {str(r[i_id]): str(r[i_os] or "") for r in rows if r[i_id]}


def main() -> None:
    gml_zip = Path(sys.argv[1])
    estate_of = estates(Path(sys.argv[2])) if len(sys.argv) > 2 else {}
    streets: dict[str, int] = {}
    street_rows: list[list[str]] = []
    street_ref: dict[str, tuple[str, str]] = {}
    points: list[tuple[str, str, str, float, float, str]] = []
    with zipfile.ZipFile(gml_zip) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".xml"))
        stamp = z.getinfo(name).date_time
        with z.open(name) as f:
            # The city's own register file, downloaded by the maintainer: trusted input.
            for _, el in ET.iterparse(f, events=("end",)):  # noqa: S314
                if el.tag == MUA + "AD_Ulica":
                    nm = el.find(f"{MUA}nazwa/{MUA}AD_NazwaUlicy")
                    if nm is not None:
                        street_ref["_" + el.get(GML + "id", "").lstrip("_")] = street_name(nm)
                    el.clear()
                elif el.tag == MUA + "AD_PunktAdresowy":
                    pos = el.find(f"{MUA}pozycja/{GML}Point/{GML}pos")
                    ul = el.find(MUA + "ulica2")
                    num = (el.findtext(MUA + "numerPorzadkowy") or "").strip()
                    local = el.findtext(f"{MUA}idIIP/{BT}BT_Identyfikator/{BT}lokalnyId") or ""
                    if pos is not None and pos.text and ul is not None and num:
                        e, n = map(float, pos.text.split()[:2])
                        lat, lon = cs2000_to_wgs84(e, n)
                        points.append(
                            (
                                ul.get(XLINK, ""),
                                num,
                                (el.findtext(MUA + "kodPocztowy") or "").strip(),
                                lat,
                                lon,
                                estate_of.get(local, ""),
                            )
                        )
                    el.clear()
    estate_index: dict[str, int] = {"": 0}
    out_points = []
    for ref, num, postcode, lat, lon, estate in points:
        sname = street_ref.get(ref)
        if sname is None or not sname[1]:
            continue
        if sname not in streets:
            streets[sname] = len(street_rows)  # type: ignore[index]
            street_rows.append(list(sname))
        if estate not in estate_index:
            estate_index[estate] = len(estate_index)
        out_points.append(
            [
                streets[sname],  # type: ignore[index]
                num,
                postcode,
                round(lat * 1e6),
                round(lon * 1e6),
                estate_index[estate],
            ]
        )
    out_points.sort(key=lambda p: (street_rows[p[0]][1], _num_key(p[1])))
    data = {
        "source": "EMUiA, Urząd Miejski Wrocławia (geoportal.wroclaw.pl), brak ograniczeń",
        "version": f"{stamp[0]:04d}-{stamp[1]:02d}-{stamp[2]:02d}",
        "streets": street_rows,
        "estates": [e for e, _ in sorted(estate_index.items(), key=lambda x: x[1])],
        "points": out_points,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
    OUT.write_bytes(gzip.compress(raw, 9, mtime=0))
    print(
        f"{len(out_points)} addresses, {len(street_rows)} streets → {OUT} ({OUT.stat().st_size} B)"
    )


def _num_key(num: str) -> tuple[int, str]:
    m = re.match(r"\d+", num)
    return (int(m.group()) if m else 0, num)


if __name__ == "__main__":
    main()
