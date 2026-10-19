"""Day-to-day body weight log (kilograms, one entry per day)."""

from __future__ import annotations

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query, Response, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError, ConflictError, NotFoundError
from app.models.nutrition import WeightEntry
from app.schemas.nutrition import WeightRead, WeightStats, WeightUpdate, WeightUpsert
from app.services import nutrition as nutrition_service
from app.services import timeutil

router = APIRouter(prefix="/weights", tags=["weight"])

MAX_RANGE_DAYS = 1100


def _get_entry(db, user_id: str, entry_id: str) -> WeightEntry:
    entry = db.get(WeightEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise NotFoundError("Weight entry not found.")
    return entry


def _reject_future(day: dt.date, timezone: str) -> None:
    if day > timeutil.local_today(timezone):
        raise AppError("A weight cannot be logged for a future date.", code="future_date")


def _entry_on(db, user_id: str, day: dt.date) -> WeightEntry | None:
    return db.execute(
        select(WeightEntry).where(WeightEntry.user_id == user_id, WeightEntry.logged_on == day)
    ).scalar_one_or_none()


@router.get("", response_model=list[WeightRead])
def list_weights(
    db: DbSession,
    user: CurrentUser,
    start: dt.date | None = None,
    end: dt.date | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_RANGE_DAYS)] = 400,
) -> list[WeightRead]:
    """Entries in date order (oldest first), which is what a chart wants."""
    conditions = [WeightEntry.user_id == user.id]
    if start is not None:
        conditions.append(WeightEntry.logged_on >= start)
    if end is not None:
        conditions.append(WeightEntry.logged_on <= end)

    # Newest-first under the limit, then flipped, so a limit keeps the recent end.
    rows = list(
        db.execute(
            select(WeightEntry)
            .where(*conditions)
            .order_by(WeightEntry.logged_on.desc())
            .limit(limit)
        ).scalars()
    )
    return [WeightRead.model_validate(row) for row in reversed(rows)]


@router.get("/stats", response_model=WeightStats)
def get_weight_stats(db: DbSession, user: CurrentUser) -> WeightStats:
    return nutrition_service.weight_stats(db, user)


@router.post("", response_model=WeightRead)
def log_weight(
    payload: WeightUpsert, response: Response, db: DbSession, user: CurrentUser
) -> WeightRead:
    """Log a weight for a day. Logging the same day again replaces that entry."""
    day = payload.logged_on or timeutil.local_today(user.timezone)
    _reject_future(day, user.timezone)

    entry = _entry_on(db, user.id, day)
    if entry is None:
        entry = WeightEntry(user_id=user.id, logged_on=day, weight_kg=payload.weight_kg)
        db.add(entry)
        response.status_code = status.HTTP_201_CREATED
    entry.weight_kg = payload.weight_kg
    entry.note = (payload.note or "").strip() or None
    db.flush()
    return WeightRead.model_validate(entry)


@router.patch("/{entry_id}", response_model=WeightRead)
def update_weight(
    entry_id: str, payload: WeightUpdate, db: DbSession, user: CurrentUser
) -> WeightRead:
    entry = _get_entry(db, user.id, entry_id)
    data = payload.model_dump(exclude_unset=True)

    new_day = data.get("logged_on")
    if new_day is not None and new_day != entry.logged_on:
        _reject_future(new_day, user.timezone)
        if _entry_on(db, user.id, new_day) is not None:
            raise ConflictError("A weight is already logged for that day.")
        entry.logged_on = new_day
    if data.get("weight_kg") is not None:
        entry.weight_kg = data["weight_kg"]
    if "note" in data:
        entry.note = (data["note"] or "").strip() or None

    db.flush()
    return WeightRead.model_validate(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_weight(entry_id: str, db: DbSession, user: CurrentUser) -> None:
    db.delete(_get_entry(db, user.id, entry_id))
    db.flush()
