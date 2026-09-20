"""Google Calendar connection, calendar list and cached events."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import JSONVariant, UTCDateTime


class GoogleAccount(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The owner's connected Google account.

    OAuth tokens are encrypted at rest with Fernet and never leave the backend.
    """

    __tablename__ = "google_accounts"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    google_sub: Mapped[str | None] = mapped_column(String(64), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scopes: Mapped[str] = mapped_column(Text, nullable=False, default="")
    access_token_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    access_token_expires_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    connected_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    last_synced_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    last_sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    calendars: Mapped[list[GoogleCalendar]] = relationship(
        back_populates="account", cascade="all, delete-orphan", lazy="selectin"
    )


class GoogleCalendar(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A calendar in the connected account, with a per-calendar sync toggle."""

    __tablename__ = "google_calendars"
    __table_args__ = (
        UniqueConstraint("account_id", "calendar_id", name="uq_google_calendars_account_calendar"),
    )

    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("google_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    calendar_id: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    time_zone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    background_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    foreground_color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    access_role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sync_token: Mapped[str | None] = mapped_column(Text, nullable=True)

    account: Mapped[GoogleAccount] = relationship(back_populates="calendars")


class CalendarEvent(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """Locally cached Google Calendar event.

    The cache is what the calendar/dashboard read from, so the UI stays fast and
    keeps working when Google is unreachable.
    """

    __tablename__ = "calendar_events"
    __table_args__ = (
        UniqueConstraint(
            "account_id", "calendar_id", "google_event_id", name="uq_calendar_events_identity"
        ),
        Index("ix_calendar_events_user_start", "user_id", "start_at"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("google_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    calendar_id: Mapped[str] = mapped_column(String(255), nullable=False)
    google_event_id: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(String(500), nullable=False, default="(no title)")
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    start_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
    end_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    all_day: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="confirmed")
    html_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    hangout_link: Mapped[str | None] = mapped_column(Text, nullable=True)
    organizer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    color_id: Mapped[str | None] = mapped_column(String(16), nullable=True)
    recurring_event_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    attendees: Mapped[list | None] = mapped_column(JSONVariant, nullable=True)
    synced_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)


class OAuthState(UUIDPrimaryKeyMixin, Base):
    """Short-lived CSRF state + PKCE verifier for the Google OAuth handshake."""

    __tablename__ = "oauth_states"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    state: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    code_verifier: Mapped[str] = mapped_column(String(128), nullable=False)
    redirect_to: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    expires_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    consumed_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
