"""Dashboard, Today view, global search and quick-add."""

from __future__ import annotations

import datetime as dt
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import CurrentUser, DbSession
from app.db.base import utcnow
from app.models.content import Activity, Note, Reminder, Task
from app.models.enums import ActivitySource, EntityType, RepeatRule, TaskStatus
from app.schemas.content import QuickAddRequest, QuickAddResponse
from app.schemas.dashboard import DashboardResponse, SearchResponse, TodayResponse
from app.services import activity_log
from app.services import dashboard as dashboard_service
from app.services import search as search_service
from app.services import tags as tag_service

router = APIRouter(tags=["overview"])


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(db: DbSession, user: CurrentUser) -> DashboardResponse:
    return DashboardResponse.model_validate(dashboard_service.build_dashboard(db, user))


@router.get("/today", response_model=TodayResponse)
def get_today(db: DbSession, user: CurrentUser, day: dt.date | None = None) -> TodayResponse:
    return TodayResponse.model_validate(dashboard_service.build_today(db, user, day))


@router.get("/search", response_model=SearchResponse)
def global_search(
    db: DbSession,
    user: CurrentUser,
    q: Annotated[str, Query(min_length=0, max_length=200)] = "",
    kind: Annotated[list[str] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> SearchResponse:
    result = search_service.search(
        db, user.id, q, limit=limit, kinds=set(kind) if kind else None
    )
    return SearchResponse.model_validate(result)


@router.post("/quick-add", response_model=QuickAddResponse, status_code=status.HTTP_201_CREATED)
def quick_add(payload: QuickAddRequest, db: DbSession, user: CurrentUser) -> QuickAddResponse:
    """Single entry point behind the global quick-add control."""
    tags = tag_service.resolve_tags(db, user.id, payload.tag_ids)

    if payload.kind == "task":
        row = Task(
            user_id=user.id,
            title=payload.title,
            description=payload.body,
            due_at=payload.when,
            priority=payload.priority.value,
            status=TaskStatus.TODO.value,
        )
        entity = EntityType.TASK
    elif payload.kind == "reminder":
        row = Reminder(
            user_id=user.id,
            title=payload.title,
            notes=payload.body,
            remind_at=payload.when or utcnow() + dt.timedelta(hours=1),
            repeat_rule=RepeatRule.NONE.value,
        )
        entity = EntityType.REMINDER
    elif payload.kind == "note":
        row = Note(user_id=user.id, title=payload.title, content=payload.body or "")
        entity = EntityType.NOTE
    else:
        row = Activity(
            user_id=user.id,
            title=payload.title,
            description=payload.body,
            occurred_at=payload.when or utcnow(),
            source=ActivitySource.MANUAL.value,
        )
        entity = EntityType.ACTIVITY

    row.tags = tags
    db.add(row)
    db.flush()

    if payload.kind != "activity":
        activity_log.log(
            db,
            user_id=user.id,
            action="created",
            entity_type=entity,
            entity_id=row.id,
            title=f"Created {payload.kind}: {row.title}",
        )

    return QuickAddResponse(kind=payload.kind, id=row.id, title=row.title)
