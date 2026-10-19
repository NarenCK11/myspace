"""Owner account, refresh sessions and login-attempt tracking."""

from __future__ import annotations

import datetime as dt

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin
from app.db.types import UTCDateTime
from app.models.enums import Theme


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """The single owner of this portal. No registration endpoint exists."""

    __tablename__ = "users"

    login_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Owner")
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    theme: Mapped[str] = mapped_column(String(16), nullable=False, default=Theme.SYSTEM.value)
    week_starts_on: Mapped[int] = mapped_column(nullable=False, default=1)  # 0=Sunday, 1=Monday
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Default food labels are created once, on first use, so labels the owner
    # later deletes do not come back.
    food_labels_seeded: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=false()
    )
    last_login_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    password_changed_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)

    sessions: Mapped[list[RefreshSession]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class RefreshSession(UUIDPrimaryKeyMixin, Base):
    """One row per issued refresh token.

    Tokens are stored as SHA-256 hashes and rotated on every use. All rows that
    descend from a single login share a ``family_id`` so that replaying a
    already-rotated token can revoke the entire family.
    """

    __tablename__ = "refresh_sessions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    family_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    issued_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False)
    expires_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
    revoked_at: Mapped[dt.datetime | None] = mapped_column(UTCDateTime, nullable=True)
    revoked_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    replaced_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)

    user: Mapped[User] = relationship(back_populates="sessions")

    @property
    def is_active(self) -> bool:
        now = dt.datetime.now(dt.UTC)
        return self.revoked_at is None and self.expires_at > now


class LoginAttempt(UUIDPrimaryKeyMixin, Base):
    """Persisted login attempts backing the login rate limiter."""

    __tablename__ = "login_attempts"
    __table_args__ = (
        Index("ix_login_attempts_ip_created", "ip_address", "created_at"),
        Index("ix_login_attempts_login_created", "login_id", "created_at"),
    )

    login_id: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    successful: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime, nullable=False, index=True)
