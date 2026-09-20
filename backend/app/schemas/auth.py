"""Authentication request/response schemas."""

from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Theme
from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    login_id: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserRead


class UserRead(ORMModel):
    id: str
    login_id: str
    display_name: str
    email: str | None = None
    timezone: str
    theme: str
    week_starts_on: int
    created_at: dt.datetime
    last_login_at: dt.datetime | None = None


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: str | None = Field(default=None, max_length=255)
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    theme: Theme | None = None
    week_starts_on: int | None = Field(default=None, ge=0, le=1)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=10, max_length=256)


class SessionRead(ORMModel):
    id: str
    issued_at: dt.datetime
    expires_at: dt.datetime
    revoked_at: dt.datetime | None
    user_agent: str | None
    ip_address: str | None
    is_current: bool = False


TokenResponse.model_rebuild()
