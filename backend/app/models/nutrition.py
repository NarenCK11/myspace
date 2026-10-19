"""Meal tracking: food labels, meals and the daily weight log."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import (
    Column,
    Date,
    Float,
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
from app.models.enums import LabelTone, MealType

meal_labels = Table(
    "meal_labels",
    Base.metadata,
    Column("meal_id", String(36), ForeignKey("meals.id", ondelete="CASCADE"), primary_key=True),
    Column(
        "label_id", String(36), ForeignKey("food_labels.id", ondelete="CASCADE"), primary_key=True
    ),
)


class FoodLabel(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A label applied to meals (healthy, unhealthy, protein, ...).

    Kept separate from the general-purpose tags: these carry a tone that the
    daily summaries use, and mixing them into the tag list would clutter every
    tag picker in the app.
    """

    __tablename__ = "food_labels"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_food_labels_user_name"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(40), nullable=False)
    color: Mapped[str] = mapped_column(String(16), nullable=False, default="slate")
    tone: Mapped[str] = mapped_column(String(10), nullable=False, default=LabelTone.NEUTRAL.value)


class Meal(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """One manually entered item eaten or drunk."""

    __tablename__ = "meals"
    __table_args__ = (Index("ix_meals_user_eaten", "user_id", "eaten_at"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    meal_type: Mapped[str] = mapped_column(String(16), nullable=False, default=MealType.OTHER.value)
    eaten_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    portion: Mapped[str | None] = mapped_column(String(100), nullable=True)
    calories: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    labels: Mapped[list[FoodLabel]] = relationship(secondary=meal_labels, lazy="selectin")


class WeightEntry(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Body weight for one calendar day, stored in kilograms.

    ``logged_on`` is a plain date in the owner's own timezone, so a weigh-in
    at 06:30 local stays on that day no matter where the server runs.
    """

    __tablename__ = "weight_entries"
    __table_args__ = (UniqueConstraint("user_id", "logged_on", name="uq_weight_entries_user_day"),)

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    logged_on: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    weight_kg: Mapped[float] = mapped_column(Float, nullable=False)
    note: Mapped[str | None] = mapped_column(String(500), nullable=True)
