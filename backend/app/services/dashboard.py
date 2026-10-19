"""Dashboard and Today aggregations."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import utcnow
from app.models.content import Activity, Note, Reminder, Task
from app.models.enums import ActivitySource, ReminderStatus, TaskStatus
from app.models.user import User
from app.schemas.nutrition import NutritionDashboard
from app.services import calendar_feed, google_sync, nutrition, timeutil

OPEN_STATUSES = (TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value)


def _count(db: Session, stmt) -> int:
    return int(db.execute(stmt).scalar_one())


def _count_tasks(db: Session, user_id: str, *conditions) -> int:
    return _count(
        db, select(func.count()).select_from(Task).where(Task.user_id == user_id, *conditions)
    )


def task_stats(db: Session, user: User, now: dt.datetime | None = None) -> dict:
    now = now or utcnow()
    today = timeutil.local_now(user.timezone).date()
    day_start, day_end = timeutil.day_bounds(today, user.timezone)
    week_start, week_end = timeutil.week_bounds(today, user.timezone, user.week_starts_on)

    return {
        "total": _count_tasks(db, user.id),
        "open": _count_tasks(db, user.id, Task.status.in_(OPEN_STATUSES)),
        "completed_today": _count_tasks(
            db,
            user.id,
            Task.status == TaskStatus.DONE.value,
            Task.completed_at >= day_start,
            Task.completed_at < day_end,
        ),
        "due_today": _count_tasks(
            db,
            user.id,
            Task.status.in_(OPEN_STATUSES),
            Task.due_at >= day_start,
            Task.due_at < day_end,
        ),
        "overdue": _count_tasks(
            db, user.id, Task.status.in_(OPEN_STATUSES), Task.due_at.is_not(None), Task.due_at < now
        ),
        "completed_this_week": _count_tasks(
            db,
            user.id,
            Task.status == TaskStatus.DONE.value,
            Task.completed_at >= week_start,
            Task.completed_at < week_end,
        ),
    }


def _tasks(db: Session, user_id: str, *conditions, order, limit: int) -> list[Task]:
    stmt = select(Task).where(Task.user_id == user_id, *conditions).order_by(*order).limit(limit)
    return list(db.execute(stmt).scalars())


def completion_streak(db: Session, user: User, max_days: int = 60) -> int:
    """Consecutive days (ending today or yesterday) with at least one completion."""
    today = timeutil.local_now(user.timezone).date()
    streak = 0
    for offset in range(max_days):
        day = today - dt.timedelta(days=offset)
        start, end = timeutil.day_bounds(day, user.timezone)
        done = _count_tasks(
            db,
            user.id,
            Task.status == TaskStatus.DONE.value,
            Task.completed_at >= start,
            Task.completed_at < end,
        )
        if done > 0:
            streak += 1
        elif offset == 0:
            continue  # today may simply not be finished yet
        else:
            break
    return streak


def build_dashboard(db: Session, user: User) -> dict:
    now = utcnow()
    tz = user.timezone
    today = timeutil.local_now(tz).date()
    day_start, day_end = timeutil.day_bounds(today, tz)
    stats = task_stats(db, user, now)

    today_tasks = _tasks(
        db,
        user.id,
        Task.status.in_(OPEN_STATUSES),
        Task.due_at >= day_start,
        Task.due_at < day_end,
        order=(Task.due_at.asc(),),
        limit=25,
    )
    overdue_tasks = _tasks(
        db,
        user.id,
        Task.status.in_(OPEN_STATUSES),
        Task.due_at.is_not(None),
        Task.due_at < now,
        order=(Task.due_at.asc(),),
        limit=25,
    )
    upcoming_tasks = _tasks(
        db,
        user.id,
        Task.status.in_(OPEN_STATUSES),
        Task.due_at >= day_end,
        Task.due_at < day_end + dt.timedelta(days=7),
        order=(Task.due_at.asc(),),
        limit=15,
    )

    events = calendar_feed.build_feed(
        db, user.id, day_start, day_end, kinds={"google_event"}
    )

    reminders = list(
        db.execute(
            select(Reminder)
            .where(
                Reminder.user_id == user.id,
                Reminder.status == ReminderStatus.PENDING.value,
                Reminder.remind_at < day_end + dt.timedelta(days=7),
            )
            .order_by(Reminder.remind_at.asc())
            .limit(15)
        ).scalars()
    )

    recent_activities = list(
        db.execute(
            select(Activity)
            .where(Activity.user_id == user.id)
            .order_by(Activity.occurred_at.desc())
            .limit(12)
        ).scalars()
    )

    important_notes = list(
        db.execute(
            select(Note)
            .where(Note.user_id == user.id, Note.is_archived.is_(False))
            .order_by(
                Note.is_important.desc(), Note.is_pinned.desc(), Note.updated_at.desc()
            )
            .limit(6)
        ).scalars()
    )

    counts = {
        "tasks_open": stats["open"],
        "tasks_due_today": stats["due_today"],
        "tasks_overdue": stats["overdue"],
        "tasks_completed_today": stats["completed_today"],
        "tasks_completed_this_week": stats["completed_this_week"],
        "reminders_pending": _count(
            db,
            select(func.count())
            .select_from(Reminder)
            .where(Reminder.user_id == user.id, Reminder.status == ReminderStatus.PENDING.value),
        ),
        "reminders_today": _count(
            db,
            select(func.count())
            .select_from(Reminder)
            .where(
                Reminder.user_id == user.id,
                Reminder.remind_at >= day_start,
                Reminder.remind_at < day_end,
            ),
        ),
        "notes_total": _count(
            db,
            select(func.count())
            .select_from(Note)
            .where(Note.user_id == user.id, Note.is_archived.is_(False)),
        ),
        "activities_today": _count(
            db,
            select(func.count())
            .select_from(Activity)
            .where(
                Activity.user_id == user.id,
                Activity.occurred_at >= day_start,
                Activity.occurred_at < day_end,
            ),
        ),
        "events_today": len(events),
    }

    finished = stats["completed_today"]
    planned = finished + stats["due_today"]
    completion_rate = round(finished / planned, 3) if planned else 0.0

    return {
        "server_time": now,
        "timezone": tz,
        "today": today,
        "greeting_name": user.display_name,
        "counts": counts,
        "task_stats": stats,
        "today_tasks": today_tasks,
        "overdue_tasks": overdue_tasks,
        "upcoming_tasks": upcoming_tasks,
        "today_events": events,
        "upcoming_reminders": reminders,
        "recent_activities": recent_activities,
        "important_notes": important_notes,
        "google_connected": google_sync.get_account(db, user.id) is not None,
        "google_configured": settings.google_configured,
        "nutrition": NutritionDashboard(
            today=nutrition.day_summary(db, user, today),
            weight=nutrition.weight_stats(db, user),
        ),
        "completion_rate": completion_rate,
        "streak_days": completion_streak(db, user),
    }


def build_today(db: Session, user: User, day: dt.date | None = None) -> dict:
    tz = user.timezone
    target = day or timeutil.local_now(tz).date()
    day_start, day_end = timeutil.day_bounds(target, tz)
    now = utcnow()

    tasks = _tasks(
        db,
        user.id,
        Task.status.in_(OPEN_STATUSES),
        Task.due_at >= day_start,
        Task.due_at < day_end,
        order=(Task.due_at.asc(), Task.sort_order.asc()),
        limit=200,
    )
    completed = _tasks(
        db,
        user.id,
        Task.status == TaskStatus.DONE.value,
        Task.completed_at >= day_start,
        Task.completed_at < day_end,
        order=(Task.completed_at.desc(),),
        limit=200,
    )
    overdue = _tasks(
        db,
        user.id,
        Task.status.in_(OPEN_STATUSES),
        Task.due_at.is_not(None),
        Task.due_at < min(now, day_start),
        order=(Task.due_at.asc(),),
        limit=100,
    )

    reminders = list(
        db.execute(
            select(Reminder)
            .where(
                Reminder.user_id == user.id,
                Reminder.remind_at >= day_start,
                Reminder.remind_at < day_end,
            )
            .order_by(Reminder.remind_at.asc())
        ).scalars()
    )

    activities = list(
        db.execute(
            select(Activity)
            .where(
                Activity.user_id == user.id,
                Activity.source == ActivitySource.MANUAL.value,
                Activity.occurred_at >= day_start,
                Activity.occurred_at < day_end,
            )
            .order_by(Activity.occurred_at.desc())
        ).scalars()
    )

    events = calendar_feed.build_feed(db, user.id, day_start, day_end, kinds={"google_event"})

    return {
        "date": target,
        "timezone": tz,
        "google_connected": google_sync.get_account(db, user.id) is not None,
        "google_configured": settings.google_configured,
        "tasks": tasks,
        "overdue_tasks": overdue,
        "reminders": reminders,
        "events": events,
        "activities": activities,
        "completed_tasks": completed,
    }
