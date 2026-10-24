from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.core.schemas import LongText, ORMModel, Title
from app.models.enums import MealType, Visibility

Qty = Decimal


class PantryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: Decimal | None = Field(None, ge=0, max_digits=12, decimal_places=3)
    unit: str | None = Field(None, max_length=16)
    category: str | None = Field(None, max_length=32)
    expires_on: date | None = None
    note: str | None = Field(None, max_length=300)


class PantryPatch(PantryCreate):
    name: str | None = Field(None, min_length=1, max_length=200)  # type: ignore[assignment]


class PantryAdjust(BaseModel):
    delta: Decimal = Field(max_digits=12, decimal_places=3)


class PantryOut(ORMModel):
    id: uuid.UUID
    name: str
    quantity: Decimal | None
    unit: str | None
    category: str | None
    expires_on: date | None
    note: str | None
    updated_at: datetime
    expiring_soon: bool = False
    expired: bool = False


class IngredientIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: Decimal | None = Field(None, gt=0, max_digits=12, decimal_places=3)
    unit: str | None = Field(None, max_length=16)


class IngredientOut(IngredientIn):
    id: uuid.UUID


class RecipeCreate(BaseModel):
    title: Title
    description: LongText | None = None
    instructions: LongText | None = None
    servings: int = Field(2, ge=1, le=100)
    prep_minutes: int | None = Field(None, ge=0, le=1440)
    tags: list[str] = Field(default_factory=list, max_length=10)
    ingredients: list[IngredientIn] = Field(default_factory=list, max_length=60)
    visibility: Visibility = Visibility.family


class RecipePatch(BaseModel):
    title: Title | None = None
    description: LongText | None = None
    instructions: LongText | None = None
    servings: int | None = Field(None, ge=1, le=100)
    prep_minutes: int | None = Field(None, ge=0, le=1440)
    tags: list[str] | None = Field(None, max_length=10)
    ingredients: list[IngredientIn] | None = Field(None, max_length=60)


class RecipeOut(ORMModel):
    id: uuid.UUID
    title: str
    description: str | None
    instructions: str | None
    servings: int
    prep_minutes: int | None
    tags: list[str]
    source: str
    visibility: Visibility
    created_by: uuid.UUID | None
    ingredients: list[IngredientOut] = []


class MealEntryIn(BaseModel):
    day: date
    meal_type: MealType
    title: str | None = Field(None, max_length=200)
    recipe_id: uuid.UUID | None = None
    servings: int = Field(2, ge=1, le=100)


class MealEntryOut(ORMModel):
    id: uuid.UUID
    day: date
    meal_type: MealType
    title: str
    recipe_id: uuid.UUID | None
    servings: int


class ShoppingFromPlan(BaseModel):
    date_from: date
    date_to: date
    list_id: uuid.UUID | None = None
    subtract_pantry: bool = True


class ShoppingFromPlanOut(BaseModel):
    list_id: uuid.UUID
    added: list[str]
    covered_by_pantry: list[str]
