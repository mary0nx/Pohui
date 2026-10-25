"""Product catalogue for shopping lists. Shared (not family data), but only for logged-in
family members, like the rest of /families/{family_id}."""

from __future__ import annotations

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import DB, Ctx
from app.modules.catalog import service
from app.modules.catalog.data import CATEGORIES
from app.modules.catalog.images import CachedImageSearch, external_source

router = APIRouter(prefix="/families/{family_id}/catalog", tags=["catalog"])


class CatalogItemOut(BaseModel):
    id: str
    name: str
    name_pl: str
    category: str
    category_label: str
    unit: str | None
    image: str  # "local:<code>" → /products/<code>.svg in the frontend


class CatalogCategoryOut(BaseModel):
    key: str
    label: str
    image: str
    count: int


class ExternalImageOut(BaseModel):
    url: str
    title: str


class CatalogSearchOut(BaseModel):
    items: list[CatalogItemOut]
    external: list[ExternalImageOut] = []
    external_enabled: bool


def _out(p: service.Product) -> CatalogItemOut:
    return CatalogItemOut(
        id=p.id,
        name=p.name,
        name_pl=p.name_pl,
        category=p.category,
        category_label=p.category_label,
        unit=p.unit,
        image=service.local_image_ref(p.image),
    )


_external: CachedImageSearch | None = None


def _external_search() -> CachedImageSearch | None:
    global _external
    source = external_source()
    if source is None:
        return None
    if _external is None or _external.source is not source:
        _external = CachedImageSearch(source)
    return _external


@router.get("", response_model=CatalogSearchOut)
async def search(
    ctx: Ctx,
    db: DB,
    q: str = Query("", max_length=100),
    category: str | None = Query(None, max_length=32),
    limit: int = Query(30, ge=1, le=250),
) -> CatalogSearchOut:
    found = await service.search(db, q, category=category, limit=limit)
    external = _external_search()
    candidates = []
    # Only new products go outside: a catalogue match already has a licensed thumbnail.
    if external is not None and q.strip() and not found:
        candidates = await external.search(str(ctx.family_id), q)
    return CatalogSearchOut(
        items=[_out(p) for p in found],
        external=[ExternalImageOut(url=c.url, title=c.title) for c in candidates],
        external_enabled=external is not None,
    )


@router.get("/categories", response_model=list[CatalogCategoryOut])
async def categories(ctx: Ctx, db: DB) -> list[CatalogCategoryOut]:
    counts: dict[str, int] = {}
    for p in await service.products(db):
        counts[p.category] = counts.get(p.category, 0) + 1
    return [
        CatalogCategoryOut(
            key=key, label=label, image=service.local_image_ref(image), count=counts.get(key, 0)
        )
        for key, (label, image) in CATEGORIES.items()
    ]
