"""Tasks, reminders, notes, activities and the tags that link them."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Boolean,
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import UTCDateTime
from app.models.enums import ActivitySource, Priority, ReminderStatus, RepeatRule, TaskStatus

task_tags = Table(
    "task_tags",
    Base.metadata,
    Column("task_id", String(36), ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

reminder_tags = Table(
    "reminder_tags",
    Base.metadata,
    Column("reminder_id", String(36), ForeignKey("reminders.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

note_tags = Table(
    "note_tags",
    Base.metadata,
    Column("note_id", String(36), ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)

activity_tags = Table(
    "activity_tags",
    Base.metadata,
    Column("activity_id", String(36), ForeignKey("activities.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", String(36), ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A category/label usable across every content type."""

    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_tags_user_name"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="slate")
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Task(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_user_status_due", "user_id", "status", "due_at"),
        Index("ix_tasks_user_created", "user_id", "created_at"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=TaskStatus.TODO.value)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default=Priority.MEDIUM.value)
    due_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)
    start_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completed_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    estimate_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    tags: Mapped[list[Tag]] = relationship(secondary=task_tags, lazy="selectin")

    @property
    def is_open(self) -> bool:
        return self.status in (TaskStatus.TODO.value, TaskStatus.IN_PROGRESS.value)


class Reminder(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reminders"
    __table_args__ = (Index("ix_reminders_user_remind_at", "user_id", "remind_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    remind_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ReminderStatus.PENDING.value
    )
    repeat_rule: Mapped[str] = mapped_column(
        String(16), nullable=False, default=RepeatRule.NONE.value
    )
    completed_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    snoozed_until: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)

    tags: Mapped[list[Tag]] = relationship(secondary=reminder_tags, lazy="selectin")

    @property
    def effective_time(self) -> dt.datetime:
        return self.snoozed_until or self.remind_at


class Note(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "notes"
    __table_args__ = (Index("ix_notes_user_updated", "user_id", "updated_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_important: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="default")

    tags: Mapped[list[Tag]] = relationship(secondary=note_tags, lazy="selectin")


class Activity(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Daily activity log, doubling as the personal history feed.

    Rows with ``source='system'`` are written automatically when content is
    created/completed/deleted; ``source='manual'`` rows are entries the owner
    logs themselves.
    """

    __tablename__ = "activities"
    __table_args__ = (Index("ix_activities_user_occurred", "user_id", "occurred_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(
        String(16), nullable=False, default=ActivitySource.MANUAL.value
    )
    action: Mapped[str | None] = mapped_column(String(32), nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(36), nullable=True)

    tags: Mapped[list[Tag]] = relationship(secondary=activity_tags, lazy="selectin")
