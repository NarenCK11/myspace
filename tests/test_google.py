"""Google Calendar integration, driven against a stubbed Google API."""

from __future__ import annotations

import datetime as dt

import pytest

from app.core.security import decrypt_secret
from app.models import CalendarEvent, GoogleAccount
from app.services import google_client
from app.services.google_client import TokenBundle

UTC = dt.UTC


class FakeGoogle:
    """Records the calls made against Google and returns canned responses."""

    def __init__(self):
        self.calls: list[str] = []
        self.access_token = "access-token-1"
        self.refresh_calls = 0
        self.revoked: list[str] = []
        self.events = [
            {
                "id": "evt-1",
                "summary": "Standup",
                "description": "Daily sync",
                "location": "Meet",
                "status": "confirmed",
                "htmlLink": "https://calendar.google.com/event?eid=evt-1",
                "start": {"dateTime": (dt.datetime.now(UTC) + dt.timedelta(hours=2)).isoformat()},
                "end": {"dateTime": (dt.datetime.now(UTC) + dt.timedelta(hours=3)).isoformat()},
                "organizer": {"email": "owner@example.com"},
                "attendees": [{"email": "a@example.com", "responseStatus": "accepted"}],
            },
            {
                "id": "evt-2",
                "summary": "Public holiday",
                "status": "confirmed",
                "start": {"date": dt.date.today().isoformat()},
                "end": {"date": (dt.date.today() + dt.timedelta(days=1)).isoformat()},
            },
        ]

    def exchange_code(self, *, code, code_verifier):
        self.calls.append("exchange_code")
        assert code_verifier, "PKCE verifier must be sent"
        return TokenBundle(
            access_token=self.access_token,
            refresh_token="refresh-token-1",
            expires_at=dt.datetime.now(UTC) + dt.timedelta(hours=1),
            scopes=" ".join(google_client.SCOPES),
        )

    def refresh_access_token(self, refresh_token):
        self.calls.append("refresh_access_token")
        self.refresh_calls += 1
        assert refresh_token == "refresh-token-1"
        self.access_token = "access-token-2"
        return TokenBundle(
            access_token=self.access_token,
            refresh_token=refresh_token,
            expires_at=dt.datetime.now(UTC) + dt.timedelta(hours=1),
            scopes=" ".join(google_client.SCOPES),
        )

    def fetch_userinfo(self, access_token):
        self.calls.append("fetch_userinfo")
        return {"sub": "google-sub-1", "email": "owner@example.com"}

    def fetch_calendar_list(self, access_token):
        self.calls.append("fetch_calendar_list")
        return [
            {
                "id": "primary@example.com",
                "summary": "Personal",
                "primary": True,
                "timeZone": "UTC",
                "backgroundColor": "#4285F4",
                "accessRole": "owner",
            },
            {"id": "muted@example.com", "summary": "Muted", "selected": False},
        ]

    def fetch_events(self, access_token, calendar_id, *, time_min, time_max, max_pages=20):
        self.calls.append(f"fetch_events:{calendar_id}")
        return self.events if calendar_id == "primary@example.com" else []

    def revoke_token(self, token):
        self.calls.append("revoke_token")
        self.revoked.append(token)
        return True


@pytest.fixture
def fake_google(monkeypatch):
    fake = FakeGoogle()
    for name in (
        "exchange_code",
        "refresh_access_token",
        "fetch_userinfo",
        "fetch_calendar_list",
        "fetch_events",
        "revoke_token",
    ):
        monkeypatch.setattr(google_client, name, getattr(fake, name))
    return fake


def connect(auth_client, fake_google) -> str:
    """Run the full connect handshake and return the state value."""
    start = auth_client.post("/api/google/connect")
    assert start.status_code == 200
    body = start.json()
    assert "code_challenge=" in body["authorization_url"]
    assert "code_challenge_method=S256" in body["authorization_url"]
    assert "access_type=offline" in body["authorization_url"]

    callback = auth_client.get(
        "/api/google/callback",
        params={"state": body["state"], "code": "auth-code"},
        follow_redirects=False,
    )
    assert callback.status_code == 302
    assert callback.headers["location"].endswith("/settings?google=connected")
    return body["state"]


def test_status_when_not_connected(auth_client):
    body = auth_client.get("/api/google/status").json()
    assert body["connected"] is False
    assert body["configured"] is True
    assert body["calendars"] == []


def test_connect_requires_authentication(client, owner):
    assert client.post("/api/google/connect").status_code == 401


def test_full_connect_flow_stores_an_encrypted_connection(auth_client, fake_google, db):
    connect(auth_client, fake_google)

    status = auth_client.get("/api/google/status").json()
    assert status["connected"] is True
    assert status["email"] == "owner@example.com"
    assert status["last_synced_at"] is not None
    assert status["cached_event_count"] == 2
    # Only the primary calendar is enabled by default.
    assert [c["summary"] for c in status["calendars"] if c["is_enabled"]] == ["Personal"]

    # Nothing token-shaped is ever sent to the client.
    assert "refresh-token-1" not in status_text(status)
    assert "access-token" not in status_text(status)

    account = db.query(GoogleAccount).one()
    assert account.access_token_encrypted != "access-token-1"
    assert decrypt_secret(account.access_token_encrypted) == "access-token-1"
    assert decrypt_secret(account.refresh_token_encrypted) == "refresh-token-1"


def status_text(payload) -> str:
    import json

    return json.dumps(payload)


def test_callback_rejects_an_unknown_state(auth_client, fake_google):
    response = auth_client.get(
        "/api/google/callback",
        params={"state": "not-a-real-state", "code": "x"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert "google=error" in response.headers["location"]
    assert auth_client.get("/api/google/status").json()["connected"] is False


def test_callback_state_cannot_be_replayed(auth_client, fake_google):
    state = connect(auth_client, fake_google)
    replay = auth_client.get(
        "/api/google/callback", params={"state": state, "code": "x"}, follow_redirects=False
    )
    assert "google=error" in replay.headers["location"]


def test_callback_surfaces_a_denied_consent_screen(auth_client, fake_google):
    response = auth_client.get(
        "/api/google/callback", params={"error": "access_denied"}, follow_redirects=False
    )
    assert "google=error" in response.headers["location"]
    assert "reason=access_denied" in response.headers["location"]


def test_events_are_cached_and_merged_into_the_calendar(auth_client, fake_google):
    connect(auth_client, fake_google)

    start = (dt.datetime.now(UTC) - dt.timedelta(days=1)).isoformat()
    end = (dt.datetime.now(UTC) + dt.timedelta(days=2)).isoformat()
    feed = auth_client.get("/api/calendar/events", params={"start": start, "end": end}).json()

    assert feed["google_connected"] is True
    google_items = [i for i in feed["items"] if i["kind"] == "google_event"]
    assert {i["title"] for i in google_items} == {"Standup", "Public holiday"}

    standup = next(i for i in google_items if i["title"] == "Standup")
    assert standup["calendar_name"] == "Personal"
    assert standup["url"].startswith("https://calendar.google.com/")
    assert standup["all_day"] is False

    holiday = next(i for i in google_items if i["title"] == "Public holiday")
    assert holiday["all_day"] is True


def test_google_events_show_on_the_dashboard(auth_client, fake_google):
    connect(auth_client, fake_google)
    body = auth_client.get("/api/dashboard").json()
    assert body["google_connected"] is True
    assert body["counts"]["events_today"] >= 1


def test_expired_access_token_is_refreshed_transparently(auth_client, fake_google, db):
    connect(auth_client, fake_google)

    account = db.query(GoogleAccount).one()
    account.access_token_expires_at = dt.datetime.now(UTC) - dt.timedelta(minutes=5)
    db.commit()

    before = fake_google.refresh_calls
    result = auth_client.post("/api/google/sync")
    assert result.status_code == 200
    assert fake_google.refresh_calls == before + 1

    db.expire_all()
    account = db.query(GoogleAccount).one()
    assert decrypt_secret(account.access_token_encrypted) == "access-token-2"
    assert account.access_token_expires_at > dt.datetime.now(UTC)


def test_missing_refresh_token_asks_the_owner_to_reconnect(auth_client, fake_google, db):
    connect(auth_client, fake_google)

    account = db.query(GoogleAccount).one()
    account.access_token_expires_at = dt.datetime.now(UTC) - dt.timedelta(minutes=5)
    account.refresh_token_encrypted = None
    db.commit()

    response = auth_client.post("/api/google/sync")
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "google_auth_expired"

    # The failure is surfaced on the status endpoint so the UI can prompt.
    assert auth_client.get("/api/google/status").json()["last_sync_error"]


def test_sync_reports_what_changed_and_removes_deleted_events(auth_client, fake_google):
    connect(auth_client, fake_google)

    first = auth_client.post("/api/google/sync").json()
    assert first["calendars_synced"] == 1
    assert first["events_upserted"] == 2

    fake_google.events = [fake_google.events[0]]
    second = auth_client.post("/api/google/sync").json()
    assert second["events_upserted"] == 1
    assert second["events_removed"] == 1

    assert auth_client.get("/api/google/status").json()["cached_event_count"] == 1


def test_disabling_a_calendar_drops_its_cached_events(auth_client, fake_google):
    connect(auth_client, fake_google)
    calendars = auth_client.get("/api/google/calendars").json()
    primary = next(c for c in calendars if c["is_primary"])

    toggled = auth_client.patch(
        f"/api/google/calendars/{primary['id']}", json={"is_enabled": False}
    ).json()
    assert toggled["is_enabled"] is False
    assert auth_client.get("/api/google/status").json()["cached_event_count"] == 0


def test_sync_without_a_connection_is_a_clear_error(auth_client):
    response = auth_client.post("/api/google/sync")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "google_not_connected"


def test_disconnect_revokes_the_grant_and_clears_local_data(auth_client, fake_google, db):
    connect(auth_client, fake_google)

    response = auth_client.delete("/api/google/disconnect")
    assert response.status_code == 200
    assert fake_google.revoked == ["refresh-token-1"]

    assert auth_client.get("/api/google/status").json()["connected"] is False
    assert db.query(GoogleAccount).count() == 0
    assert db.query(CalendarEvent).count() == 0

    # Reconnecting afterwards still works.
    connect(auth_client, fake_google)
    assert auth_client.get("/api/google/status").json()["connected"] is True


def test_authorization_url_never_contains_the_client_secret(auth_client, fake_google):
    url = auth_client.post("/api/google/connect").json()["authorization_url"]
    assert "test-client-secret" not in url
    assert "client_id=test-client-id" in url
