"""Thin HTTP client for Google OAuth 2.0 and the Calendar v3 API.

Only this module talks to Google. Client secrets and OAuth tokens never leave
the backend.
"""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.core.errors import IntegrationError

logger = logging.getLogger(__name__)

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo"
CALENDAR_API = "https://www.googleapis.com/calendar/v3"

SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/calendar.events.readonly",
]

REQUEST_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


@dataclass
class TokenBundle:
    access_token: str
    refresh_token: str | None
    expires_at: dt.datetime
    scopes: str
    id_token: str | None = None


def build_authorization_url(*, state: str, code_challenge: str) -> str:
    params = {
        "client_id": settings.google_client_id or "",
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        # Forcing the consent screen guarantees Google returns a refresh token
        # even when the account has authorised this client before.
        "prompt": "consent",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


def _token_bundle(payload: dict) -> TokenBundle:
    expires_in = int(payload.get("expires_in", 3600))
    return TokenBundle(
        access_token=payload["access_token"],
        refresh_token=payload.get("refresh_token"),
        expires_at=dt.datetime.now(dt.UTC) + dt.timedelta(seconds=expires_in - 60),
        scopes=payload.get("scope", " ".join(SCOPES)),
        id_token=payload.get("id_token"),
    )


def _post_token(data: dict) -> dict:
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.post(TOKEN_ENDPOINT, data=data)
    except httpx.HTTPError as exc:
        raise IntegrationError(f"Could not reach Google: {exc}") from exc

    if response.status_code >= 400:
        detail = response.json().get("error_description") if _is_json(response) else response.text
        logger.warning("Google token endpoint returned %s: %s", response.status_code, detail)
        raise IntegrationError(f"Google rejected the request: {detail or response.status_code}")
    return response.json()


def _is_json(response: httpx.Response) -> bool:
    return response.headers.get("content-type", "").startswith("application/json")


def exchange_code(*, code: str, code_verifier: str) -> TokenBundle:
    payload = _post_token(
        {
            "code": code,
            "client_id": settings.google_client_id or "",
            "client_secret": settings.google_client_secret or "",
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
            "code_verifier": code_verifier,
        }
    )
    return _token_bundle(payload)


def refresh_access_token(refresh_token: str) -> TokenBundle:
    payload = _post_token(
        {
            "refresh_token": refresh_token,
            "client_id": settings.google_client_id or "",
            "client_secret": settings.google_client_secret or "",
            "grant_type": "refresh_token",
        }
    )
    payload.setdefault("refresh_token", refresh_token)
    return _token_bundle(payload)


def revoke_token(token: str) -> bool:
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.post(REVOKE_ENDPOINT, data={"token": token})
        return response.status_code < 400
    except httpx.HTTPError as exc:  # pragma: no cover - network failure path
        logger.warning("Failed to revoke Google token: %s", exc)
        return False


def _api_get(access_token: str, url: str, params: dict | None = None) -> dict:
    headers = {"Authorization": f"Bearer {access_token}"}
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT) as client:
            response = client.get(url, params=params, headers=headers)
    except httpx.HTTPError as exc:
        raise IntegrationError(f"Could not reach Google Calendar: {exc}") from exc

    if response.status_code == 401:
        raise GoogleAuthExpired("Google access token is no longer valid.")
    if response.status_code == 403:
        detail = _error_message(response)
        raise IntegrationError(f"Google denied the request: {detail}")
    if response.status_code == 410:
        raise GoogleSyncTokenExpired("Google sync token expired.")
    if response.status_code >= 400:
        raise IntegrationError(f"Google Calendar error: {_error_message(response)}")
    return response.json()


def _error_message(response: httpx.Response) -> str:
    if _is_json(response):
        body = response.json()
        error = body.get("error")
        if isinstance(error, dict):
            return error.get("message", str(response.status_code))
        if isinstance(error, str):
            return body.get("error_description", error)
    return response.text[:200] or str(response.status_code)


class GoogleAuthExpired(IntegrationError):
    """Raised when Google rejects the stored access token."""

    code = "google_auth_expired"


class GoogleSyncTokenExpired(IntegrationError):
    """Raised when an incremental sync token is no longer usable."""

    code = "google_sync_token_expired"


def fetch_userinfo(access_token: str) -> dict:
    return _api_get(access_token, USERINFO_ENDPOINT)


def fetch_calendar_list(access_token: str) -> list[dict]:
    items: list[dict] = []
    page_token: str | None = None
    while True:
        params = {"maxResults": 250, "showHidden": "false"}
        if page_token:
            params["pageToken"] = page_token
        payload = _api_get(access_token, f"{CALENDAR_API}/users/me/calendarList", params)
        items.extend(payload.get("items", []))
        page_token = payload.get("nextPageToken")
        if not page_token:
            return items


def fetch_events(
    access_token: str,
    calendar_id: str,
    *,
    time_min: dt.datetime,
    time_max: dt.datetime,
    max_pages: int = 20,
) -> list[dict]:
    """Fetch expanded (single) event instances inside a time window."""
    from urllib.parse import quote

    items: list[dict] = []
    page_token: str | None = None
    for _ in range(max_pages):
        params: dict = {
            "timeMin": time_min.astimezone(dt.UTC).isoformat().replace("+00:00", "Z"),
            "timeMax": time_max.astimezone(dt.UTC).isoformat().replace("+00:00", "Z"),
            "singleEvents": "true",
            "orderBy": "startTime",
            "maxResults": 250,
            "showDeleted": "false",
        }
        if page_token:
            params["pageToken"] = page_token
        payload = _api_get(
            access_token,
            f"{CALENDAR_API}/calendars/{quote(calendar_id, safe='')}/events",
            params,
        )
        items.extend(payload.get("items", []))
        page_token = payload.get("nextPageToken")
        if not page_token:
            break
    return items
