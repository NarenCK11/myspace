"""Application settings, loaded from environment variables."""

from __future__ import annotations

import base64
import hashlib
from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- General -----------------------------------------------------------
    app_name: str = "MySpace"
    environment: Literal["development", "staging", "production"] = "development"
    debug: bool = False
    api_prefix: str = "/api"

    # --- Database ----------------------------------------------------------
    database_url: str = "postgresql+psycopg://myspace:myspace@localhost:5432/myspace"
    db_echo: bool = False
    db_pool_size: int = 5
    db_max_overflow: int = 10

    # --- Security ----------------------------------------------------------
    jwt_secret: str = "change-me-in-production-this-is-not-secure"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 30

    # Fernet key used to encrypt third-party OAuth tokens at rest. When unset we
    # derive a stable key from ``jwt_secret`` so local development works without
    # extra setup; production deployments should always set it explicitly.
    token_encryption_key: str | None = None

    # --- Owner bootstrap ---------------------------------------------------
    owner_login_id: str | None = None
    owner_password: str | None = None
    owner_display_name: str = "Owner"
    owner_email: str | None = None
    owner_timezone: str = "UTC"

    # --- Cookies -----------------------------------------------------------
    refresh_cookie_name: str = "myspace_refresh"
    cookie_secure: bool = True
    cookie_samesite: Literal["lax", "strict", "none"] = "none"
    cookie_domain: str | None = None
    # Cookie path is scoped so the refresh token is only ever sent to the
    # endpoints that actually need it.
    cookie_path: str = "/api/auth"

    # --- CORS / URLs -------------------------------------------------------
    frontend_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Rate limiting -----------------------------------------------------
    login_max_attempts: int = 8
    login_window_seconds: int = 900
    login_lockout_seconds: int = 900

    # --- Google OAuth ------------------------------------------------------
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/api/google/callback"
    google_sync_window_past_days: int = 30
    google_sync_window_future_days: int = 120

    @field_validator("cors_origins")
    @classmethod
    def _strip_origins(cls, value: str) -> str:
        return value.strip()

    @property
    def cors_origin_list(self) -> list[str]:
        origins = {o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()}
        if self.frontend_url:
            origins.add(self.frontend_url.strip().rstrip("/"))
        return sorted(origins)

    @property
    def google_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def fernet_key(self) -> bytes:
        """Return a valid 32-byte url-safe base64 Fernet key."""
        if self.token_encryption_key:
            raw = self.token_encryption_key.strip()
            try:
                if len(base64.urlsafe_b64decode(raw.encode())) == 32:
                    return raw.encode()
            except Exception:  # noqa: BLE001 - fall through to derivation
                pass
            digest = hashlib.sha256(raw.encode()).digest()
        else:
            digest = hashlib.sha256(f"myspace-token-key::{self.jwt_secret}".encode()).digest()
        return base64.urlsafe_b64encode(digest)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
