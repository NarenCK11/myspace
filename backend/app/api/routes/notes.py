"""Note CRUD."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Query, status
from sqlalchemy import func, or_, select

from app.core.deps import CurrentUser, DbSession
from app.core.errors import NotFoundError
from app.models.content import Note, note_tags
from app.models.enums import EntityType
from app.schemas.common import Page
from app.schemas.content import NoteCreate, NoteRead, NoteUpdate
from app.services import activity_log
from app.services import tags as tag_service

router = APIRouter(prefix="/notes", tags=["notes"])

NoteView = Literal["all", "pinned", "important", "archived"]


def _get_note(db, user_id: str, note_id: str) -> Note:
    row = db.get(Note, note_id)
    if row is None or row.user_id != user_id:
        raise NotFoundError("Note not found.")
    return row


@router.get("", response_model=Page[NoteRead])
def list_notes(
    db: DbSession,
    user: CurrentUser,
    view: NoteView = "all",
    tag_id: Annotated[list[str] | None, Query()] = None,
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Page[NoteRead]:
    conditions = [Note.user_id == user.id]

    if view == "archived":
        conditions.append(Note.is_archived.is_(True))
    else:
        conditions.append(Note.is_archived.is_(False))
        if view == "pinned":
            conditions.append(Note.is_pinned.is_(True))
        elif view == "important":
            conditions.append(Note.is_important.is_(True))

    if q:
        pattern = f"%{q.strip()}%"
        conditions.append(or_(Note.title.ilike(pattern), Note.content.ilike(pattern)))
    if tag_id:
        conditions.append(
            Note.id.in_(select(note_tags.c.note_id).where(note_tags.c.tag_id.in_(tag_id)))
        )

    total = int(db.execute(select(func.count()).select_from(Note).where(*conditions)).scalar_one())
    rows = list(
        db.execute(
            select(Note)
            .where(*conditions)
            .order_by(Note.is_pinned.desc(), Note.updated_at.desc())
            .limit(limit)
            .offset(offset)
        ).scalars()
    )
    return Page[NoteRead](
        items=[NoteRead.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(rows) < total,
    )


@router.post("", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(payload: NoteCreate, db: DbSession, user: CurrentUser) -> NoteRead:
    note = Note(user_id=user.id, **payload.model_dump(exclude={"tag_ids"}))
    note.tags = tag_service.resolve_tags(db, user.id, payload.tag_ids)
    db.add(note)
    db.flush()
    activity_log.log(
        db,
        user_id=user.id,
        action="created",
        entity_type=EntityType.NOTE,
        entity_id=note.id,
        title=f"Created note: {note.title}",
    )
    return NoteRead.model_validate(note)


@router.get("/{note_id}", response_model=NoteRead)
def get_note(note_id: str, db: DbSession, user: CurrentUser) -> NoteRead:
    return NoteRead.model_validate(_get_note(db, user.id, note_id))


@router.patch("/{note_id}", response_model=NoteRead)
def update_note(note_id: str, payload: NoteUpdate, db: DbSession, user: CurrentUser) -> NoteRead:
    note = _get_note(db, user.id, note_id)
    data = payload.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)
    for field, value in data.items():
        setattr(note, field, value)
    if tag_ids is not None:
        note.tags = tag_service.resolve_tags(db, user.id, tag_ids)
    db.flush()
    return NoteRead.model_validate(note)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_note(note_id: str, db: DbSession, user: CurrentUser) -> None:
    note = _get_note(db, user.id, note_id)
    title = note.title
    db.delete(note)
    db.flush()
    activity_log.log(
        db,
        user_id=user.id,
        action="deleted",
        entity_type=EntityType.NOTE,
        entity_id=note_id,
        title=f"Deleted note: {title}",
    )
