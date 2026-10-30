"""Product catalogue: idempotent seeding, normalised search with synonyms, name matching."""

from __future__ import annotations

import re
import time
import unicodedata
from dataclasses import dataclass, field

from sqlalchemy import literal, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProductCatalog, ShoppingItem
from app.modules.catalog.data import CATALOG, CATEGORIES

# Polish letters folded so "ogorki" finds "ogórki"; ё → е for Russian.
_FOLD = str.maketrans({"ё": "е", "ł": "l", "Ł": "l"})
# Inflection endings, longest first: "помидоры"/"помидор", "яйца"/"яйцо", "jabłka"/"jabłko".
_ENDINGS = (
    "ами", "ями", "ого", "его", "ой", "ей", "ов", "ев", "ие", "ые", "ая", "яя",
    "ки", "ka", "ki", "ko",
    "ы", "и", "а", "я", "о", "е", "у", "ю", "ь", "й", "a", "e", "i", "o", "y",
)  # fmt: skip


def normalize(text: str) -> str:
    """Lower-case, strip accents and punctuation, collapse spaces."""
    text = unicodedata.normalize("NFKD", text.lower().translate(_FOLD))
    # NFKD also splits "й" into "и" + breve, so "чай"/"чаи" compare equal — harmless here.
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(re.sub(r"[^\w\s]", " ", text).split())


def stem(word: str) -> str:
    if len(word) <= 4:
        return word
    for ending in _ENDINGS:
        if word.endswith(ending) and len(word) - len(ending) >= 3:
            return word[: -len(ending)]
    return word


def _stems(text: str) -> tuple[str, ...]:
    return tuple(stem(w) for w in normalize(text).split())


@dataclass(frozen=True)
class Product:
    id: str
    name: str
    name_pl: str
    category: str
    unit: str | None
    image: str
    synonyms: tuple[str, ...]
    position: int
    keys: tuple[str, ...] = field(default=())  # normalised names and synonyms
    key_stems: tuple[tuple[str, ...], ...] = field(default=())

    @property
    def category_label(self) -> str:
        return CATEGORIES.get(self.category, (self.category, ""))[0]


def _product(row: ProductCatalog) -> Product:
    names = (row.name, row.name_pl, *row.synonyms)
    return Product(
        id=row.id,
        name=row.name,
        name_pl=row.name_pl,
        category=row.category,
        unit=row.unit,
        image=row.image,
        synonyms=tuple(row.synonyms),
        position=row.position,
        keys=tuple(normalize(n) for n in names),
        key_stems=tuple(_stems(n) for n in names),
    )


async def sync_catalog(db: AsyncSession) -> int:
    """Upsert every entry from data.py by id. Safe to run on every start: never duplicates,
    never deletes (shopping items keep their link), only refreshes names and images."""
    for position, e in enumerate(CATALOG):
        values = {
            "name": e.name,
            "name_pl": e.name_pl,
            "category": e.category,
            "unit": e.unit,
            "image": e.image,
            "synonyms": list(e.synonyms),
            "position": position,
        }
        await db.execute(
            insert(ProductCatalog)
            .values(id=e.id, **values)
            .on_conflict_do_update(index_elements=[ProductCatalog.id], set_=values)
        )
    invalidate_cache()
    await refresh_item_pictures(db)
    return len(CATALOG)


async def refresh_item_pictures(db: AsyncSession) -> None:
    """Bring shopping items in line with the catalogue's pictures. An item keeps the picture it
    got when it was added, so after the artwork changes (or a product joins the catalogue) older
    items would show stale or missing pictures. Linked items get their product's current
    picture; unlinked items without a picture are linked when their name clearly is a catalogue
    product; bundled pictures that no longer exist are dropped. External https pictures chosen
    for an item are never touched. Idempotent: a second run changes nothing."""
    bundled = or_(ShoppingItem.image.is_(None), ShoppingItem.image.like("local:%"))
    current = literal("local:") + ProductCatalog.image
    await db.execute(
        update(ShoppingItem)
        .where(ShoppingItem.catalog_id == ProductCatalog.id, bundled)
        .where(or_(ShoppingItem.image.is_(None), ShoppingItem.image != current))
        .values(image=current)
        .execution_options(synchronize_session=False)
    )
    known = {local_image_ref(img) for img in KNOWN_IMAGES}
    stray = (
        await db.execute(select(ShoppingItem).where(ShoppingItem.catalog_id.is_(None), bundled))
    ).scalars()
    for item in stray:
        if item.image in known:
            continue
        product = await match(db, item.name)
        if product is not None:
            item.catalog_id, item.image = product.id, local_image_ref(product.image)
            item.category = item.category or product.category_label
        elif item.image is not None:
            item.image = None  # a picture that is no longer bundled: fall back to the category


# The catalogue is small (~200 rows) and read-mostly: keep it in memory per process.
_CACHE_TTL = 600.0
_cache: tuple[float, tuple[Product, ...]] | None = None


def invalidate_cache() -> None:
    global _cache
    _cache = None


async def products(db: AsyncSession) -> tuple[Product, ...]:
    global _cache
    now = time.monotonic()
    if _cache is not None and now - _cache[0] < _CACHE_TTL:
        return _cache[1]
    rows = (await db.execute(select(ProductCatalog).order_by(ProductCatalog.position))).scalars()
    items = tuple(_product(r) for r in rows)
    if items:  # an empty table (not seeded yet) is not cached
        _cache = (now, items)
    return items


def _score(p: Product, q: str, q_stems: tuple[str, ...]) -> int:
    best = 0
    for key, key_stems in zip(p.keys, p.key_stems, strict=True):
        if key == q or (q_stems and key_stems == q_stems):
            return 100
        if key.startswith(q):
            best = max(best, 80)
        elif any(w.startswith(q) for w in key.split()):
            best = max(best, 70)
        elif q_stems and all(any(k.startswith(s) for k in key_stems) for s in q_stems):
            best = max(best, 60)
        elif len(q) >= 3 and q in key:
            best = max(best, 40)
    return best


async def search(
    db: AsyncSession, query: str, *, category: str | None = None, limit: int = 20
) -> list[Product]:
    """Catalogue products for a typed name: exact name/synonym first, then prefixes."""
    items = await products(db)
    if category:
        items = tuple(p for p in items if p.category == category)
    q = normalize(query)
    if not q:
        return list(items[:limit])
    q_stems = _stems(q)
    scored = [(s, p) for p in items if (s := _score(p, q, q_stems)) > 0]
    scored.sort(key=lambda sp: (-sp[0], sp[1].position))
    return [p for _, p in scored[:limit]]


async def match(db: AsyncSession, name: str) -> Product | None:
    """The single product a free-text item name clearly is (exact name/synonym, any
    inflection), or None — never a guess, so "молоко" links to milk but "молотый" does not."""
    q = normalize(name)
    if not q:
        return None
    q_stems = _stems(q)
    for p in await products(db):
        if _score(p, q, q_stems) == 100:
            return p
    return None


async def get_product(db: AsyncSession, product_id: str) -> Product | None:
    return next((p for p in await products(db) if p.id == product_id), None)


def local_image_ref(code: str) -> str:
    return f"local:{code}"


KNOWN_IMAGES = frozenset({e.image for e in CATALOG} | {img for _, img in CATEGORIES.values()})
