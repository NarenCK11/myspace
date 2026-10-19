"""Schemas for meals, food labels and the weight log."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import LabelTone, MealType
from app.schemas.common import ORMModel

MAX_LABELS_PER_MEAL = 12
LABEL_COLORS = (
    "slate", "emerald", "teal", "sky", "indigo", "violet", "amber", "orange", "rose",
)
MIN_WEIGHT_KG = 20.0
MAX_WEIGHT_KG = 500.0


# --- Food labels -----------------------------------------------------------


def _check_color(value: str | None) -> str | None:
    if value is not None and value not in LABEL_COLORS:
        raise ValueError(f"Color must be one of: {', '.join(LABEL_COLORS)}")
    return value


class FoodLabelCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=40)
    color: str = Field(default="slate", max_length=16)
    tone: LabelTone = LabelTone.NEUTRAL

    _color = field_validator("color")(_check_color)


class FoodLabelUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=40)
    color: str | None = Field(default=None, max_length=16)
    tone: LabelTone | None = None

    _color = field_validator("color")(_check_color)


class FoodLabelRead(ORMModel):
    id: str
    name: str
    color: str
    tone: str


class FoodLabelWithCount(FoodLabelRead):
    meal_count: int = 0


# --- Meals -----------------------------------------------------------------


class MealCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    meal_type: MealType = MealType.OTHER
    eaten_at: dt.datetime | None = None
    portion: str | None = Field(default=None, max_length=100)
    calories: int | None = Field(default=None, ge=0, le=10000)
    notes: str | None = Field(default=None, max_length=2000)
    label_ids: list[str] = Field(default_factory=list, max_length=MAX_LABELS_PER_MEAL)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name cannot be blank")
        return stripped


class MealUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    meal_type: MealType | None = None
    eaten_at: dt.datetime | None = None
    portion: str | None = Field(default=None, max_length=100)
    calories: int | None = Field(default=None, ge=0, le=10000)
    notes: str | None = Field(default=None, max_length=2000)
    label_ids: list[str] | None = Field(default=None, max_length=MAX_LABELS_PER_MEAL)


class MealRead(ORMModel):
    id: str
    name: str
    meal_type: str
    eaten_at: dt.datetime
    portion: str | None
    calories: int | None
    notes: str | None
    created_at: dt.datetime
    updated_at: dt.datetime
    labels: list[FoodLabelRead] = Field(default_factory=list)


class MealSuggestion(BaseModel):
    """A previously logged item, offered as a one-tap way to log it again."""

    name: str
    meal_type: str
    portion: str | None = None
    calories: int | None = None
    times_logged: int
    last_eaten_at: dt.datetime
    labels: list[FoodLabelRead] = Field(default_factory=list)


# --- Weight ----------------------------------------------------------------


class WeightUpsert(BaseModel):
    model_config = ConfigDict(extra="forbid")

    logged_on: dt.date | None = None
    weight_kg: float = Field(ge=MIN_WEIGHT_KG, le=MAX_WEIGHT_KG)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("weight_kg")
    @classmethod
    def _round(cls, value: float) -> float:
        return round(value, 2)


class WeightUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    logged_on: dt.date | None = None
    weight_kg: float | None = Field(default=None, ge=MIN_WEIGHT_KG, le=MAX_WEIGHT_KG)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("weight_kg")
    @classmethod
    def _round(cls, value: float | None) -> float | None:
        return None if value is None else round(value, 2)


class WeightRead(ORMModel):
    id: str
    logged_on: dt.date
    weight_kg: float
    note: str | None
    created_at: dt.datetime
    updated_at: dt.datetime


class WeightStats(BaseModel):
    latest: WeightRead | None = None
    previous: WeightRead | None = None
    logged_today: bool = False
    entries_count: int = 0
    change_since_previous: float | None = None
    average_7d: float | None = None
    change_7d: float | None = None
    change_30d: float | None = None
    min_kg: float | None = None
    max_kg: float | None = None


# --- Summaries -------------------------------------------------------------


class LabelCount(BaseModel):
    label_id: str
    name: str
    color: str
    tone: str
    count: int


class DaySummary(BaseModel):
    date: dt.date
    meals_count: int = 0
    calories_total: int = 0
    calories_logged_count: int = 0
    good_count: int = 0
    mixed_count: int = 0
    bad_count: int = 0
    neutral_count: int = 0
    label_counts: list[LabelCount] = Field(default_factory=list)
    weight_kg: float | None = None


class NutritionDay(BaseModel):
    date: dt.date
    meals_count: int = 0
    calories_total: int = 0
    good_count: int = 0
    mixed_count: int = 0
    bad_count: int = 0
    neutral_count: int = 0
    weight_kg: float | None = None


class NutritionHistory(BaseModel):
    start: dt.date
    end: dt.date
    days: list[NutritionDay]
    label_totals: list[LabelCount] = Field(default_factory=list)
    days_with_meals: int = 0
    meals_count: int = 0
    good_count: int = 0
    mixed_count: int = 0
    bad_count: int = 0
    neutral_count: int = 0


class NutritionDashboard(BaseModel):
    today: DaySummary
    weight: WeightStats
