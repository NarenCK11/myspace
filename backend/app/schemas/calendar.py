"""Calendar, Google integration, dashboard and search schemas."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel

CalendarItemKind = Literal["google_event", "task", "reminder", "activity"]


class CalendarItem(BaseModel):
    """One entry in the unified calendar feed."""

    id: str
    kind: CalendarItemKind
    title: str
    description: str | None = None
    start_at: dt.datetime
    end_at: dt.datetime
    all_day: bool = False
    location: str | None = None
    url: str | None = None
    color: str | None = None
    status: str | None = None
    calendar_id: str | None = None
    calendar_name: str | None = None
    source_id: str | None = None


class CalendarFeed(BaseModel):
    start: dt.datetime
    end: dt.datetime
    items: list[CalendarItem]
    google_connected: bool
    google_configured: bool = False
    last_synced_at: dt.datetime | None = None


class GoogleCalendarRead(ORMModel):
    id: str
    calendar_id: str
    summary: str
    description: str | None
    time_zone: str | None
    background_color: str | None
    foreground_color: str | None
    is_primary: bool
    is_enabled: bool
    access_role: str | None


class GoogleStatus(BaseModel):
    configured: bool
    connected: bool
    email: str | None = None
    scopes: list[str] = Field(default_factory=list)
    connected_at: dt.datetime | None = None
    last_synced_at: dt.datetime | None = None
    last_sync_error: str | None = None
    cached_event_count: int = 0
    calendars: list[GoogleCalendarRead] = Field(default_factory=list)


class GoogleAuthUrl(BaseModel):
    authorization_url: str
    state: str


class GoogleSyncResult(BaseModel):
    synced_at: dt.datetime
    calendars_synced: int
    events_upserted: int
    events_removed: int
    window_start: dt.datetime
    window_end: dt.datetime


class CalendarToggleRequest(BaseModel):
    is_enabled: bool
