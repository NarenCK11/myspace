"""Google Calendar OAuth and synchronisation endpoints.

Client secrets and OAuth tokens stay on the server; the frontend only ever
receives connection status and calendar data.
"""

from __future__ import annotations

import logging
from urllib.parse import urlencode

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.errors import IntegrationError
from app.core.security import generate_pkce_pair, generate_state
from app.schemas.calendar import (
    CalendarToggleRequest,
    GoogleAuthUrl,
    GoogleCalendarRead,
    GoogleStatus,
    GoogleSyncResult,
)
from app.schemas.common import MessageResponse
from app.services import google_client, google_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/google", tags=["google"])


def _settings_redirect(**params) -> RedirectResponse:
    base = settings.frontend_url.rstrip("/")
    return RedirectResponse(url=f"{base}/settings?{urlencode(params)}", status_code=302)


@router.get("/status", response_model=GoogleStatus)
def google_status(db: DbSession, user: CurrentUser) -> GoogleStatus:
    account = google_sync.get_account(db, user.id)
    if account is None:
        return GoogleStatus(configured=settings.google_configured, connected=False)

    return GoogleStatus(
        configured=settings.google_configured,
        connected=True,
        email=account.email,
        scopes=[s for s in (account.scopes or "").split(" ") if s],
        connected_at=account.connected_at,
        last_synced_at=account.last_synced_at,
        last_sync_error=account.last_sync_error,
        cached_event_count=google_sync.cached_event_count(db, user.id),
        calendars=[GoogleCalendarRead.model_validate(c) for c in account.calendars],
    )


@router.post("/connect", response_model=GoogleAuthUrl)
def start_connect(db: DbSession, user: CurrentUser) -> GoogleAuthUrl:
    google_sync.require_configured()
    verifier, challenge = generate_pkce_pair()
    state = generate_state()
    google_sync.create_oauth_state(db, user=user, state=state, verifier=verifier)
    url = google_client.build_authorization_url(state=state, code_challenge=challenge)
    return GoogleAuthUrl(authorization_url=url, state=state)


@router.get("/callback", include_in_schema=False)
def oauth_callback(
    db: DbSession,
    state: str | None = None,
    code: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Google redirects the browser here after the consent screen.

    The request carries no access token, so the one-time ``state`` row is what
    identifies the owner and proves the flow started on this server.
    """
    if error:
        return _settings_redirect(google="error", reason=error)
    if not state or not code:
        return _settings_redirect(google="error", reason="missing_parameters")

    try:
        state_row = google_sync.consume_oauth_state(db, state)
        from app.models.user import User

        user = db.get(User, state_row.user_id)
        if user is None:
            return _settings_redirect(google="error", reason="unknown_user")

        tokens = google_client.exchange_code(code=code, code_verifier=state_row.code_verifier)
        account = google_sync.store_connection(db, user=user, tokens=tokens)
        db.commit()
    except Exception as exc:  # noqa: BLE001 - always return the user to the UI
        db.rollback()
        logger.exception("Google OAuth callback failed")
        return _settings_redirect(google="error", reason=type(exc).__name__)

    # First sync is best-effort; the Settings page can always retry.
    try:
        google_sync.sync_events(db, account)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.warning("Initial Google Calendar sync failed", exc_info=True)

    return _settings_redirect(google="connected")


@router.post("/sync", response_model=GoogleSyncResult)
def sync(db: DbSession, user: CurrentUser) -> GoogleSyncResult:
    result = google_sync.sync_now(db, user.id)
    return GoogleSyncResult.model_validate(result)


@router.get("/calendars", response_model=list[GoogleCalendarRead])
def list_calendars(db: DbSession, user: CurrentUser) -> list[GoogleCalendarRead]:
    account = google_sync.require_account(db, user.id)
    try:
        calendars = google_sync.sync_calendar_list(db, account)
    except IntegrationError as exc:
        google_sync.record_sync_failure(db, account, str(exc))
        raise
    return [GoogleCalendarRead.model_validate(c) for c in calendars]


@router.patch("/calendars/{calendar_row_id}", response_model=GoogleCalendarRead)
def toggle_calendar(
    calendar_row_id: str, payload: CalendarToggleRequest, db: DbSession, user: CurrentUser
) -> GoogleCalendarRead:
    row = google_sync.set_calendar_enabled(db, user.id, calendar_row_id, payload.is_enabled)
    return GoogleCalendarRead.model_validate(row)


@router.delete("/disconnect", response_model=MessageResponse)
def disconnect(db: DbSession, user: CurrentUser) -> MessageResponse:
    google_sync.disconnect(db, user.id)
    return MessageResponse(message="Google Calendar disconnected.")
