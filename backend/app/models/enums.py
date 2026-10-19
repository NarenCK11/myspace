"""String enums shared by models and schemas.

Stored as VARCHAR rather than native PostgreSQL enums so that adding a value
never requires a type-altering migration.
"""

from __future__ import annotations

from enum import StrEnum


class TaskStatus(StrEnum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


class Priority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class ReminderStatus(StrEnum):
    PENDING = "pending"
    DONE = "done"
    DISMISSED = "dismissed"


class RepeatRule(StrEnum):
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class ActivitySource(StrEnum):
    MANUAL = "manual"
    SYSTEM = "system"


class EntityType(StrEnum):
    TASK = "task"
    REMINDER = "reminder"
    NOTE = "note"
    ACTIVITY = "activity"
    TAG = "tag"
    GOOGLE_EVENT = "google_event"


class Theme(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class MealType(StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    DINNER = "dinner"
    SNACK = "snack"
    DRINK = "drink"
    OTHER = "other"


class LabelTone(StrEnum):
    """How a food label reads when summarising a day.

    ``good`` and ``bad`` drive the healthy/unhealthy split in summaries;
    ``neutral`` labels (carbs, fatty, ...) describe a meal without judging it.
    """

    GOOD = "good"
    BAD = "bad"
    NEUTRAL = "neutral"
