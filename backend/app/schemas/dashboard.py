"""Dashboard and global search response schemas."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, Field

from app.schemas.calendar import CalendarItem
from app.schemas.content import ActivityRead, NoteRead, ReminderRead, TaskRead, TaskStats
from app.schemas.nutrition import NutritionDashboard


class DashboardCounts(BaseModel):
    tasks_open: int
    tasks_due_today: int
    tasks_overdue: int
    tasks_completed_today: int
    tasks_completed_this_week: int
    reminders_pending: int
    reminders_today: int
    notes_total: int
    activities_today: int
    events_today: int


class DashboardResponse(BaseModel):
    server_time: dt.datetime
    timezone: str
    today: dt.date
    greeting_name: str
    counts: DashboardCounts
    task_stats: TaskStats
    today_tasks: list[TaskRead] = Field(default_factory=list)
    overdue_tasks: list[TaskRead] = Field(default_factory=list)
    upcoming_tasks: list[TaskRead] = Field(default_factory=list)
    today_events: list[CalendarItem] = Field(default_factory=list)
    upcoming_reminders: list[ReminderRead] = Field(default_factory=list)
    recent_activities: list[ActivityRead] = Field(default_factory=list)
    important_notes: list[NoteRead] = Field(default_factory=list)
    google_connected: bool = False
    google_configured: bool = False
    nutrition: NutritionDashboard | None = None
    completion_rate: float = 0.0
    streak_days: int = 0


class TodayResponse(BaseModel):
    date: dt.date
    timezone: str
    google_connected: bool = False
    google_configured: bool = False
    tasks: list[TaskRead] = Field(default_factory=list)
    overdue_tasks: list[TaskRead] = Field(default_factory=list)
    reminders: list[ReminderRead] = Field(default_factory=list)
    events: list[CalendarItem] = Field(default_factory=list)
    activities: list[ActivityRead] = Field(default_factory=list)
    completed_tasks: list[TaskRead] = Field(default_factory=list)


class SearchHit(BaseModel):
    id: str
    kind: str
    title: str
    snippet: str | None = None
    occurred_at: dt.datetime | None = None
    url: str
    status: str | None = None
    tags: list[str] = Field(default_factory=list)


class SearchResponse(BaseModel):
    query: str
    total: int
    counts: dict[str, int]
    hits: list[SearchHit]
