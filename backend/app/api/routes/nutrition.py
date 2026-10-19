"""Per-day nutrition summary and multi-day history."""

from __future__ import annotations

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.schemas.nutrition import DaySummary, NutritionHistory
from app.services import nutrition as nutrition_service
from app.services import timeutil

router = APIRouter(prefix="/nutrition", tags=["meals"])


@router.get("/summary", response_model=DaySummary)
def day_summary(db: DbSession, user: CurrentUser, day: dt.date | None = None) -> DaySummary:
    target = day or timeutil.local_today(user.timezone)
    return nutrition_service.day_summary(db, user, target)


@router.get("/history", response_model=NutritionHistory)
def nutrition_history(
    db: DbSession,
    user: CurrentUser,
    days: Annotated[int, Query(ge=1, le=120)] = 14,
    end: dt.date | None = None,
) -> NutritionHistory:
    """The last ``days`` days up to and including ``end`` (default: today)."""
    end_day = end or timeutil.local_today(user.timezone)
    start_day = end_day - dt.timedelta(days=days - 1)
    return nutrition_service.history(db, user, start_day, end_day)
