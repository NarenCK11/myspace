"""Manually logged meals, drinks and snacks."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models.enums import MealType
from app.models.nutrition import Meal, meal_labels
from app.schemas.common import Page
from app.schemas.nutrition import MealCreate, MealRead, MealSuggestion, MealUpdate
from app.services import nutrition as nutrition_service
from app.services import timeutil
from app.services.search import like_pattern, matches

router = APIRouter(prefix="/meals", tags=["meals"])

# Fields that may be cleared with an explicit null.
NULLABLE_FIELDS = {"portion", "calories", "notes"}


def _get_meal(db, user_id: str, meal_id: str) -> Meal:
    meal = db.get(Meal, meal_id)
    if meal is None or meal.user_id != user_id:
        raise NotFoundError("Meal not found.")
    return meal


@router.get("", response_model=Page[MealRead])
def list_meals(
    db: DbSession,
    user: CurrentUser,
    day: dt.date | None = None,
    since: dt.datetime | None = None,
    until: dt.datetime | None = None,
    meal_type: MealType | None = None,
    label_id: Annotated[list[str] | None, Query()] = None,
    q: str | None = None,
    order: Literal["asc", "desc"] = "desc",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[MealRead]:
    conditions = [Meal.user_id == user.id]

    if day is not None:
        start, end = timeutil.day_bounds(day, user.timezone)
        conditions += [Meal.eaten_at >= start, Meal.eaten_at < end]
    if since is not None:
        conditions.append(Meal.eaten_at >= since)
    if until is not None:
        conditions.append(Meal.eaten_at < until)
    if meal_type is not None:
        conditions.append(Meal.meal_type == meal_type.value)
    if q and q.strip():
        pattern = like_pattern(q.strip())
        conditions.append(
            or_(
                matches(Meal.name, pattern),
                matches(Meal.notes, pattern),
                matches(Meal.portion, pattern),
            )
        )
    if label_id:
        conditions.append(
            Meal.id.in_(select(meal_labels.c.meal_id).where(meal_labels.c.label_id.in_(label_id)))
        )

    ordering = Meal.eaten_at.asc() if order == "asc" else Meal.eaten_at.desc()
    total = int(db.execute(select(func.count()).select_from(Meal).where(*conditions)).scalar_one())
    rows = list(
        db.execute(
            select(Meal).where(*conditions).order_by(ordering).limit(limit).offset(offset)
        ).scalars()
    )
    return Page[MealRead](
        items=[MealRead.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(rows) < total,
    )


@router.get("/suggestions", response_model=list[MealSuggestion])
def meal_suggestions(
    db: DbSession, user: CurrentUser, limit: Annotated[int, Query(ge=1, le=20)] = 8
) -> list[MealSuggestion]:
    return [
        MealSuggestion.model_validate(item)
        for item in nutrition_service.suggestions(db, user.id, limit)
    ]


@router.post("", response_model=MealRead, status_code=status.HTTP_201_CREATED)
def create_meal(payload: MealCreate, db: DbSession, user: CurrentUser) -> MealRead:
    meal = Meal(
        user_id=user.id,
        name=payload.name,
        meal_type=payload.meal_type.value,
        eaten_at=payload.eaten_at or utcnow(),
        portion=(payload.portion or "").strip() or None,
        calories=payload.calories,
        notes=(payload.notes or "").strip() or None,
    )
    meal.labels = nutrition_service.resolve_labels(db, user.id, payload.label_ids)
    db.add(meal)
    db.flush()
    return MealRead.model_validate(meal)


@router.get("/{meal_id}", response_model=MealRead)
def get_meal(meal_id: str, db: DbSession, user: CurrentUser) -> MealRead:
    return MealRead.model_validate(_get_meal(db, user.id, meal_id))


@router.patch("/{meal_id}", response_model=MealRead)
def update_meal(meal_id: str, payload: MealUpdate, db: DbSession, user: CurrentUser) -> MealRead:
    meal = _get_meal(db, user.id, meal_id)
    data = payload.model_dump(exclude_unset=True)
    label_ids = data.pop("label_ids", None)

    for field, value in list(data.items()):
        if value is None and field not in NULLABLE_FIELDS:
            data.pop(field)  # name, meal_type and eaten_at cannot be cleared
        elif field == "meal_type" and value is not None:
            data[field] = value.value
        elif field == "name" and value is not None:
            data[field] = value.strip() or meal.name

    for field, value in data.items():
        setattr(meal, field, value)
    if label_ids is not None:
        meal.labels = nutrition_service.resolve_labels(db, user.id, label_ids)

    db.flush()
    return MealRead.model_validate(meal)


@router.delete("/{meal_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_meal(meal_id: str, db: DbSession, user: CurrentUser) -> None:
    db.delete(_get_meal(db, user.id, meal_id))
    db.flush()
