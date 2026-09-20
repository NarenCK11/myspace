"""Connect, sync and disconnect the owner's Google Calendar."""

from __future__ import annotations

import datetime as dt
import logging

from dateutil import parser as date_parser
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError, IntegrationError, NotFoundError
from app.core.security import decrypt_secret, encrypt_secret
from app.db.base import utcnow
from app.models.google import CalendarEvent, GoogleAccount, GoogleCalendar, OAuthState
from app.models.user import User
from app.services import google_client
from app.services.google_client import GoogleAuthExpired, TokenBundle

logger = logging.getLogger(__name__)


class GoogleNotConnected(AppError):
    status_code = 409
    code = "google_not_connected"


def require_configured() -> None:
    if not settings.google_configured:
        raise AppError(
            "Google Calendar is not configured on the server. Set GOOGLE_CLIENT_ID and "
            "GOOGLE_CLIENT_SECRET.",
            code="google_not_configured",
            status_code=503,
        )


def get_account(db: Session, user_id: str) -> GoogleAccount | None:
    return db.execute(
        select(GoogleAccount).where(GoogleAccount.user_id == user_id)
    ).scalar_one_or_none()


def require_account(db: Session, user_id: str) -> GoogleAccount:
    account = get_account(db, user_id)
    if account is None:
        raise GoogleNotConnected("Google Calendar is not connected.")
    return account


# --- OAuth state -----------------------------------------------------------


def create_oauth_state(db: Session, *, user: User, state: str, verifier: str) -> OAuthState:
    now = utcnow()
    db.query(OAuthState).filter(OAuthState.expires_at < now).delete(synchronize_session=False)
    row = OAuthState(
        user_id=user.id,
        state=state,
        code_verifier=verifier,
        created_at=now,
        expires_at=now + dt.timedelta(minutes=15),
    )
    db.add(row)
    db.flush()
    return row


def consume_oauth_state(db: Session, state: str) -> OAuthState:
    row = db.execute(select(OAuthState).where(OAuthState.state == state)).scalar_one_or_none()
    if row is None or row.consumed_at is not None:
        raise AppError("This authorization link is no longer valid.", code="oauth_state_invalid")
    if row.expires_at <= utcnow():
        raise AppError("This authorization link has expired.", code="oauth_state_expired")
    row.consumed_at = utcnow()
    return row


# --- Connection ------------------------------------------------------------


def store_connection(db: Session, *, user: User, tokens: TokenBundle) -> GoogleAccount:
    try:
        userinfo = google_client.fetch_userinfo(tokens.access_token)
    except IntegrationError:  # pragma: no cover - non-fatal enrichment
        userinfo = {}

    account = get_account(db, user.id)
    if account is None:
        account = GoogleAccount(user_id=user.id, connected_at=utcnow(), access_token_encrypted="")
        db.add(account)

    account.google_sub = userinfo.get("sub") or account.google_sub
    account.email = userinfo.get("email") or account.email
    account.scopes = tokens.scopes
    account.access_token_encrypted = encrypt_secret(tokens.access_token)
    if tokens.refresh_token:
        account.refresh_token_encrypted = encrypt_secret(tokens.refresh_token)
    account.access_token_expires_at = tokens.expires_at
    account.connected_at = account.connected_at or utcnow()
    account.last_sync_error = None
    db.flush()
    return account


def disconnect(db: Session, user_id: str) -> None:
    account = get_account(db, user_id)
    if account is None:
        raise GoogleNotConnected("Google Calendar is not connected.")

    # Best effort: tell Google to drop the grant, then remove everything locally.
    if account.refresh_token_encrypted:
        try:
            google_client.revoke_token(decrypt_secret(account.refresh_token_encrypted))
        except Exception:  # noqa: BLE001 - revocation must never block disconnect
            logger.warning("Google token revocation failed during disconnect", exc_info=True)

    db.execute(delete(CalendarEvent).where(CalendarEvent.account_id == account.id))
    # Calendars are removed by the relationship cascade on the account.
    db.delete(account)
    db.flush()


# --- Access tokens ---------------------------------------------------------


def get_valid_access_token(db: Session, account: GoogleAccount) -> str:
    """Return a usable access token, refreshing it when it is close to expiry."""
    expires_at = account.access_token_expires_at
    if expires_at and expires_at > utcnow() + dt.timedelta(seconds=30):
        return decrypt_secret(account.access_token_encrypted)

    if not account.refresh_token_encrypted:
        raise GoogleAuthExpired(
            "Google access has expired and no refresh token is stored. Please reconnect."
        )

    tokens = google_client.refresh_access_token(decrypt_secret(account.refresh_token_encrypted))
    account.access_token_encrypted = encrypt_secret(tokens.access_token)
    account.access_token_expires_at = tokens.expires_at
    if tokens.refresh_token:
        account.refresh_token_encrypted = encrypt_secret(tokens.refresh_token)
    db.flush()
    return tokens.access_token


# --- Calendars -------------------------------------------------------------


def sync_calendar_list(db: Session, account: GoogleAccount) -> list[GoogleCalendar]:
    access_token = get_valid_access_token(db, account)
    remote = google_client.fetch_calendar_list(access_token)

    existing = {c.calendar_id: c for c in account.calendars}
    seen: set[str] = set()

    for item in remote:
        calendar_id = item.get("id")
        if not calendar_id:
            continue
        seen.add(calendar_id)
        row = existing.get(calendar_id)
        if row is None:
            row = GoogleCalendar(
                account_id=account.id,
                user_id=account.user_id,
                calendar_id=calendar_id,
                is_enabled=bool(item.get("primary")) or item.get("selected", False),
            )
            db.add(row)
        row.summary = item.get("summaryOverride") or item.get("summary") or calendar_id
        row.description = item.get("description")
        row.time_zone = item.get("timeZone")
        row.background_color = item.get("backgroundColor")
        row.foreground_color = item.get("foregroundColor")
        row.is_primary = bool(item.get("primary", False))
        row.access_role = item.get("accessRole")

    for calendar_id, row in existing.items():
        if calendar_id not in seen:
            db.execute(
                delete(CalendarEvent).where(
                    CalendarEvent.account_id == account.id,
                    CalendarEvent.calendar_id == calendar_id,
                )
            )
            db.delete(row)

    db.flush()
    db.refresh(account)
    return list(account.calendars)


def set_calendar_enabled(db: Session, user_id: str, calendar_row_id: str, enabled: bool) -> GoogleCalendar:
    row = db.execute(
        select(GoogleCalendar).where(
            GoogleCalendar.id == calendar_row_id, GoogleCalendar.user_id == user_id
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Calendar not found.")
    row.is_enabled = enabled
    if not enabled:
        db.execute(
            delete(CalendarEvent).where(
                CalendarEvent.account_id == row.account_id,
                CalendarEvent.calendar_id == row.calendar_id,
            )
        )
    db.flush()
    return row


# --- Events ----------------------------------------------------------------


def _parse_event_time(node: dict | None, fallback: dt.datetime) -> tuple[dt.datetime, bool]:
    """Parse a Google event start/end node into an aware UTC datetime."""
    if not node:
        return fallback, False
    if node.get("dateTime"):
        parsed = date_parser.isoparse(node["dateTime"])
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.UTC)
        return parsed.astimezone(dt.UTC), False
    if node.get("date"):
        day = dt.date.fromisoformat(node["date"])
        return dt.datetime.combine(day, dt.time.min, tzinfo=dt.UTC), True
    return fallback, False


def sync_events(db: Session, account: GoogleAccount, *, window_days_past: int | None = None,
                window_days_future: int | None = None) -> dict:
    """Refresh the local event cache for every enabled calendar."""
    past = window_days_past if window_days_past is not None else settings.google_sync_window_past_days
    future = (
        window_days_future
        if window_days_future is not None
        else settings.google_sync_window_future_days
    )

    now = utcnow()
    window_start = now - dt.timedelta(days=past)
    window_end = now + dt.timedelta(days=future)

    calendars = sync_calendar_list(db, account)
    enabled = [c for c in calendars if c.is_enabled]

    access_token = get_valid_access_token(db, account)
    upserted = 0
    seen_keys: set[tuple[str, str]] = set()

    for calendar in enabled:
        events = google_client.fetch_events(
            access_token, calendar.calendar_id, time_min=window_start, time_max=window_end
        )
        for item in events:
            event_id = item.get("id")
            if not event_id or item.get("status") == "cancelled":
                continue
            start_at, all_day = _parse_event_time(item.get("start"), now)
            end_at, _ = _parse_event_time(item.get("end"), start_at + dt.timedelta(hours=1))
            if end_at < start_at:
                end_at = start_at

            seen_keys.add((calendar.calendar_id, event_id))
            row = db.execute(
                select(CalendarEvent).where(
                    CalendarEvent.account_id == account.id,
                    CalendarEvent.calendar_id == calendar.calendar_id,
                    CalendarEvent.google_event_id == event_id,
                )
            ).scalar_one_or_none()
            if row is None:
                row = CalendarEvent(
                    user_id=account.user_id,
                    account_id=account.id,
                    calendar_id=calendar.calendar_id,
                    google_event_id=event_id,
                    synced_at=now,
                )
                db.add(row)

            row.summary = (item.get("summary") or "(no title)")[:500]
            row.description = item.get("description")
            row.location = (item.get("location") or None)
            row.start_at = start_at
            row.end_at = end_at
            row.all_day = all_day
            row.status = item.get("status") or "confirmed"
            row.html_link = item.get("htmlLink")
            row.hangout_link = item.get("hangoutLink")
            row.organizer_email = (item.get("organizer") or {}).get("email")
            row.color_id = item.get("colorId") or calendar.background_color
            row.recurring_event_id = item.get("recurringEventId")
            row.attendees = [
                {
                    "email": a.get("email"),
                    "displayName": a.get("displayName"),
                    "responseStatus": a.get("responseStatus"),
                }
                for a in (item.get("attendees") or [])
            ][:25] or None
            row.synced_at = now
            upserted += 1

    removed = _prune_stale_events(db, account, enabled, window_start, window_end, seen_keys)

    account.last_synced_at = now
    account.last_sync_error = None
    db.flush()

    return {
        "synced_at": now,
        "calendars_synced": len(enabled),
        "events_upserted": upserted,
        "events_removed": removed,
        "window_start": window_start,
        "window_end": window_end,
    }


def _prune_stale_events(
    db: Session,
    account: GoogleAccount,
    enabled: list[GoogleCalendar],
    window_start: dt.datetime,
    window_end: dt.datetime,
    seen_keys: set[tuple[str, str]],
) -> int:
    """Drop cached events that Google no longer returns for the synced window."""
    enabled_ids = [c.calendar_id for c in enabled]

    stale_stmt = select(CalendarEvent).where(CalendarEvent.account_id == account.id)
    removed = 0
    for row in db.execute(stale_stmt).scalars():
        if row.calendar_id not in enabled_ids:
            db.delete(row)
            removed += 1
            continue
        in_window = row.start_at < window_end and row.end_at > window_start
        if in_window and (row.calendar_id, row.google_event_id) not in seen_keys:
            db.delete(row)
            removed += 1
    return removed


def record_sync_failure(db: Session, account: GoogleAccount, message: str) -> None:
    account.last_sync_error = message[:500]
    db.flush()


def sync_now(db: Session, user_id: str, **kwargs) -> dict:
    """Public entry point used by the API; records failures on the account."""
    require_configured()
    account = require_account(db, user_id)
    try:
        return sync_events(db, account, **kwargs)
    except IntegrationError as exc:
        db.rollback()
        account = require_account(db, user_id)
        record_sync_failure(db, account, str(exc))
        # Commit explicitly: raising would otherwise roll the message back.
        db.commit()
        raise


def cached_event_count(db: Session, user_id: str) -> int:
    return int(
        db.execute(
            select(func.count()).select_from(CalendarEvent).where(CalendarEvent.user_id == user_id)
        ).scalar_one()
    )


def events_between(
    db: Session, user_id: str, start: dt.datetime, end: dt.datetime
) -> list[CalendarEvent]:
    stmt = (
        select(CalendarEvent)
        .where(
            CalendarEvent.user_id == user_id,
            CalendarEvent.start_at < end,
            CalendarEvent.end_at > start,
        )
        .order_by(CalendarEvent.start_at.asc())
    )
    return list(db.execute(stmt).scalars())
