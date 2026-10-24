"""Pantry, recipes, weekly meal plan and shopping-list generation from the plan.

Pantry quantities only change by explicit user actions (or a confirmed AI proposal);
generating a shopping list never deducts stock.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.errors import NotFound, ValidationFailed
from app.core.time import local_today
from app.models import MealPlanEntry, PantryItem, Recipe, RecipeIngredient
from app.models.enums import Visibility
from app.modules.kitchen.schemas import (
    IngredientOut,
    MealEntryIn,
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
from app.modules.shopping import service as shopping
from app.modules.shopping.schemas import ItemCreate
from app.security.access import FamilyContext, ensure_can_delete, get_visible, visible

EXPIRING_DAYS = 3


def pantry_out(item: PantryItem, today: date) -> PantryOut:
    out = PantryOut.model_validate(item)
    if item.expires_on:
        out.expired = item.expires_on < today
        out.expiring_soon = not out.expired and item.expires_on <= today + timedelta(
            days=EXPIRING_DAYS
        )
    return out


async def list_pantry(db: AsyncSession, ctx: FamilyContext) -> list[PantryOut]:
    today = local_today(ctx.family.timezone)
    rows = (
        await db.execute(
            select(PantryItem)
            .where(PantryItem.family_id == ctx.family_id)
            .order_by(PantryItem.expires_on.nulls_last(), PantryItem.name)
        )
    ).scalars()
    return [pantry_out(i, today) for i in rows]


async def create_pantry(db: AsyncSession, ctx: FamilyContext, data: PantryCreate) -> PantryItem:
    item = PantryItem(family_id=ctx.family_id, created_by=ctx.user_id, **data.model_dump())
    db.add(item)
    await db.flush()
    audit(db, ctx, "pantry.add", "pantry_item", item.id, item.name)
    return item


async def update_pantry(
    db: AsyncSession, ctx: FamilyContext, item_id: uuid.UUID, data: PantryPatch
) -> PantryItem:
    item = await get_visible(db, PantryItem, item_id, ctx, lock=True)
    for field in data.model_fields_set:
        setattr(item, field, getattr(data, field))
    await db.flush()
    return item


async def adjust_pantry(
    db: AsyncSession, ctx: FamilyContext, item_id: uuid.UUID, data: PantryAdjust
) -> PantryItem:
    item = await get_visible(db, PantryItem, item_id, ctx, lock=True)
    new = (item.quantity or Decimal("0")) + data.delta
    if new < 0:
        raise ValidationFailed("Количество не может быть отрицательным")
    item.quantity = new
    audit(db, ctx, "pantry.adjust", "pantry_item", item.id, f"{item.name}: {data.delta:+}")
    await db.flush()
    return item


async def delete_pantry(db: AsyncSession, ctx: FamilyContext, item_id: uuid.UUID) -> None:
    item = await get_visible(db, PantryItem, item_id, ctx)
    audit(db, ctx, "pantry.delete", "pantry_item", item.id, item.name)
    await db.delete(item)


async def recipe_out(db: AsyncSession, recipe: Recipe) -> RecipeOut:
    out = RecipeOut.model_validate(recipe)
    rows = (
        await db.execute(
            select(RecipeIngredient)
            .where(RecipeIngredient.recipe_id == recipe.id)
            .order_by(RecipeIngredient.position)
        )
    ).scalars()
    out.ingredients = [
        IngredientOut(id=r.id, name=r.name, quantity=r.quantity, unit=r.unit) for r in rows
    ]
    return out


async def list_recipes(
    db: AsyncSession, ctx: FamilyContext, q: str | None = None
) -> list[RecipeOut]:
    stmt = select(Recipe).where(visible(Recipe, ctx))
    if q:
        stmt = stmt.where(Recipe.title.ilike(f"%{q.replace('%', '')}%"))
    rows = (await db.execute(stmt.order_by(Recipe.title))).scalars().all()
    return [await recipe_out(db, r) for r in rows]


def _set_ingredients(db: AsyncSession, recipe_id: uuid.UUID, ingredients: list) -> None:  # type: ignore[type-arg]
    for pos, ing in enumerate(ingredients):
        db.add(
            RecipeIngredient(
                recipe_id=recipe_id,
                name=ing.name.strip(),
                quantity=ing.quantity,
                unit=ing.unit,
                position=pos,
            )
        )


async def create_recipe(
    db: AsyncSession, ctx: FamilyContext, data: RecipeCreate, source: str = "manual"
) -> Recipe:
    recipe = Recipe(
        family_id=ctx.family_id,
        title=data.title,
        description=data.description,
        instructions=data.instructions,
        servings=data.servings,
        prep_minutes=data.prep_minutes,
        tags=[t.strip()[:32] for t in data.tags if t.strip()],
        source=source,
        visibility=data.visibility,
        created_by=ctx.user_id,
    )
    db.add(recipe)
    await db.flush()
    _set_ingredients(db, recipe.id, data.ingredients)
    audit(db, ctx, "recipe.create", "recipe", recipe.id, recipe.title, obj=recipe)
    await db.flush()
    return recipe


async def update_recipe(
    db: AsyncSession, ctx: FamilyContext, recipe_id: uuid.UUID, data: RecipePatch
) -> Recipe:
    recipe = await get_visible(db, Recipe, recipe_id, ctx, lock=True)
    for field in ("title", "description", "instructions", "servings", "prep_minutes", "tags"):
        if field in data.model_fields_set and getattr(data, field) is not None:
            setattr(recipe, field, getattr(data, field))
    if data.ingredients is not None:
        await db.execute(delete(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))
        _set_ingredients(db, recipe.id, data.ingredients)
    await db.flush()
    return recipe


async def delete_recipe(db: AsyncSession, ctx: FamilyContext, recipe_id: uuid.UUID) -> None:
    recipe = await get_visible(db, Recipe, recipe_id, ctx)
    ensure_can_delete(recipe, ctx)
    await db.delete(recipe)


async def list_plan(
    db: AsyncSession, ctx: FamilyContext, date_from: date, date_to: date
) -> list[MealPlanEntry]:
    return list(
        (
            await db.execute(
                select(MealPlanEntry)
                .where(
                    MealPlanEntry.family_id == ctx.family_id,
                    MealPlanEntry.day >= date_from,
                    MealPlanEntry.day <= date_to,
                )
                .order_by(MealPlanEntry.day, MealPlanEntry.meal_type)
            )
        ).scalars()
    )


async def set_plan_entry(db: AsyncSession, ctx: FamilyContext, data: MealEntryIn) -> MealPlanEntry:
    title = data.title
    if data.recipe_id is not None:
        recipe = await get_visible(db, Recipe, data.recipe_id, ctx)
        if recipe.visibility == Visibility.private:
            raise ValidationFailed("Личный рецепт нельзя добавить в общее меню семьи")
        title = title or recipe.title
    if not title:
        raise ValidationFailed("Укажите блюдо или рецепт")
    stmt = (
        insert(MealPlanEntry)
        .values(
            id=uuid.uuid4(),
            family_id=ctx.family_id,
            day=data.day,
            meal_type=data.meal_type,
            title=title,
            recipe_id=data.recipe_id,
            servings=data.servings,
            created_by=ctx.user_id,
        )
        .on_conflict_do_update(
            index_elements=["family_id", "day", "meal_type"],
            set_={"title": title, "recipe_id": data.recipe_id, "servings": data.servings},
        )
        .returning(MealPlanEntry.id)
    )
    entry_id = (await db.execute(stmt)).scalar_one()
    entry = await db.get(MealPlanEntry, entry_id, populate_existing=True)
    assert entry is not None
    return entry


async def delete_plan_entry(db: AsyncSession, ctx: FamilyContext, entry_id: uuid.UUID) -> None:
    res = await db.execute(
        delete(MealPlanEntry).where(
            MealPlanEntry.id == entry_id, MealPlanEntry.family_id == ctx.family_id
        )
    )
    if not res.rowcount:  # type: ignore[attr-defined]
        raise NotFound()


def _key(name: str, unit: str | None) -> tuple[str, str]:
    return name.strip().lower(), (unit or "").strip().lower()


async def shopping_from_plan(
    db: AsyncSession, ctx: FamilyContext, data: ShoppingFromPlan
) -> ShoppingFromPlanOut:
    if data.date_to < data.date_from or (data.date_to - data.date_from).days > 31:
        raise ValidationFailed("Период до 31 дня")
    entries = await list_plan(db, ctx, data.date_from, data.date_to)
    need: dict[tuple[str, str], tuple[str, Decimal | None, str | None]] = {}
    totals: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    for e in entries:
        if e.recipe_id is None:
            continue
        recipe = await db.scalar(
            select(Recipe).where(Recipe.id == e.recipe_id, visible(Recipe, ctx))
        )
        if recipe is None:
            continue
        factor = Decimal(e.servings) / Decimal(recipe.servings or 1)
        for ing in (
            await db.execute(
                select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)
            )
        ).scalars():
            k = _key(ing.name, ing.unit)
            need.setdefault(k, (ing.name, None, ing.unit))
            if ing.quantity is not None:
                totals[k] += Decimal(ing.quantity) * factor
    covered: list[str] = []
    if data.subtract_pantry:
        for p in (
            await db.execute(select(PantryItem).where(PantryItem.family_id == ctx.family_id))
        ).scalars():
            k = _key(p.name, p.unit)
            if k not in need:
                continue
            if k in totals and p.quantity is not None:
                totals[k] -= Decimal(p.quantity)
                if totals[k] <= 0:
                    covered.append(need.pop(k)[0])
                    totals.pop(k)
            elif k not in totals and (p.quantity is None or p.quantity > 0):
                covered.append(need.pop(k)[0])
    lst = (
        await shopping.get_list(db, ctx, data.list_id)
        if data.list_id
        else await shopping.default_list(db, ctx)
    )
    items = [
        ItemCreate(
            name=name[0].upper() + name[1:],
            quantity=totals[k].quantize(Decimal("0.001"))
            if k in totals and totals[k] > 0
            else None,
            unit=unit,
            category="Из меню",
        )
        for k, (name, _, unit) in need.items()
    ]
    added = await shopping.add_items(db, ctx, lst.id, items) if items else []
    return ShoppingFromPlanOut(
        list_id=lst.id, added=[i.name for i in added], covered_by_pantry=covered
    )
