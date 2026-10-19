"""Labels for meals (healthy, unhealthy, protein, ...)."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import ConflictError, NotFoundError
from app.models.nutrition import FoodLabel, meal_labels
from app.schemas.nutrition import (
    FoodLabelCreate,
    FoodLabelRead,
    FoodLabelUpdate,
    FoodLabelWithCount,
)
from app.services import nutrition as nutrition_service

router = APIRouter(prefix="/meal-labels", tags=["meals"])


def _get_label(db, user_id: str, label_id: str) -> FoodLabel:
    label = db.get(FoodLabel, label_id)
    if label is None or label.user_id != user_id:
        raise NotFoundError("Label not found.")
    return label


def _name_taken(db, user_id: str, name: str, exclude_id: str | None = None) -> bool:
    stmt = select(FoodLabel.id).where(
        FoodLabel.user_id == user_id, func.lower(FoodLabel.name) == name.lower()
    )
    if exclude_id:
        stmt = stmt.where(FoodLabel.id != exclude_id)
    return db.execute(stmt).first() is not None


@router.get("", response_model=list[FoodLabelWithCount])
def list_labels(db: DbSession, user: CurrentUser) -> list[FoodLabelWithCount]:
    nutrition_service.ensure_default_labels(db, user)
    labels = list(
        db.execute(
            select(FoodLabel)
            .where(FoodLabel.user_id == user.id)
            .order_by(func.lower(FoodLabel.name))
        ).scalars()
    )
    usage = dict(
        db.execute(
            select(meal_labels.c.label_id, func.count()).group_by(meal_labels.c.label_id)
        ).all()
    )
    return [
        FoodLabelWithCount(
            **FoodLabelRead.model_validate(label).model_dump(), meal_count=usage.get(label.id, 0)
        )
        for label in labels
    ]


@router.post("", response_model=FoodLabelRead, status_code=status.HTTP_201_CREATED)
def create_label(payload: FoodLabelCreate, db: DbSession, user: CurrentUser) -> FoodLabelRead:
    nutrition_service.ensure_default_labels(db, user)
    name = payload.name.strip()
    if not name:
        raise ConflictError("A label needs a name.")
    if _name_taken(db, user.id, name):
        raise ConflictError("A label with that name already exists.")
    label = FoodLabel(user_id=user.id, name=name, color=payload.color, tone=payload.tone.value)
    db.add(label)
    db.flush()
    return FoodLabelRead.model_validate(label)


@router.patch("/{label_id}", response_model=FoodLabelRead)
def update_label(
    label_id: str, payload: FoodLabelUpdate, db: DbSession, user: CurrentUser
) -> FoodLabelRead:
    label = _get_label(db, user.id, label_id)
    data = payload.model_dump(exclude_unset=True)

    if data.get("name") is not None:
        name = data["name"].strip()
        if _name_taken(db, user.id, name, exclude_id=label.id):
            raise ConflictError("A label with that name already exists.")
        label.name = name
    if data.get("color") is not None:
        label.color = data["color"]
    if data.get("tone") is not None:
        label.tone = data["tone"].value

    db.flush()
    return FoodLabelRead.model_validate(label)


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_label(label_id: str, db: DbSession, user: CurrentUser) -> None:
    """Removes the label from every meal; the meals themselves are kept."""
    db.delete(_get_label(db, user.id, label_id))
    db.flush()
