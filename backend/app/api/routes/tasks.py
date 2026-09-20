"""Task CRUD and filtered listing."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import case, func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models.content import Task, task_tags
from app.models.enums import EntityType, Priority, TaskStatus
from app.schemas.common import Page
from app.schemas.content import TaskCreate, TaskRead, TaskStats, TaskUpdate
from app.services import activity_log, dashboard, timeutil
from app.services import tags as tag_service

router = APIRouter(prefix="/tasks", tags=["tasks"])

OPEN_STATUSES = (TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value)

# Urgent first when sorting descending, low first when ascending.
PRIORITY_RANK = case(
    {
        Priority.URGENT.value: 4,
        Priority.HIGH.value: 3,
        Priority.MEDIUM.value: 2,
        Priority.LOW.value: 1,
    },
    value=Task.priority,
    else_=0,
)
TaskView = Literal["all", "today", "upcoming", "overdue", "open", "completed", "unscheduled"]


def _get_task(db, user_id: str, task_id: str) -> Task:
    task = db.get(Task, task_id)
    if task is None or task.user_id != user_id:
        raise NotFoundError("Task not found.")
    return task


@router.get("", response_model=Page[TaskRead])
def list_tasks(
    db: DbSession,
    user: CurrentUser,
    view: TaskView = "all",
    status_filter: Annotated[list[TaskStatus] | None, Query(alias="status")] = None,
    priority: Annotated[list[Priority] | None, Query()] = None,
    tag_id: Annotated[list[str] | None, Query()] = None,
    q: str | None = None,
    due_before: dt.datetime | None = None,
    due_after: dt.datetime | None = None,
    sort: Literal["due_at", "created_at", "priority", "title", "updated_at"] = "due_at",
    order: Literal["asc", "desc"] = "asc",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[TaskRead]:
    conditions = [Task.user_id == user.id]
    now = utcnow()
    today = timeutil.local_now(user.timezone).date()
    day_start, day_end = timeutil.day_bounds(today, user.timezone)

    if view == "today":
        conditions += [Task.status.in_(OPEN_STATUSES), Task.due_at >= day_start, Task.due_at < day_end]
    elif view == "upcoming":
        conditions += [Task.status.in_(OPEN_STATUSES), Task.due_at >= day_end]
    elif view == "overdue":
        conditions += [Task.status.in_(OPEN_STATUSES), Task.due_at.is_not(None), Task.due_at < now]
    elif view == "open":
        conditions.append(Task.status.in_(OPEN_STATUSES))
    elif view == "completed":
        conditions.append(Task.status == TaskStatus.DONE.value)
    elif view == "unscheduled":
        conditions += [Task.status.in_(OPEN_STATUSES), Task.due_at.is_(None)]

    if status_filter:
        conditions.append(Task.status.in_([s.value for s in status_filter]))
    if priority:
        conditions.append(Task.priority.in_([p.value for p in priority]))
    if due_before:
        conditions.append(Task.due_at < due_before)
    if due_after:
        conditions.append(Task.due_at >= due_after)
    if q:
        pattern = f"%{q.strip()}%"
        conditions.append(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))
    if tag_id:
        conditions.append(
            Task.id.in_(select(task_tags.c.task_id).where(task_tags.c.tag_id.in_(tag_id)))
        )

    sort_columns = {
        "due_at": Task.due_at,
        "created_at": Task.created_at,
        "title": func.lower(Task.title),
        "updated_at": Task.updated_at,
        "priority": PRIORITY_RANK,
    }
    column = sort_columns[sort]
    direction = column.asc() if order == "asc" else column.desc()
    # Keep undated tasks at the end regardless of sort direction.
    ordering = [Task.due_at.is_(None), direction] if sort == "due_at" else [direction]

    total = int(
        db.execute(select(func.count()).select_from(Task).where(*conditions)).scalar_one()
    )
    rows = list(
        db.execute(
            select(Task).where(*conditions).order_by(*ordering, Task.created_at.desc())
            .limit(limit)
            .offset(offset)
        ).scalars()
    )
    return Page[TaskRead](
        items=[TaskRead.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(rows) < total,
    )


@router.get("/stats", response_model=TaskStats)
def task_stats(db: DbSession, user: CurrentUser) -> TaskStats:
    return TaskStats(**dashboard.task_stats(db, user))


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
def create_task(payload: TaskCreate, db: DbSession, user: CurrentUser) -> TaskRead:
    data = payload.model_dump(exclude={"tag_ids"})
    data["status"] = data["status"].value
    data["priority"] = data["priority"].value

    task = Task(user_id=user.id, **data)
    task.tags = tag_service.resolve_tags(db, user.id, payload.tag_ids)
    if task.status == TaskStatus.DONE.value:
        task.completed_at = utcnow()
    db.add(task)
    db.flush()

    activity_log.log(
        db,
        user_id=user.id,
        action="created",
        entity_type=EntityType.TASK,
        entity_id=task.id,
        title=f"Created task: {task.title}",
    )
    return TaskRead.model_validate(task)


@router.get("/{task_id}", response_model=TaskRead)
def get_task(task_id: str, db: DbSession, user: CurrentUser) -> TaskRead:
    return TaskRead.model_validate(_get_task(db, user.id, task_id))


@router.patch("/{task_id}", response_model=TaskRead)
def update_task(task_id: str, payload: TaskUpdate, db: DbSession, user: CurrentUser) -> TaskRead:
    task = _get_task(db, user.id, task_id)
    data = payload.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)
    previous_status = task.status

    if "status" in data and data["status"] is not None:
        data["status"] = data["status"].value
    if "priority" in data and data["priority"] is not None:
        data["priority"] = data["priority"].value

    for field, value in data.items():
        setattr(task, field, value)

    if tag_ids is not None:
        task.tags = tag_service.resolve_tags(db, user.id, tag_ids)

    if task.status == TaskStatus.DONE.value and previous_status != TaskStatus.DONE.value:
        task.completed_at = utcnow()
        activity_log.log(
            db,
            user_id=user.id,
            action="completed",
            entity_type=EntityType.TASK,
            entity_id=task.id,
            title=f"Completed task: {task.title}",
        )
    elif task.status != TaskStatus.DONE.value and previous_status == TaskStatus.DONE.value:
        task.completed_at = None

    db.flush()
    return TaskRead.model_validate(task)


@router.post("/{task_id}/complete", response_model=TaskRead)
def complete_task(task_id: str, db: DbSession, user: CurrentUser) -> TaskRead:
    task = _get_task(db, user.id, task_id)
    if task.status != TaskStatus.DONE.value:
        task.status = TaskStatus.DONE.value
        task.completed_at = utcnow()
        activity_log.log(
            db,
            user_id=user.id,
            action="completed",
            entity_type=EntityType.TASK,
            entity_id=task.id,
            title=f"Completed task: {task.title}",
        )
        db.flush()
    return TaskRead.model_validate(task)


@router.post("/{task_id}/reopen", response_model=TaskRead)
def reopen_task(task_id: str, db: DbSession, user: CurrentUser) -> TaskRead:
    task = _get_task(db, user.id, task_id)
    task.status = TaskStatus.TODO.value
    task.completed_at = None
    db.flush()
    return TaskRead.model_validate(task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_task(task_id: str, db: DbSession, user: CurrentUser) -> None:
    task = _get_task(db, user.id, task_id)
    title = task.title
    db.delete(task)
    db.flush()
    activity_log.log(
        db,
        user_id=user.id,
        action="deleted",
        entity_type=EntityType.TASK,
        entity_id=task_id,
        title=f"Deleted task: {title}",
    )
