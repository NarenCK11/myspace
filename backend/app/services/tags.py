"""Tag resolution shared by every content endpoint."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.content import Tag


def resolve_tags(db: Session, user_id: str, tag_ids: list[str] | None) -> list[Tag]:
    """Load the caller's tags by id, rejecting ids that are not theirs."""
    if not tag_ids:
        return []
    unique_ids = list(dict.fromkeys(tag_ids))
    tags = list(
        db.execute(
            select(Tag).where(Tag.user_id == user_id, Tag.id.in_(unique_ids))
        ).scalars()
    )
    if len(tags) != len(unique_ids):
        found = {t.id for t in tags}
        missing = [t for t in unique_ids if t not in found]
        raise NotFoundError(f"Unknown tag id(s): {', '.join(missing)}")
    order = {tag_id: i for i, tag_id in enumerate(unique_ids)}
    return sorted(tags, key=lambda t: order[t.id])


def get_or_create_tag(db: Session, user_id: str, name: str, color: str = "slate") -> Tag:
    normalized = name.strip()
    existing = db.execute(
        select(Tag).where(Tag.user_id == user_id, Tag.name == normalized)
    ).scalar_one_or_none()
    if existing:
        return existing
    tag = Tag(user_id=user_id, name=normalized, color=color)
    db.add(tag)
    db.flush()
    return tag
