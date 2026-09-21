"""The portal must be fully usable with Google Calendar switched off.

Google is an optional integration. With no credentials configured the rest of
the app has to keep working, and the API has to say so clearly enough that the
UI can hide the integration instead of prompting for it.
"""

from __future__ import annotations

import datetime as dt

import pytest

from app.core.config import settings

UTC = dt.UTC


def iso(offset_hours: float) -> str:
    return (dt.datetime.now(UTC) + dt.timedelta(hours=offset_hours)).isoformat()


@pytest.fixture
def google_unconfigured(monkeypatch):
    """Run as if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET were never set."""
    monkeypatch.setattr(settings, "google_client_id", None)
    monkeypatch.setattr(settings, "google_client_secret", None)
    return settings


def test_dashboard_reports_google_as_unconfigured(auth_client, google_unconfigured):
    body = auth_client.get("/api/dashboard").json()
    assert body["google_configured"] is False
    assert body["google_connected"] is False
    assert body["today_events"] == []


def test_today_reports_google_as_unconfigured(auth_client, google_unconfigured):
    body = auth_client.get("/api/today").json()
    assert body["google_configured"] is False
    assert body["google_connected"] is False
    assert body["events"] == []


def test_calendar_feed_reports_google_as_unconfigured(auth_client, google_unconfigured):
    start = (dt.datetime.now(UTC) - dt.timedelta(days=1)).isoformat()
    end = (dt.datetime.now(UTC) + dt.timedelta(days=7)).isoformat()
    body = auth_client.get("/api/calendar/events", params={"start": start, "end": end}).json()
    assert body["google_configured"] is False
    assert body["google_connected"] is False


def test_google_status_reports_unconfigured_without_erroring(auth_client, google_unconfigured):
    response = auth_client.get("/api/google/status")
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is False
    assert body["connected"] is False
    assert body["calendars"] == []


def test_connecting_without_credentials_fails_clearly(auth_client, google_unconfigured):
    response = auth_client.post("/api/google/connect")
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "google_not_configured"


def test_the_calendar_still_works_without_google(auth_client, google_unconfigured):
    auth_client.post("/api/tasks", json={"title": "Calendar task", "due_at": iso(4)})
    auth_client.post("/api/reminders", json={"title": "Calendar reminder", "remind_at": iso(5)})
    auth_client.post("/api/activities", json={"title": "Calendar activity"})

    start = (dt.datetime.now(UTC) - dt.timedelta(days=1)).isoformat()
    end = (dt.datetime.now(UTC) + dt.timedelta(days=7)).isoformat()
    body = auth_client.get("/api/calendar/events", params={"start": start, "end": end}).json()

    assert {item["kind"] for item in body["items"]} == {"task", "reminder", "activity"}


def test_every_core_page_loads_without_google(auth_client, google_unconfigured):
    auth_client.post("/api/tasks", json={"title": "Write it down", "due_at": iso(2)})
    auth_client.post("/api/notes", json={"title": "A note", "content": "body"})

    for path in (
        "/api/dashboard",
        "/api/today",
        "/api/tasks",
        "/api/reminders",
        "/api/notes",
        "/api/activities",
        "/api/tags",
        "/api/search?q=write",
    ):
        assert auth_client.get(path).status_code == 200, path


def test_flags_flip_once_credentials_are_present(auth_client):
    """With credentials set (the suite's default), the UI is told it can offer Connect."""
    assert auth_client.get("/api/dashboard").json()["google_configured"] is True
    assert auth_client.get("/api/today").json()["google_configured"] is True
    assert auth_client.get("/api/google/status").json()["configured"] is True
    # Configured but not yet connected: the connect handshake is available.
    assert auth_client.post("/api/google/connect").status_code == 200
