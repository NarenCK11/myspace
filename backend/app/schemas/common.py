"""Shared schema building blocks."""

from __future__ import annotations

import datetime as dt
from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
    has_more: bool


class MessageResponse(BaseModel):
    message: str


class TagRead(ORMModel):
    id: str
    name: str
    color: str
    description: str | None = None
    created_at: dt.datetime


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = Field(default="slate", max_length=16)
    description: str | None = Field(default=None, max_length=255)


class TagUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, max_length=16)
    description: str | None = Field(default=None, max_length=255)


class TagWithCount(TagRead):
    task_count: int = 0
    note_count: int = 0
    reminder_count: int = 0
    activity_count: int = 0
