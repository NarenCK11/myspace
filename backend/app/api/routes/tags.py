"""Tag (category) management."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import ConflictError, NotFoundError
from app.models.content import Tag, activity_tags, note_tags, reminder_tags, task_tags
from app.schemas.common import TagCreate, TagRead, TagUpdate, TagWithCount

router = APIRouter(prefix="/tags", tags=["tags"])


def _get_tag(db, user_id: str, tag_id: str) -> Tag:
    row = db.get(Tag, tag_id)
    if row is None or row.user_id != user_id:
        raise NotFoundError("Tag not found.")
    return row


def _usage_counts(db, table) -> dict[str, int]:
    rows = db.execute(select(table.c.tag_id, func.count()).group_by(table.c.tag_id)).all()
    return dict(rows)


@router.get("", response_model=list[TagWithCount])
def list_tags(db: DbSession, user: CurrentUser) -> list[TagWithCount]:
    tags = list(
        db.execute(
            select(Tag).where(Tag.user_id == user.id).order_by(func.lower(Tag.name).asc())
        ).scalars()
    )
    task_counts = _usage_counts(db, task_tags)
    note_counts = _usage_counts(db, note_tags)
    reminder_counts = _usage_counts(db, reminder_tags)
    activity_counts = _usage_counts(db, activity_tags)

    return [
        TagWithCount(
            **TagRead.model_validate(tag).model_dump(),
            task_count=task_counts.get(tag.id, 0),
            note_count=note_counts.get(tag.id, 0),
            reminder_count=reminder_counts.get(tag.id, 0),
            activity_count=activity_counts.get(tag.id, 0),
        )
        for tag in tags
    ]


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
def create_tag(payload: TagCreate, db: DbSession, user: CurrentUser) -> TagRead:
    name = payload.name.strip()
    exists = db.execute(
        select(Tag).where(Tag.user_id == user.id, func.lower(Tag.name) == name.lower())
    ).scalar_one_or_none()
    if exists is not None:
        raise ConflictError("A tag with that name already exists.")

    tag = Tag(user_id=user.id, name=name, color=payload.color, description=payload.description)
    db.add(tag)
    db.flush()
    return TagRead.model_validate(tag)


@router.patch("/{tag_id}", response_model=TagRead)
def update_tag(tag_id: str, payload: TagUpdate, db: DbSession, user: CurrentUser) -> TagRead:
    tag = _get_tag(db, user.id, tag_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"]:
        new_name = data["name"].strip()
        clash = db.execute(
            select(Tag).where(
                Tag.user_id == user.id,
                func.lower(Tag.name) == new_name.lower(),
                Tag.id != tag.id,
            )
        ).scalar_one_or_none()
        if clash is not None:
            raise ConflictError("A tag with that name already exists.")
        data["name"] = new_name
    for field, value in data.items():
        setattr(tag, field, value)
    db.flush()
    return TagRead.model_validate(tag)


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_tag(tag_id: str, db: DbSession, user: CurrentUser) -> None:
    tag = _get_tag(db, user.id, tag_id)
    db.delete(tag)
    db.flush()
