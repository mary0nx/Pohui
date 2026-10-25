"""«Листочек дня»: the user's saved phrases. The daily pages themselves are static content
chosen on the client (the same page for the whole family on a date); only favourites are
stored, per user."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from fastapi import APIRouter, Path
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert

from app.api.deps import DB, CurrentUser
from app.core.errors import Conflict
from app.models import DailyFavorite

router = APIRouter(tags=["daily"])

MAX_FAVORITES = 500
PhraseId = Annotated[str, Path(pattern=r"^[a-z]{3,12}-\d{1,4}$")]


class FavoriteIn(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    day: date


class FavoriteOut(BaseModel):
    phrase_id: str
    text: str
    day: date
    created_at: datetime


@router.get("/me/daily-favorites", response_model=list[FavoriteOut])
async def list_favorites(user: CurrentUser, db: DB) -> list[DailyFavorite]:
    rows = await db.execute(
        select(DailyFavorite)
        .where(DailyFavorite.user_id == user.id)
        .order_by(DailyFavorite.created_at.desc(), DailyFavorite.phrase_id)
    )
    return list(rows.scalars())


@router.put("/me/daily-favorites/{phrase_id}", response_model=FavoriteOut)
async def save_favorite(
    phrase_id: PhraseId, body: FavoriteIn, user: CurrentUser, db: DB
) -> DailyFavorite:
    count = await db.scalar(
        select(func.count()).select_from(DailyFavorite).where(DailyFavorite.user_id == user.id)
    )
    exists = await db.scalar(
        select(DailyFavorite.id).where(
            DailyFavorite.user_id == user.id, DailyFavorite.phrase_id == phrase_id
        )
    )
    if exists is None and (count or 0) >= MAX_FAVORITES:
        raise Conflict(f"В избранном уже {MAX_FAVORITES} фраз — удалите ненужные")
    # Idempotent: saving the same phrase twice keeps one entry.
    await db.execute(
        insert(DailyFavorite)
        .values(user_id=user.id, phrase_id=phrase_id, text=body.text.strip(), day=body.day)
        .on_conflict_do_nothing(index_elements=[DailyFavorite.user_id, DailyFavorite.phrase_id])
    )
    await db.commit()
    fav = await db.scalar(
        select(DailyFavorite).where(
            DailyFavorite.user_id == user.id, DailyFavorite.phrase_id == phrase_id
        )
    )
    assert fav is not None
    return fav


@router.delete("/me/daily-favorites/{phrase_id}", status_code=204)
async def delete_favorite(phrase_id: PhraseId, user: CurrentUser, db: DB) -> None:
    await db.execute(
        delete(DailyFavorite).where(
            DailyFavorite.user_id == user.id, DailyFavorite.phrase_id == phrase_id
        )
    )
    await db.commit()
