from __future__ import annotations

import uuid
from datetime import date, timedelta

from fastapi import APIRouter

from app.api.deps import DB, Ctx
from app.core.time import local_today
from app.models import Recipe
from app.modules.kitchen import service
from app.modules.kitchen.schemas import (
    MealEntryIn,
    MealEntryOut,
    PantryAdjust,
    PantryCreate,
    PantryOut,
    PantryPatch,
    RecipeCreate,
    RecipeOut,
    RecipePatch,
    ShoppingFromPlan,
    ShoppingFromPlanOut,
)
from app.security.access import get_visible

router = APIRouter(prefix="/families/{family_id}/kitchen", tags=["kitchen"])


@router.get("/pantry", response_model=list[PantryOut])
async def pantry(ctx: Ctx, db: DB) -> list[PantryOut]:
    return await service.list_pantry(db, ctx)


@router.post("/pantry", response_model=PantryOut, status_code=201)
async def add_pantry(body: PantryCreate, ctx: Ctx, db: DB) -> PantryOut:
    item = await service.create_pantry(db, ctx, body)
    out = service.pantry_out(item, local_today(ctx.family.timezone))
    await db.commit()
    return out


@router.patch("/pantry/{item_id}", response_model=PantryOut)
async def patch_pantry(item_id: uuid.UUID, body: PantryPatch, ctx: Ctx, db: DB) -> PantryOut:
    item = await service.update_pantry(db, ctx, item_id, body)
    out = service.pantry_out(item, local_today(ctx.family.timezone))
    await db.commit()
    return out


@router.post("/pantry/{item_id}/adjust", response_model=PantryOut)
async def adjust_pantry(item_id: uuid.UUID, body: PantryAdjust, ctx: Ctx, db: DB) -> PantryOut:
    item = await service.adjust_pantry(db, ctx, item_id, body)
    out = service.pantry_out(item, local_today(ctx.family.timezone))
    await db.commit()
    return out


@router.delete("/pantry/{item_id}", status_code=204)
async def delete_pantry(item_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_pantry(db, ctx, item_id)
    await db.commit()


@router.get("/recipes", response_model=list[RecipeOut])
async def recipes(ctx: Ctx, db: DB, q: str | None = None) -> list[RecipeOut]:
    return await service.list_recipes(db, ctx, q)


@router.post("/recipes", response_model=RecipeOut, status_code=201)
async def create_recipe(body: RecipeCreate, ctx: Ctx, db: DB) -> RecipeOut:
    recipe = await service.create_recipe(db, ctx, body)
    await db.commit()
    return await service.recipe_out(db, recipe)


@router.get("/recipes/{recipe_id}", response_model=RecipeOut)
async def get_recipe(recipe_id: uuid.UUID, ctx: Ctx, db: DB) -> RecipeOut:
    return await service.recipe_out(db, await get_visible(db, Recipe, recipe_id, ctx))


@router.patch("/recipes/{recipe_id}", response_model=RecipeOut)
async def patch_recipe(recipe_id: uuid.UUID, body: RecipePatch, ctx: Ctx, db: DB) -> RecipeOut:
    recipe = await service.update_recipe(db, ctx, recipe_id, body)
    await db.commit()
    return await service.recipe_out(db, recipe)


@router.delete("/recipes/{recipe_id}", status_code=204)
async def delete_recipe(recipe_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_recipe(db, ctx, recipe_id)
    await db.commit()


@router.get("/meal-plan", response_model=list[MealEntryOut])
async def meal_plan(
    ctx: Ctx, db: DB, date_from: date | None = None, date_to: date | None = None
) -> list[MealEntryOut]:
    start = date_from or local_today(ctx.family.timezone)
    end = date_to or start + timedelta(days=6)
    return [MealEntryOut.model_validate(e) for e in await service.list_plan(db, ctx, start, end)]


@router.put("/meal-plan", response_model=MealEntryOut)
async def set_meal(body: MealEntryIn, ctx: Ctx, db: DB) -> MealEntryOut:
    entry = await service.set_plan_entry(db, ctx, body)
    out = MealEntryOut.model_validate(entry)
    await db.commit()
    return out


@router.delete("/meal-plan/{entry_id}", status_code=204)
async def delete_meal(entry_id: uuid.UUID, ctx: Ctx, db: DB) -> None:
    await service.delete_plan_entry(db, ctx, entry_id)
    await db.commit()


@router.post("/meal-plan/shopping-list", response_model=ShoppingFromPlanOut)
async def plan_to_shopping(body: ShoppingFromPlan, ctx: Ctx, db: DB) -> ShoppingFromPlanOut:
    out = await service.shopping_from_plan(db, ctx, body)
    await db.commit()
    return out
