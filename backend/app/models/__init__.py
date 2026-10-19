"""SQLAlchemy models. Importing this package registers every table on ``Base``."""

from app.db.base import Base
from app.models.content import (
    Activity,
    Note,
    Reminder,
    Tag,
    Task,
    activity_tags,
    note_tags,
    reminder_tags,
    task_tags,
)
from app.models.enums import (
    ActivitySource,
    EntityType,
    LabelTone,
    MealType,
    Priority,
    ReminderStatus,
    RepeatRule,
    TaskStatus,
    Theme,
)
from app.models.google import CalendarEvent, GoogleAccount, GoogleCalendar, OAuthState
from app.models.nutrition import FoodLabel, Meal, WeightEntry, meal_labels
from app.models.user import LoginAttempt, RefreshSession, User

__all__ = [
    "Activity",
    "ActivitySource",
    "Base",
    "CalendarEvent",
    "EntityType",
    "FoodLabel",
    "LabelTone",
    "Meal",
    "MealType",
    "GoogleAccount",
    "GoogleCalendar",
    "LoginAttempt",
    "Note",
    "OAuthState",
    "Priority",
    "RefreshSession",
    "Reminder",
    "ReminderStatus",
    "RepeatRule",
    "Tag",
    "Task",
    "TaskStatus",
    "Theme",
    "User",
    "WeightEntry",
    "activity_tags",
    "meal_labels",
    "note_tags",
    "reminder_tags",
    "task_tags",
]
