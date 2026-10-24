"""Parsing of free text into shopping items: "молоко 2 л, хлеб\nяйца 10 шт"."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

from app.modules.shopping.schemas import ItemCreate

UNITS = {
    "шт": "шт", "штук": "шт", "штуки": "шт", "pcs": "шт", "szt": "шт",
    "кг": "кг", "kg": "кг", "г": "г", "гр": "г", "g": "г",
    "л": "л", "l": "л", "мл": "мл", "ml": "мл",
    "уп": "уп", "упак": "уп", "пачка": "уп", "пачки": "уп", "бут": "бут",
}
_QTY = re.compile(r"(?P<qty>\d+(?:[.,]\d+)?)\s*(?P<unit>[a-zA-Zа-яА-ЯёЁ]+\.?)?$")
_QTY_PREFIX = re.compile(r"^(?P<qty>\d+(?:[.,]\d+)?)\s*(?P<unit>[a-zA-Zа-яА-ЯёЁ]+\.?)?\s+(?P<name>.+)$")
_BULLET = re.compile(r"^\s*(?:[-*•–]|\d+[.)])\s*")


def _qty(raw: str) -> Decimal | None:
    try:
        value = Decimal(raw.replace(",", "."))
    except InvalidOperation:
        return None
    return value if 0 < value < 100000 else None


def parse_items(text: str, limit: int = 100) -> list[ItemCreate]:
    parts: list[str] = []
    for line in text.splitlines():
        line = _BULLET.sub("", line)
        # Split on commas/semicolons unless the comma is a decimal separator ("1,5 кг").
        parts.extend(re.split(r"[;]|,(?!\d)|\s+(?:и|and|i)\s+", line))
    items: list[ItemCreate] = []
    for raw in parts:
        chunk = raw.strip().strip(".").strip()
        if not chunk:
            continue
        name, qty, unit = chunk, None, None
        m = _QTY.search(chunk)
        if m and m.start() > 0:
            candidate_unit = (m.group("unit") or "").rstrip(".").lower()
            if not candidate_unit or candidate_unit in UNITS:
                name = chunk[: m.start()].strip(" -:x×")
                qty = _qty(m.group("qty"))
                unit = UNITS.get(candidate_unit) if candidate_unit else None
        else:
            m2 = _QTY_PREFIX.match(chunk)
            if m2:
                candidate_unit = (m2.group("unit") or "").rstrip(".").lower()
                if not candidate_unit or candidate_unit in UNITS:
                    name = m2.group("name").strip()
                    qty = _qty(m2.group("qty"))
                    unit = UNITS.get(candidate_unit) if candidate_unit else None
        name = name[:200].strip()
        if name:
            items.append(ItemCreate(name=name[0].upper() + name[1:], quantity=qty, unit=unit))
        if len(items) >= limit:
            break
    return items
