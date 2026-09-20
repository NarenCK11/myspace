"""Schemas for tasks, reminders, notes and activities."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ActivitySource, Priority, ReminderStatus, RepeatRule, TaskStatus
from app.schemas.common import ORMModel, TagRead

# --- Tasks -----------------------------------------------------------------


class TaskBase(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=20000)
    status: TaskStatus = TaskStatus.TODO
    priority: Priority = Priority.MEDIUM
    due_at: dt.datetime | None = None
    start_at: dt.datetime | None = None
    all_day: bool = False
    estimate_minutes: int | None = Field(default=None, ge=0, le=100000)


class TaskCreate(TaskBase):
    model_config = ConfigDict(extra="forbid")

    tag_ids: list[str] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=20000)
    status: TaskStatus | None = None
    priority: Priority | None = None
    due_at: dt.datetime | None = None
    start_at: dt.datetime | None = None
    all_day: bool | None = None
    estimate_minutes: int | None = Field(default=None, ge=0, le=100000)
    sort_order: int | None = None
    tag_ids: list[str] | None = None


class TaskRead(ORMModel):
    id: str
    title: str
    description: str | None
    status: str
    priority: str
    due_at: dt.datetime | None
    start_at: dt.datetime | None
    all_day: bool
    completed_at: dt.datetime | None
    estimate_minutes: int | None
    sort_order: int
    created_at: dt.datetime
    updated_at: dt.datetime
    tags: list[TagRead] = Field(default_factory=list)


class TaskStats(BaseModel):
    total: int
    open: int
    completed_today: int
    due_today: int
    overdue: int
    completed_this_week: int


# --- Reminders -------------------------------------------------------------


class ReminderCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=300)
    notes: str | None = Field(default=None, max_length=20000)
    remind_at: dt.datetime
    repeat_rule: RepeatRule = RepeatRule.NONE
    tag_ids: list[str] = Field(default_factory=list)


class ReminderUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)
    notes: str | None = Field(default=None, max_length=20000)
    remind_at: dt.datetime | None = None
    status: ReminderStatus | None = None
    repeat_rule: RepeatRule | None = None
    snoozed_until: dt.datetime | None = None
    tag_ids: list[str] | None = None


class ReminderRead(ORMModel):
    id: str
    title: str
    notes: str | None
    remind_at: dt.datetime
    status: str
    repeat_rule: str
    completed_at: dt.datetime | None
    snoozed_until: dt.datetime | None
    created_at: dt.datetime
    updated_at: dt.datetime
    tags: list[TagRead] = Field(default_factory=list)


class SnoozeRequest(BaseModel):
    minutes: int = Field(default=15, ge=1, le=60 * 24 * 30)


# --- Notes -----------------------------------------------------------------


class NoteCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=300)
    content: str = Field(default="", max_length=200000)
    is_pinned: bool = False
    is_important: bool = False
    color: str = Field(default="default", max_length=16)
    tag_ids: list[str] = Field(default_factory=list)


class NoteUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)
    content: str | None = Field(default=None, max_length=200000)
    is_pinned: bool | None = None
    is_important: bool | None = None
    is_archived: bool | None = None
    color: str | None = Field(default=None, max_length=16)
    tag_ids: list[str] | None = None


class NoteRead(ORMModel):
    id: str
    title: str
    content: str
    is_pinned: bool
    is_important: bool
    is_archived: bool
    color: str
    created_at: dt.datetime
    updated_at: dt.datetime
    tags: list[TagRead] = Field(default_factory=list)


# --- Activities ------------------------------------------------------------


class ActivityCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=20000)
    occurred_at: dt.datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=100000)
    tag_ids: list[str] = Field(default_factory=list)


class ActivityUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, max_length=20000)
    occurred_at: dt.datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=0, le=100000)
    tag_ids: list[str] | None = None


class ActivityRead(ORMModel):
    id: str
    title: str
    description: str | None
    occurred_at: dt.datetime
    duration_minutes: int | None
    source: str
    action: str | None
    entity_type: str | None
    entity_id: str | None
    created_at: dt.datetime
    tags: list[TagRead] = Field(default_factory=list)


class QuickAddRequest(BaseModel):
    """One endpoint behind the global quick-add control."""

    model_config = ConfigDict(extra="forbid")

    kind: str = Field(pattern="^(task|reminder|note|activity)$")
    title: str = Field(min_length=1, max_length=300)
    body: str | None = Field(default=None, max_length=20000)
    when: dt.datetime | None = None
    priority: Priority = Priority.MEDIUM
    tag_ids: list[str] = Field(default_factory=list)


class QuickAddResponse(BaseModel):
    kind: str
    id: str
    title: str


ACTIVITY_SOURCES = tuple(s.value for s in ActivitySource)
