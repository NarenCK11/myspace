"""Reminder CRUD, completion, dismissal and snoozing."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import NotFoundError
from app.db.base import utcnow
from app.models.content import Reminder, reminder_tags
from app.models.enums import EntityType, ReminderStatus, RepeatRule
from app.schemas.common import Page
from app.schemas.content import ReminderCreate, ReminderRead, ReminderUpdate, SnoozeRequest
from app.services import activity_log, timeutil
from app.services import tags as tag_service

router = APIRouter(prefix="/reminders", tags=["reminders"])

ReminderView = Literal["all", "upcoming", "today", "overdue", "completed"]

_REPEAT_DELTAS = {
    RepeatRule.DAILY.value: dt.timedelta(days=1),
    RepeatRule.WEEKLY.value: dt.timedelta(weeks=1),
}


def _get_reminder(db, user_id: str, reminder_id: str) -> Reminder:
    row = db.get(Reminder, reminder_id)
    if row is None or row.user_id != user_id:
        raise NotFoundError("Reminder not found.")
    return row


def _next_occurrence(current: dt.datetime, rule: str) -> dt.datetime | None:
    if rule in _REPEAT_DELTAS:
        return current + _REPEAT_DELTAS[rule]
    if rule == RepeatRule.MONTHLY.value:
        month = current.month + 1
        year = current.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(current.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28,
                                31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return current.replace(year=year, month=month, day=day)
    if rule == RepeatRule.YEARLY.value:
        try:
            return current.replace(year=current.year + 1)
        except ValueError:  # 29 Feb on a non-leap year
            return current.replace(year=current.year + 1, day=28)
    return None


@router.get("", response_model=Page[ReminderRead])
def list_reminders(
    db: DbSession,
    user: CurrentUser,
    view: ReminderView = "all",
    status_filter: Annotated[list[ReminderStatus] | None, Query(alias="status")] = None,
    tag_id: Annotated[list[str] | None, Query()] = None,
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[ReminderRead]:
    conditions = [Reminder.user_id == user.id]
    now = utcnow()
    today = timeutil.local_now(user.timezone).date()
    day_start, day_end = timeutil.day_bounds(today, user.timezone)

    if view == "upcoming":
        conditions += [Reminder.status == ReminderStatus.PENDING.value, Reminder.remind_at >= now]
    elif view == "today":
        conditions += [Reminder.remind_at >= day_start, Reminder.remind_at < day_end]
    elif view == "overdue":
        conditions += [Reminder.status == ReminderStatus.PENDING.value, Reminder.remind_at < now]
    elif view == "completed":
        conditions.append(Reminder.status == ReminderStatus.DONE.value)

    if status_filter:
        conditions.append(Reminder.status.in_([s.value for s in status_filter]))
    if q:
        pattern = f"%{q.strip()}%"
        conditions.append(or_(Reminder.title.ilike(pattern), Reminder.notes.ilike(pattern)))
    if tag_id:
        conditions.append(
            Reminder.id.in_(
                select(reminder_tags.c.reminder_id).where(reminder_tags.c.tag_id.in_(tag_id))
            )
        )

    ascending = view in ("upcoming", "today", "all")
    order_by = Reminder.remind_at.asc() if ascending else Reminder.remind_at.desc()

    total = int(db.execute(select(func.count()).select_from(Reminder).where(*conditions)).scalar_one())
    rows = list(
        db.execute(
            select(Reminder).where(*conditions).order_by(order_by).limit(limit).offset(offset)
        ).scalars()
    )
    return Page[ReminderRead](
        items=[ReminderRead.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(rows) < total,
    )


@router.post("", response_model=ReminderRead, status_code=status.HTTP_201_CREATED)
def create_reminder(payload: ReminderCreate, db: DbSession, user: CurrentUser) -> ReminderRead:
    reminder = Reminder(
        user_id=user.id,
        title=payload.title,
        notes=payload.notes,
        remind_at=payload.remind_at,
        repeat_rule=payload.repeat_rule.value,
    )
    reminder.tags = tag_service.resolve_tags(db, user.id, payload.tag_ids)
    db.add(reminder)
    db.flush()
    activity_log.log(
        db,
        user_id=user.id,
        action="created",
        entity_type=EntityType.REMINDER,
        entity_id=reminder.id,
        title=f"Created reminder: {reminder.title}",
    )
    return ReminderRead.model_validate(reminder)


@router.get("/{reminder_id}", response_model=ReminderRead)
def get_reminder(reminder_id: str, db: DbSession, user: CurrentUser) -> ReminderRead:
    return ReminderRead.model_validate(_get_reminder(db, user.id, reminder_id))


@router.patch("/{reminder_id}", response_model=ReminderRead)
def update_reminder(
    reminder_id: str, payload: ReminderUpdate, db: DbSession, user: CurrentUser
) -> ReminderRead:
    reminder = _get_reminder(db, user.id, reminder_id)
    data = payload.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)

    for key in ("status", "repeat_rule"):
        if key in data and data[key] is not None:
            data[key] = data[key].value

    for field, value in data.items():
        setattr(reminder, field, value)

    if tag_ids is not None:
        reminder.tags = tag_service.resolve_tags(db, user.id, tag_ids)

    if reminder.status == ReminderStatus.DONE.value and reminder.completed_at is None:
        reminder.completed_at = utcnow()
    if reminder.status == ReminderStatus.PENDING.value:
        reminder.completed_at = None

    db.flush()
    return ReminderRead.model_validate(reminder)


@router.post("/{reminder_id}/complete", response_model=ReminderRead)
def complete_reminder(reminder_id: str, db: DbSession, user: CurrentUser) -> ReminderRead:
    reminder = _get_reminder(db, user.id, reminder_id)
    now = utcnow()
    next_at = _next_occurrence(reminder.remind_at, reminder.repeat_rule)

    if next_at is not None:
        # Repeating reminders roll forward instead of closing out.
        reminder.remind_at = next_at
        reminder.snoozed_until = None
        reminder.status = ReminderStatus.PENDING.value
        reminder.completed_at = None
    else:
        reminder.status = ReminderStatus.DONE.value
        reminder.completed_at = now
        reminder.snoozed_until = None

    activity_log.log(
        db,
        user_id=user.id,
        action="completed",
        entity_type=EntityType.REMINDER,
        entity_id=reminder.id,
        title=f"Completed reminder: {reminder.title}",
    )
    db.flush()
    return ReminderRead.model_validate(reminder)


@router.post("/{reminder_id}/dismiss", response_model=ReminderRead)
def dismiss_reminder(reminder_id: str, db: DbSession, user: CurrentUser) -> ReminderRead:
    reminder = _get_reminder(db, user.id, reminder_id)
    reminder.status = ReminderStatus.DISMISSED.value
    reminder.snoozed_until = None
    db.flush()
    return ReminderRead.model_validate(reminder)


@router.post("/{reminder_id}/snooze", response_model=ReminderRead)
def snooze_reminder(
    reminder_id: str, payload: SnoozeRequest, db: DbSession, user: CurrentUser
) -> ReminderRead:
    reminder = _get_reminder(db, user.id, reminder_id)
    reminder.snoozed_until = utcnow() + dt.timedelta(minutes=payload.minutes)
    reminder.status = ReminderStatus.PENDING.value
    db.flush()
    return ReminderRead.model_validate(reminder)


@router.delete("/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_reminder(reminder_id: str, db: DbSession, user: CurrentUser) -> None:
    reminder = _get_reminder(db, user.id, reminder_id)
    title = reminder.title
    db.delete(reminder)
    db.flush()
    activity_log.log(
        db,
        user_id=user.id,
        action="deleted",
        entity_type=EntityType.REMINDER,
        entity_id=reminder_id,
        title=f"Deleted reminder: {title}",
    )
