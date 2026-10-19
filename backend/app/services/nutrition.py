"""Meal tracking logic: labels, per-day summaries, history and weight stats."""

from __future__ import annotations

import datetime as dt
from collections import Counter
from collections.abc import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.enums import LabelTone
from app.models.nutrition import FoodLabel, Meal, WeightEntry
from app.models.user import User
from app.schemas.nutrition import (
    DaySummary,
    LabelCount,
    NutritionDay,
    NutritionHistory,
    WeightStats,
)
from app.services import timeutil

# (name, colour, tone). Created once per account, on first use.
DEFAULT_LABELS: tuple[tuple[str, str, LabelTone], ...] = (
    ("Healthy", "emerald", LabelTone.GOOD),
    ("Unhealthy", "rose", LabelTone.BAD),
    ("Protein", "sky", LabelTone.GOOD),
    ("Fibre", "teal", LabelTone.GOOD),
    ("Fatty", "amber", LabelTone.NEUTRAL),
    ("Carbs", "slate", LabelTone.NEUTRAL),
    ("Sugary", "violet", LabelTone.BAD),
    ("Fried", "orange", LabelTone.BAD),
)

SUGGESTION_LOOKBACK = 300


# --- Labels ----------------------------------------------------------------


def ensure_default_labels(db: Session, user: User) -> None:
    """Create the starter labels the first time meal tracking is used.

    A flag on the user (rather than "no labels exist") stops labels that were
    deliberately deleted from coming back.
    """
    if user.food_labels_seeded:
        return
    existing = {
        name.lower()
        for name in db.execute(select(FoodLabel.name).where(FoodLabel.user_id == user.id)).scalars()
    }
    for name, color, tone in DEFAULT_LABELS:
        if name.lower() not in existing:
            db.add(FoodLabel(user_id=user.id, name=name, color=color, tone=tone.value))
    user.food_labels_seeded = True
    db.flush()


def resolve_labels(db: Session, user_id: str, label_ids: list[str] | None) -> list[FoodLabel]:
    """Load labels by id, rejecting any id that does not belong to this user."""
    if not label_ids:
        return []
    unique = list(dict.fromkeys(label_ids))
    rows = list(
        db.execute(
            select(FoodLabel).where(FoodLabel.user_id == user_id, FoodLabel.id.in_(unique))
        ).scalars()
    )
    if len(rows) != len(unique):
        found = {row.id for row in rows}
        missing = [i for i in unique if i not in found]
        raise NotFoundError(f"Unknown label id(s): {', '.join(missing)}")
    order = {label_id: index for index, label_id in enumerate(unique)}
    return sorted(rows, key=lambda row: order[row.id])


# --- Classification --------------------------------------------------------


def classify(meal: Meal) -> str:
    """Bucket a meal as good, bad, mixed or neutral from its label tones.

    Mixed means it carries both a good and a bad label (a burger with a side
    salad), which is more honest than letting either tone win.
    """
    tones = {label.tone for label in meal.labels}
    has_good = LabelTone.GOOD.value in tones
    has_bad = LabelTone.BAD.value in tones
    if has_good and has_bad:
        return "mixed"
    if has_good:
        return "good"
    if has_bad:
        return "bad"
    return "neutral"


def _label_counts(meals: Iterable[Meal]) -> list[LabelCount]:
    counts: Counter[str] = Counter()
    seen: dict[str, FoodLabel] = {}
    for meal in meals:
        for label in meal.labels:
            counts[label.id] += 1
            seen[label.id] = label
    rows = [
        LabelCount(
            label_id=label_id,
            name=seen[label_id].name,
            color=seen[label_id].color,
            tone=seen[label_id].tone,
            count=count,
        )
        for label_id, count in counts.items()
    ]
    return sorted(rows, key=lambda row: (-row.count, row.name.lower()))


def _tally(meals: Iterable[Meal]) -> dict[str, int]:
    buckets = Counter(classify(meal) for meal in meals)
    return {
        "good_count": buckets["good"],
        "mixed_count": buckets["mixed"],
        "bad_count": buckets["bad"],
        "neutral_count": buckets["neutral"],
    }


# --- Day summary -----------------------------------------------------------


def meals_between(db: Session, user_id: str, start: dt.datetime, end: dt.datetime) -> list[Meal]:
    return list(
        db.execute(
            select(Meal)
            .where(Meal.user_id == user_id, Meal.eaten_at >= start, Meal.eaten_at < end)
            .order_by(Meal.eaten_at.asc())
        ).scalars()
    )


def day_summary(db: Session, user: User, day: dt.date) -> DaySummary:
    start, end = timeutil.day_bounds(day, user.timezone)
    meals = meals_between(db, user.id, start, end)
    with_calories = [meal.calories for meal in meals if meal.calories is not None]
    weight = db.execute(
        select(WeightEntry.weight_kg).where(
            WeightEntry.user_id == user.id, WeightEntry.logged_on == day
        )
    ).scalar_one_or_none()

    return DaySummary(
        date=day,
        meals_count=len(meals),
        calories_total=sum(with_calories),
        calories_logged_count=len(with_calories),
        label_counts=_label_counts(meals),
        weight_kg=weight,
        **_tally(meals),
    )


# --- History ---------------------------------------------------------------


def history(db: Session, user: User, start_day: dt.date, end_day: dt.date) -> NutritionHistory:
    tz = timeutil.get_tz(user.timezone)
    start, end = timeutil.range_bounds(start_day, end_day, user.timezone)
    meals = meals_between(db, user.id, start, end)

    by_day: dict[dt.date, list[Meal]] = {}
    for meal in meals:
        by_day.setdefault(meal.eaten_at.astimezone(tz).date(), []).append(meal)

    weights = {
        row.logged_on: row.weight_kg
        for row in db.execute(
            select(WeightEntry).where(
                WeightEntry.user_id == user.id,
                WeightEntry.logged_on >= start_day,
                WeightEntry.logged_on <= end_day,
            )
        ).scalars()
    }

    days: list[NutritionDay] = []
    cursor = start_day
    while cursor <= end_day:
        day_meals = by_day.get(cursor, [])
        days.append(
            NutritionDay(
                date=cursor,
                meals_count=len(day_meals),
                calories_total=sum(m.calories or 0 for m in day_meals),
                weight_kg=weights.get(cursor),
                **_tally(day_meals),
            )
        )
        cursor += dt.timedelta(days=1)

    return NutritionHistory(
        start=start_day,
        end=end_day,
        days=days,
        label_totals=_label_counts(meals),
        days_with_meals=sum(1 for d in days if d.meals_count),
        meals_count=len(meals),
        **_tally(meals),
    )


# --- Weight ----------------------------------------------------------------


def _change(latest: WeightEntry, baseline: WeightEntry | None) -> float | None:
    if baseline is None:
        return None
    return round(latest.weight_kg - baseline.weight_kg, 2)


def weight_stats(db: Session, user: User) -> WeightStats:
    """Headline numbers for the weight log.

    Windows are measured back from the most recent entry rather than from
    today, so a few missed days do not blank the stats. A change over N days is
    the latest weight minus the oldest entry inside that window.
    """
    recent = list(
        db.execute(
            select(WeightEntry)
            .where(WeightEntry.user_id == user.id)
            .order_by(WeightEntry.logged_on.desc())
            .limit(2)
        ).scalars()
    )
    if not recent:
        return WeightStats()

    latest = recent[0]
    previous = recent[1] if len(recent) > 1 else None
    today = timeutil.local_today(user.timezone)

    def window(days: int) -> list[WeightEntry]:
        return list(
            db.execute(
                select(WeightEntry)
                .where(
                    WeightEntry.user_id == user.id,
                    WeightEntry.logged_on >= latest.logged_on - dt.timedelta(days=days),
                    WeightEntry.logged_on < latest.logged_on,
                )
                .order_by(WeightEntry.logged_on.asc())
            ).scalars()
        )

    week = window(7)
    month = window(30)
    cutoff = latest.logged_on - dt.timedelta(days=7)
    last_week = [e.weight_kg for e in week if e.logged_on > cutoff] + [latest.weight_kg]

    low, high, total = db.execute(
        select(
            func.min(WeightEntry.weight_kg), func.max(WeightEntry.weight_kg), func.count()
        ).where(WeightEntry.user_id == user.id)
    ).one()

    return WeightStats(
        latest=latest,
        previous=previous,
        logged_today=latest.logged_on == today,
        entries_count=int(total),
        change_since_previous=_change(latest, previous),
        average_7d=round(sum(last_week) / len(last_week), 2),
        change_7d=_change(latest, week[0] if week else None),
        change_30d=_change(latest, month[0] if month else None),
        min_kg=low,
        max_kg=high,
    )


# --- Suggestions -----------------------------------------------------------


def suggestions(db: Session, user_id: str, limit: int = 8) -> list[dict]:
    """Most-logged recent items, for one-tap re-logging. Newest details win."""
    meals = list(
        db.execute(
            select(Meal)
            .where(Meal.user_id == user_id)
            .order_by(Meal.eaten_at.desc())
            .limit(SUGGESTION_LOOKBACK)
        ).scalars()
    )
    grouped: dict[str, dict] = {}
    for meal in meals:  # newest first, so the first sighting carries the latest details
        key = meal.name.strip().lower()
        entry = grouped.get(key)
        if entry is None:
            grouped[key] = {
                "name": meal.name,
                "meal_type": meal.meal_type,
                "portion": meal.portion,
                "calories": meal.calories,
                "times_logged": 1,
                "last_eaten_at": meal.eaten_at,
                "labels": list(meal.labels),
            }
        else:
            entry["times_logged"] += 1

    ranked = sorted(
        grouped.values(),
        key=lambda item: (-item["times_logged"], -item["last_eaten_at"].timestamp()),
    )
    return ranked[:limit]
