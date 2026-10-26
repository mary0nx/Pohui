"""Address search over Wrocław's official address register, entirely on our server.

The register (EMUiA, see scripts/build_addresses.py) ships with the app, so what a member types
never leaves Family OS: no geocoding service sees it. Search is accent- and case-insensitive,
understands "ul." / "al." / "pl." and a house number anywhere in the query.
"""

from __future__ import annotations

import gzip
import json
import re
import threading
import unicodedata
from array import array
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DATA = Path(__file__).resolve().parent / "data" / "wroclaw_addresses.json.gz"
PREFIXES = {
    "ul", "ulica", "al", "aleja", "aleje", "pl", "plac", "os", "osiedle", "rondo", "most",
    "bulwar", "skwer", "wybrzeze", "gen", "ks", "sw", "bp", "kard", "prof", "im",
}  # fmt: skip
NUMBER = re.compile(r"^\d+[a-z]?(?:/\d+[a-z]?)?$")


def fold(text: str) -> str:
    """Lower case without Polish accents: "Łąkowa" → "lakowa"."""
    text = text.lower().replace("ł", "l")
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


def words(text: str) -> list[str]:
    return [w for w in re.split(r"[^0-9a-z]+", fold(text)) if w]


@dataclass(frozen=True)
class Address:
    id: str  # "a<index>": stable within one register version
    street: str
    number: str
    postcode: str
    estate: str
    lat: float
    lon: float

    @property
    def label(self) -> str:
        return f"{self.street} {self.number}"


@dataclass(frozen=True)
class StreetHit:
    street: str
    count: int  # how many numbered addresses it has


class AddressIndex:
    def __init__(self, data: dict) -> None:
        self.version: str = data["version"]
        self.source: str = data["source"]
        self.streets: list[str] = [s[0] for s in data["streets"]]
        self._street_words = [words(s[0]) for s in data["streets"]]
        self._main = [fold(s[1]) for s in data["streets"]]
        self.estates: list[str] = data["estates"]
        pts = data["points"]
        self._street = array("i", (p[0] for p in pts))
        self._number = [p[1] for p in pts]
        self._postcode = [p[2] for p in pts]
        self._lat = array("i", (p[3] for p in pts))
        self._lon = array("i", (p[4] for p in pts))
        self._estate = array("H", (p[5] for p in pts))
        self._by_street: dict[int, list[int]] = {}
        for i, s in enumerate(self._street):
            self._by_street.setdefault(s, []).append(i)

    def __len__(self) -> int:
        return len(self._number)

    def get(self, address_id: str) -> Address | None:
        if not re.fullmatch(r"a\d{1,7}", address_id):
            return None
        i = int(address_id[1:])
        return self._address(i) if 0 <= i < len(self) else None

    def _address(self, i: int) -> Address:
        return Address(
            id=f"a{i}",
            street=self.streets[self._street[i]],
            number=self._number[i],
            postcode=self._postcode[i],
            estate=self.estates[self._estate[i]],
            lat=self._lat[i] / 1e6,
            lon=self._lon[i] / 1e6,
        )

    def _match_streets(self, tokens: list[str]) -> list[int]:
        """Streets whose words start with every query word, best first."""
        if not tokens:
            return []
        hits = []
        for s, sw in enumerate(self._street_words):
            if all(any(w.startswith(t) for w in sw) for t in tokens):
                main = self._main[s]
                # Exact main name first, then the main name starting with the query, then others.
                joined = " ".join(tokens)
                rank = 0 if main == joined else 1 if main.startswith(tokens[0]) else 2
                hits.append((rank, len(self.streets[s]), s))
        hits.sort()
        return [s for _, _, s in hits]

    def search(self, query: str, limit: int = 8) -> tuple[list[Address], list[StreetHit]]:
        tokens = [t for t in words(query) if t not in PREFIXES] or words(query)
        number: str | None = None
        streets: list[int] = []
        # The house number is usually last ("Legnicka 58"), sometimes first ("58 Legnicka");
        # a number can also belong to the name ("3 Maja", "11 Listopada").
        tries: list[tuple[str | None, list[str]]] = []
        if len(tokens) > 1 and NUMBER.match(tokens[-1]):
            tries.append((tokens[-1], tokens[:-1]))
        tries.append((None, tokens))
        if len(tokens) > 1 and NUMBER.match(tokens[0]):
            tries.append((tokens[0], tokens[1:]))
        for num, street_tokens in tries:
            streets = self._match_streets(street_tokens)
            if streets:
                number = num
                break
        if number is None:
            hits = [StreetHit(self.streets[s], len(self._by_street.get(s, ()))) for s in streets]
            return [], [h for h in hits if h.count][:limit]
        found: list[tuple[int, int]] = []
        for rank_s, s in enumerate(streets[:20]):
            for i in self._by_street.get(s, ()):
                num = self._number[i].lower()
                if num == number:
                    found.append((rank_s * 2, i))
                elif num.startswith(number):
                    found.append((rank_s * 2 + 1, i))
        found.sort()
        if not found:  # no such house number: offer the street so the member can correct it
            return [], [
                StreetHit(self.streets[s], len(self._by_street[s])) for s in streets[:limit]
            ]
        return [self._address(i) for _, i in found[:limit]], []

    def nearest(self, lat: float, lon: float) -> Address | None:
        """The address point closest to a position (within ~150 m), for a stop or a pin."""
        la, lo = round(lat * 1e6), round(lon * 1e6)
        best, best_d = -1, 1500**2 * 2  # in micro-degrees², ≈ 150 m
        for i in range(len(self)):
            dy = self._lat[i] - la
            if dy > 1500 or dy < -1500:
                continue
            dx = (self._lon[i] - lo) * 0.63  # cos(51°)
            d = dy * dy + dx * dx
            if d < best_d:
                best, best_d = i, d
        return self._address(best) if best >= 0 else None


_lock = threading.Lock()


@lru_cache(maxsize=1)
def _load(path: str) -> AddressIndex:
    with _lock:
        return AddressIndex(json.loads(gzip.decompress(Path(path).read_bytes())))


def get_index() -> AddressIndex:
    return _load(str(DATA))
