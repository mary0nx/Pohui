"""AI tools for pantry, meal planning and documents (metadata only)."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.ai.tools.common import ToolError, parse_date
from app.ai.tools.registry import Prepared, Tool, ToolArgs, ToolContext, register
from app.core.time import local_today
from app.models.enums import MealType
from app.modules.documents import service as documents
from app.modules.kitchen import service as kitchen
from app.modules.kitchen.schemas import IngredientIn, MealEntryIn, RecipeCreate, ShoppingFromPlan


class PantryArgs(ToolArgs):
    pass


async def pantry(tc: ToolContext, a: PantryArgs) -> dict[str, Any]:
    items = await kitchen.list_pantry(tc.db, tc.ctx)
    return {
        "today": local_today(tc.ctx.family.timezone).isoformat(),
        "items": [
            {"name": i.name, "quantity": str(i.quantity) if i.quantity is not None else None, "unit": i.unit, "expires_on": i.expires_on.isoformat() if i.expires_on else None, "expiring_soon": i.expiring_soon, "expired": i.expired}
            for i in items
        ],
    }


register(Tool("get_pantry_items", "Продукты дома: количество и сроки годности.", PantryArgs, "read", pantry))


class Meal(BaseModel):
    day: str = Field(description="ГГГГ-ММ-ДД")
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"] = "dinner"
    title: str = Field(min_length=1, max_length=200)
    servings: int = Field(2, ge=1, le=20)
    ingredients: list[IngredientIn] = Field(default_factory=list, max_length=30, description="Ингредиенты на указанное число порций")


class MealPlanArgs(ToolArgs):
    meals: list[Meal] = Field(min_length=1, max_length=28)
    add_to_shopping_list: bool = Field(True, description="Добавить недостающие ингредиенты в список покупок")


async def prepare_meal_plan(tc: ToolContext, a: MealPlanArgs) -> Prepared:
    today = local_today(tc.ctx.family.timezone)
    meals = []
    for m in a.meals:
        day = parse_date(m.day)
        if day < today - timedelta(days=1) or day > today + timedelta(days=31):
            raise ToolError("План можно составить на ближайший месяц")
        meals.append({**m.model_dump(mode="json"), "day": day.isoformat()})
    labels = {"breakfast": "завтрак", "lunch": "обед", "dinner": "ужин", "snack": "перекус"}
    return Prepared(
        arguments={"meals": meals, "add_to_shopping_list": a.add_to_shopping_list},
        summary=f"Меню: {len(meals)} блюд" + (" + список покупок" if a.add_to_shopping_list else ""),
        details=[f"{date.fromisoformat(m['day']):%d.%m} {labels[m['meal_type']]}: {m['title']}" for m in meals],
    )


async def execute_meal_plan(tc: ToolContext, args: dict[str, Any]) -> dict[str, Any]:
    days = []
    for m in args["meals"]:
        recipe_id = None
        if m.get("ingredients"):
            recipe = await kitchen.create_recipe(
                tc.db,
                tc.ctx,
                RecipeCreate(title=m["title"], servings=m["servings"], ingredients=[IngredientIn.model_validate(i) for i in m["ingredients"]]),
                source="ai",
            )
            recipe_id = recipe.id
        await kitchen.set_plan_entry(
            tc.db, tc.ctx, MealEntryIn(day=date.fromisoformat(m["day"]), meal_type=MealType(m["meal_type"]), title=m["title"], recipe_id=recipe_id, servings=m["servings"])
        )
        days.append(date.fromisoformat(m["day"]))
    result: dict[str, Any] = {"planned_meals": len(args["meals"])}
    if args.get("add_to_shopping_list") and days:
        out = await kitchen.shopping_from_plan(tc.db, tc.ctx, ShoppingFromPlan(date_from=min(days), date_to=max(days)))
        result["added_to_shopping"] = out.added
        result["already_at_home"] = out.covered_by_pantry
    return result


register(
    Tool(
        "generate_meal_plan",
        "Сохранить составленное тобой меню (с ингредиентами) и при желании добавить недостающее в покупки. Запасы при этом не списываются.",
        MealPlanArgs,
        "confirm",
        execute_meal_plan,
        prepare=prepare_meal_plan,
    )
)


class DocsArgs(ToolArgs):
    query: str | None = Field(None, max_length=100)
    expiring_within_days: int | None = Field(None, ge=1, le=365)


async def search_docs(tc: ToolContext, a: DocsArgs) -> dict[str, Any]:
    docs = await documents.list_documents(tc.db, tc.ctx, a.query, None, False)
    today = local_today(tc.ctx.family.timezone)
    if a.expiring_within_days:
        limit = today + timedelta(days=a.expiring_within_days)
        docs = [d for d in docs if d.expires_on and d.expires_on <= limit]
    # Only metadata: file contents are never sent to the model.
    return {
        "documents": [
            {"title": d.title, "category": d.category, "document_date": d.document_date.isoformat() if d.document_date else None, "expires_on": d.expires_on.isoformat() if d.expires_on else None, "has_file": d.storage_key is not None, "private": d.visibility == "private"}
            for d in docs[:50]
        ]
    }


register(Tool("search_documents", "Найти семейные документы по названию или сроку действия (только метаданные).", DocsArgs, "read", search_docs))

