"""Automatic personal-history entries for content changes."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.base import utcnow
from app.models.content import Activity
from app.models.enums import ActivitySource, EntityType


def log(
    db: Session,
    *,
    user_id: str,
    action: str,
    entity_type: EntityType,
    entity_id: str,
    title: str,
    description: str | None = None,
) -> Activity:
    """Record a system activity.

    These rows power the "recent activity" feed and the personal history view;
    they are never editable through the activities API.
    """
    activity = Activity(
        user_id=user_id,
        title=title[:300],
        description=description,
        occurred_at=utcnow(),
        source=ActivitySource.SYSTEM.value,
        action=action,
        entity_type=entity_type.value,
        entity_id=entity_id,
    )
    db.add(activity)
    db.flush()
    return activity
