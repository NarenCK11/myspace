"""Activity log / personal history."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import ForbiddenError, NotFoundError
from app.db.base import utcnow
from app.models.content import Activity, activity_tags
from app.models.enums import ActivitySource
from app.schemas.common import Page
from app.schemas.content import ActivityCreate, ActivityRead, ActivityUpdate
from app.services import tags as tag_service
from app.services import timeutil

router = APIRouter(prefix="/activities", tags=["activities"])

SourceFilter = Literal["all", "manual", "system"]


def _get_activity(db, user_id: str, activity_id: str) -> Activity:
    row = db.get(Activity, activity_id)
    if row is None or row.user_id != user_id:
        raise NotFoundError("Activity not found.")
    return row


@router.get("", response_model=Page[ActivityRead])
def list_activities(
    db: DbSession,
    user: CurrentUser,
    source: SourceFilter = "all",
    day: dt.date | None = None,
    since: dt.datetime | None = None,
    until: dt.datetime | None = None,
    tag_id: Annotated[list[str] | None, Query()] = None,
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ActivityRead]:
    conditions = [Activity.user_id == user.id]

    if source != "all":
        conditions.append(Activity.source == source)
    if day is not None:
        start, end = timeutil.day_bounds(day, user.timezone)
        conditions += [Activity.occurred_at >= start, Activity.occurred_at < end]
    if since is not None:
        conditions.append(Activity.occurred_at >= since)
    if until is not None:
        conditions.append(Activity.occurred_at < until)
    if q:
        pattern = f"%{q.strip()}%"
        conditions.append(
            or_(Activity.title.ilike(pattern), Activity.description.ilike(pattern))
        )
    if tag_id:
        conditions.append(
            Activity.id.in_(
                select(activity_tags.c.activity_id).where(activity_tags.c.tag_id.in_(tag_id))
            )
        )

    total = int(
        db.execute(select(func.count()).select_from(Activity).where(*conditions)).scalar_one()
    )
    rows = list(
        db.execute(
            select(Activity)
            .where(*conditions)
            .order_by(Activity.occurred_at.desc())
            .limit(limit)
            .offset(offset)
        ).scalars()
    )
    return Page[ActivityRead](
        items=[ActivityRead.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(rows) < total,
    )


@router.post("", response_model=ActivityRead, status_code=status.HTTP_201_CREATED)
def create_activity(payload: ActivityCreate, db: DbSession, user: CurrentUser) -> ActivityRead:
    activity = Activity(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        occurred_at=payload.occurred_at or utcnow(),
        duration_minutes=payload.duration_minutes,
        source=ActivitySource.MANUAL.value,
    )
    activity.tags = tag_service.resolve_tags(db, user.id, payload.tag_ids)
    db.add(activity)
    db.flush()
    return ActivityRead.model_validate(activity)


@router.get("/{activity_id}", response_model=ActivityRead)
def get_activity(activity_id: str, db: DbSession, user: CurrentUser) -> ActivityRead:
    return ActivityRead.model_validate(_get_activity(db, user.id, activity_id))


@router.patch("/{activity_id}", response_model=ActivityRead)
def update_activity(
    activity_id: str, payload: ActivityUpdate, db: DbSession, user: CurrentUser
) -> ActivityRead:
    activity = _get_activity(db, user.id, activity_id)
    if activity.source == ActivitySource.SYSTEM.value:
        raise ForbiddenError("Automatically recorded history entries cannot be edited.")

    data = payload.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)
    for field, value in data.items():
        setattr(activity, field, value)
    if tag_ids is not None:
        activity.tags = tag_service.resolve_tags(db, user.id, tag_ids)
    db.flush()
    return ActivityRead.model_validate(activity)


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_activity(activity_id: str, db: DbSession, user: CurrentUser) -> None:
    activity = _get_activity(db, user.id, activity_id)
    db.delete(activity)
    db.flush()
