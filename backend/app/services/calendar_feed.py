"""Unified calendar feed: Google events + tasks + reminders + activities."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.content import Activity, Reminder, Task
from app.models.google import GoogleCalendar
from app.schemas.calendar import CalendarItem
from app.services import google_sync

DEFAULT_TASK_DURATION = dt.timedelta(minutes=45)
DEFAULT_REMINDER_DURATION = dt.timedelta(minutes=15)


def _google_items(db: Session, user_id: str, start: dt.datetime, end: dt.datetime) -> list[CalendarItem]:
    events = google_sync.events_between(db, user_id, start, end)
    if not events:
        return []

    names = {
        row.calendar_id: row
        for row in db.execute(
            select(GoogleCalendar).where(GoogleCalendar.user_id == user_id)
        ).scalars()
    }

    items = []
    for event in events:
        calendar = names.get(event.calendar_id)
        items.append(
            CalendarItem(
                id=f"google:{event.id}",
                kind="google_event",
                title=event.summary,
                description=event.description,
                start_at=event.start_at,
                end_at=event.end_at,
                all_day=event.all_day,
                location=event.location,
                url=event.html_link,
                color=(calendar.background_color if calendar else None) or "#4285F4",
                status=event.status,
                calendar_id=event.calendar_id,
                calendar_name=calendar.summary if calendar else event.calendar_id,
                source_id=event.id,
            )
        )
    return items


def _task_items(db: Session, user_id: str, start: dt.datetime, end: dt.datetime) -> list[CalendarItem]:
    stmt = select(Task).where(
        Task.user_id == user_id,
        Task.due_at.is_not(None),
        Task.due_at >= start,
        Task.due_at < end,
    )
    items = []
    for task in db.execute(stmt).scalars():
        task_start = task.start_at or task.due_at
        task_end = task.due_at or (task_start + DEFAULT_TASK_DURATION)
        if task_end < task_start:
            task_start, task_end = task_end, task_start
        if task_start == task_end:
            task_start = task_end - DEFAULT_TASK_DURATION
        items.append(
            CalendarItem(
                id=f"task:{task.id}",
                kind="task",
                title=task.title,
                description=task.description,
                start_at=task_start,
                end_at=task_end,
                all_day=task.all_day,
                status=task.status,
                color="#6366f1",
                source_id=task.id,
            )
        )
    return items


def _reminder_items(db: Session, user_id: str, start: dt.datetime, end: dt.datetime) -> list[CalendarItem]:
    stmt = select(Reminder).where(
        Reminder.user_id == user_id,
        Reminder.remind_at >= start,
        Reminder.remind_at < end,
    )
    items = []
    for reminder in db.execute(stmt).scalars():
        at = reminder.snoozed_until or reminder.remind_at
        items.append(
            CalendarItem(
                id=f"reminder:{reminder.id}",
                kind="reminder",
                title=reminder.title,
                description=reminder.notes,
                start_at=at,
                end_at=at + DEFAULT_REMINDER_DURATION,
                status=reminder.status,
                color="#f59e0b",
                source_id=reminder.id,
            )
        )
    return items


def _activity_items(db: Session, user_id: str, start: dt.datetime, end: dt.datetime) -> list[CalendarItem]:
    from app.models.enums import ActivitySource

    stmt = select(Activity).where(
        Activity.user_id == user_id,
        Activity.source == ActivitySource.MANUAL.value,
        Activity.occurred_at >= start,
        Activity.occurred_at < end,
    )
    items = []
    for activity in db.execute(stmt).scalars():
        duration = dt.timedelta(minutes=activity.duration_minutes or 30)
        items.append(
            CalendarItem(
                id=f"activity:{activity.id}",
                kind="activity",
                title=activity.title,
                description=activity.description,
                start_at=activity.occurred_at,
                end_at=activity.occurred_at + duration,
                color="#10b981",
                source_id=activity.id,
            )
        )
    return items


def build_feed(
    db: Session,
    user_id: str,
    start: dt.datetime,
    end: dt.datetime,
    *,
    kinds: set[str] | None = None,
) -> list[CalendarItem]:
    wanted = kinds or {"google_event", "task", "reminder", "activity"}
    items: list[CalendarItem] = []
    if "google_event" in wanted:
        items += _google_items(db, user_id, start, end)
    if "task" in wanted:
        items += _task_items(db, user_id, start, end)
    if "reminder" in wanted:
        items += _reminder_items(db, user_id, start, end)
    if "activity" in wanted:
        items += _activity_items(db, user_id, start, end)
    items.sort(key=lambda i: (i.start_at, i.title.lower()))
    return items
