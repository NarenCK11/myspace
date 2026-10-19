"""Global search across tasks, notes, reminders, activities and cached events."""

from __future__ import annotations

import re

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.models.content import Activity, Note, Reminder, Tag, Task
from app.models.google import CalendarEvent
from app.models.nutrition import Meal
from app.schemas.dashboard import SearchHit

SNIPPET_RADIUS = 90

# LIKE escape character. "!" is used instead of a backslash so the pattern is
# portable across PostgreSQL and SQLite without extra quoting rules.
ESCAPE_CHAR = "!"

ALL_KINDS = ("task", "note", "reminder", "activity", "meal", "event", "tag")


def _snippet(text: str | None, query: str) -> str | None:
    if not text:
        return None
    flat = re.sub(r"\s+", " ", text).strip()
    if not flat:
        return None
    idx = flat.lower().find(query.lower())
    if idx < 0:
        cut = SNIPPET_RADIUS * 2
        return flat[:cut] + ("..." if len(flat) > cut else "")
    start = max(0, idx - SNIPPET_RADIUS // 2)
    end = min(len(flat), idx + len(query) + SNIPPET_RADIUS)
    prefix = "..." if start > 0 else ""
    suffix = "..." if end < len(flat) else ""
    return f"{prefix}{flat[start:end]}{suffix}"


def like_pattern(query: str) -> str:
    escaped = (
        query.replace(ESCAPE_CHAR, ESCAPE_CHAR * 2)
        .replace("%", ESCAPE_CHAR + "%")
        .replace("_", ESCAPE_CHAR + "_")
    )
    return f"%{escaped}%"


def matches(column, pattern: str):
    return column.ilike(pattern, escape=ESCAPE_CHAR)


def _task_hits(db, user_id, pattern, term, limit):
    rows = db.execute(
        select(Task)
        .where(
            Task.user_id == user_id,
            or_(matches(Task.title, pattern), matches(Task.description, pattern)),
        )
        .order_by(Task.updated_at.desc())
        .limit(limit)
    ).scalars()
    return [
        SearchHit(
            id=t.id,
            kind="task",
            title=t.title,
            snippet=_snippet(t.description, term),
            occurred_at=t.due_at or t.updated_at,
            url=f"/tasks?focus={t.id}",
            status=t.status,
            tags=[tag.name for tag in t.tags],
        )
        for t in rows
    ]


def _note_hits(db, user_id, pattern, term, limit):
    rows = db.execute(
        select(Note)
        .where(
            Note.user_id == user_id,
            or_(matches(Note.title, pattern), matches(Note.content, pattern)),
        )
        .order_by(Note.updated_at.desc())
        .limit(limit)
    ).scalars()
    return [
        SearchHit(
            id=n.id,
            kind="note",
            title=n.title,
            snippet=_snippet(n.content, term),
            occurred_at=n.updated_at,
            url=f"/notes?focus={n.id}",
            status="archived" if n.is_archived else None,
            tags=[tag.name for tag in n.tags],
        )
        for n in rows
    ]


def _reminder_hits(db, user_id, pattern, term, limit):
    rows = db.execute(
        select(Reminder)
        .where(
            Reminder.user_id == user_id,
            or_(matches(Reminder.title, pattern), matches(Reminder.notes, pattern)),
        )
        .order_by(Reminder.remind_at.desc())
        .limit(limit)
    ).scalars()
    return [
        SearchHit(
            id=r.id,
            kind="reminder",
            title=r.title,
            snippet=_snippet(r.notes, term),
            occurred_at=r.remind_at,
            url=f"/reminders?focus={r.id}",
            status=r.status,
            tags=[tag.name for tag in r.tags],
        )
        for r in rows
    ]


def _activity_hits(db, user_id, pattern, term, limit):
    rows = db.execute(
        select(Activity)
        .where(
            Activity.user_id == user_id,
            or_(matches(Activity.title, pattern), matches(Activity.description, pattern)),
        )
        .order_by(Activity.occurred_at.desc())
        .limit(limit)
    ).scalars()
    return [
        SearchHit(
            id=a.id,
            kind="activity",
            title=a.title,
            snippet=_snippet(a.description, term),
            occurred_at=a.occurred_at,
            url=f"/activities?focus={a.id}",
            status=a.source,
            tags=[tag.name for tag in a.tags],
        )
        for a in rows
    ]


def _meal_hits(db, user_id, pattern, term, limit):
    rows = db.execute(
        select(Meal)
        .where(
            Meal.user_id == user_id,
            or_(
                matches(Meal.name, pattern),
                matches(Meal.notes, pattern),
                matches(Meal.portion, pattern),
            ),
        )
        .order_by(Meal.eaten_at.desc())
        .limit(limit)
    ).scalars()
    return [
        SearchHit(
            id=m.id,
            kind="meal",
            title=m.name,
            snippet=_snippet(m.notes or m.portion, term),
            occurred_at=m.eaten_at,
            url=f"/meals?day={m.eaten_at.date().isoformat()}&focus={m.id}",
            status=m.meal_type,
            tags=[label.name for label in m.labels],
        )
        for m in rows
    ]


def _event_hits(db, user_id, pattern, term, limit):
    rows = db.execute(
        select(CalendarEvent)
        .where(
            CalendarEvent.user_id == user_id,
            or_(
                matches(CalendarEvent.summary, pattern),
                matches(CalendarEvent.description, pattern),
                matches(CalendarEvent.location, pattern),
            ),
        )
        .order_by(CalendarEvent.start_at.desc())
        .limit(limit)
    ).scalars()
    return [
        SearchHit(
            id=e.id,
            kind="event",
            title=e.summary,
            snippet=_snippet(e.description or e.location, term),
            occurred_at=e.start_at,
            url=f"/calendar?date={e.start_at.date().isoformat()}",
            status=e.status,
        )
        for e in rows
    ]


def _tag_hits(db, user_id, pattern, term, limit):
    rows = db.execute(
        select(Tag)
        .where(Tag.user_id == user_id, matches(Tag.name, pattern))
        .order_by(Tag.name.asc())
        .limit(limit)
    ).scalars()
    return [
        SearchHit(
            id=t.id,
            kind="tag",
            title=t.name,
            snippet=t.description,
            occurred_at=t.created_at,
            url=f"/search?q={t.name}",
        )
        for t in rows
    ]


_HANDLERS = {
    "task": _task_hits,
    "note": _note_hits,
    "reminder": _reminder_hits,
    "activity": _activity_hits,
    "meal": _meal_hits,
    "event": _event_hits,
    "tag": _tag_hits,
}


def search(
    db: Session, user_id: str, query: str, *, limit: int = 20, kinds: set[str] | None = None
) -> dict:
    """Case-insensitive substring search, most recent first within each kind."""
    term = query.strip()
    if not term:
        return {"query": query, "total": 0, "counts": {}, "hits": []}

    pattern = like_pattern(term)
    wanted = [k for k in ALL_KINDS if k in (kinds or set(ALL_KINDS))]

    counts: dict[str, int] = {}
    hits: list[SearchHit] = []
    for kind in wanted:
        found = _HANDLERS[kind](db, user_id, pattern, term, limit)
        counts[kind] = len(found)
        hits.extend(found)

    hits.sort(key=lambda h: (h.occurred_at is None, h.occurred_at), reverse=True)
    return {"query": term, "total": len(hits), "counts": counts, "hits": hits}
