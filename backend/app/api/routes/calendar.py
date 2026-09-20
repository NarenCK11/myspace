"""Unified calendar feed combining Google events with local items."""

from __future__ import annotations

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.errors import AppError
from app.schemas.calendar import CalendarFeed
from app.services import calendar_feed, google_sync, timeutil

router = APIRouter(prefix="/calendar", tags=["calendar"])

MAX_RANGE_DAYS = 400
VALID_KINDS = {"google_event", "task", "reminder", "activity"}


@router.get("/events", response_model=CalendarFeed)
def list_calendar_events(
    db: DbSession,
    user: CurrentUser,
    start: dt.datetime | None = None,
    end: dt.datetime | None = None,
    kind: Annotated[list[str] | None, Query()] = None,
) -> CalendarFeed:
    """Return every calendar item overlapping the requested window.

    Defaults to the current local month when no window is given.
    """
    if start is None or end is None:
        today = timeutil.local_now(user.timezone).date()
        month_start = today.replace(day=1)
        next_month = (month_start + dt.timedelta(days=32)).replace(day=1)
        start_utc, end_utc = timeutil.range_bounds(
            month_start - dt.timedelta(days=7),
            next_month + dt.timedelta(days=7),
            user.timezone,
        )
        start = start or start_utc
        end = end or end_utc

    start = timeutil.ensure_utc(start)
    end = timeutil.ensure_utc(end)

    if end <= start:
        raise AppError("The end of the range must be after the start.", code="invalid_range")
    if (end - start).days > MAX_RANGE_DAYS:
        raise AppError(
            f"Calendar ranges are limited to {MAX_RANGE_DAYS} days.", code="range_too_large"
        )

    kinds = {k for k in (kind or []) if k in VALID_KINDS} or None
    items = calendar_feed.build_feed(db, user.id, start, end, kinds=kinds)
    account = google_sync.get_account(db, user.id)

    return CalendarFeed(
        start=start,
        end=end,
        items=items,
        google_connected=account is not None,
        last_synced_at=account.last_synced_at if account else None,
    )
