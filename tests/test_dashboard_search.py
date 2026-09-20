"""Dashboard, Today, calendar feed and global search."""

from __future__ import annotations

import datetime as dt

UTC = dt.UTC


def iso(offset_hours: float) -> str:
    return (dt.datetime.now(UTC) + dt.timedelta(hours=offset_hours)).isoformat()


def test_dashboard_is_empty_but_well_formed_for_a_new_account(auth_client):
    body = auth_client.get("/api/dashboard").json()
    assert body["counts"]["tasks_open"] == 0
    assert body["today_tasks"] == []
    assert body["google_connected"] is False
    assert body["greeting_name"] == "Test Owner"
    assert body["completion_rate"] == 0.0


def test_dashboard_counts_reflect_content(auth_client):
    auth_client.post("/api/tasks", json={"title": "Due soon", "due_at": iso(1)})
    auth_client.post("/api/tasks", json={"title": "Late", "due_at": iso(-30)})
    done = auth_client.post("/api/tasks", json={"title": "Finished"}).json()
    auth_client.post(f"/api/tasks/{done['id']}/complete")
    auth_client.post("/api/reminders", json={"title": "Ping", "remind_at": iso(2)})
    auth_client.post("/api/notes", json={"title": "Keep", "is_important": True})

    body = auth_client.get("/api/dashboard").json()
    counts = body["counts"]

    assert counts["tasks_open"] == 2
    assert counts["tasks_overdue"] == 1
    assert counts["tasks_completed_today"] == 1
    assert counts["reminders_pending"] == 1
    assert counts["notes_total"] == 1

    assert [t["title"] for t in body["overdue_tasks"]] == ["Late"]
    assert [n["title"] for n in body["important_notes"]] == ["Keep"]
    assert body["streak_days"] == 1
    # Recent activity picks up the automatic history entries.
    assert len(body["recent_activities"]) >= 4


def test_today_endpoint_groups_the_day(auth_client):
    auth_client.post("/api/tasks", json={"title": "Today task", "due_at": iso(1)})
    auth_client.post("/api/reminders", json={"title": "Today reminder", "remind_at": iso(1)})
    auth_client.post("/api/activities", json={"title": "Morning walk"})

    body = auth_client.get("/api/today").json()
    assert [t["title"] for t in body["tasks"]] == ["Today task"]
    assert [r["title"] for r in body["reminders"]] == ["Today reminder"]
    assert [a["title"] for a in body["activities"]] == ["Morning walk"]
    assert body["events"] == []


def test_calendar_feed_merges_local_item_kinds(auth_client):
    auth_client.post("/api/tasks", json={"title": "Calendar task", "due_at": iso(4)})
    auth_client.post("/api/reminders", json={"title": "Calendar reminder", "remind_at": iso(5)})
    auth_client.post("/api/activities", json={"title": "Calendar activity"})

    start = (dt.datetime.now(UTC) - dt.timedelta(days=1)).isoformat()
    end = (dt.datetime.now(UTC) + dt.timedelta(days=7)).isoformat()
    body = auth_client.get("/api/calendar/events", params={"start": start, "end": end}).json()

    kinds = {item["kind"] for item in body["items"]}
    assert kinds == {"task", "reminder", "activity"}
    assert body["google_connected"] is False
    # Items come back in chronological order.
    starts = [item["start_at"] for item in body["items"]]
    assert starts == sorted(starts)


def test_calendar_feed_can_be_filtered_by_kind(auth_client):
    auth_client.post("/api/tasks", json={"title": "Only task", "due_at": iso(4)})
    auth_client.post("/api/reminders", json={"title": "Hidden", "remind_at": iso(5)})

    start = (dt.datetime.now(UTC) - dt.timedelta(days=1)).isoformat()
    end = (dt.datetime.now(UTC) + dt.timedelta(days=7)).isoformat()
    body = auth_client.get(
        "/api/calendar/events", params={"start": start, "end": end, "kind": ["task"]}
    ).json()
    assert {i["kind"] for i in body["items"]} == {"task"}


def test_calendar_feed_rejects_an_inverted_range(auth_client):
    start = dt.datetime.now(UTC).isoformat()
    end = (dt.datetime.now(UTC) - dt.timedelta(days=1)).isoformat()
    response = auth_client.get("/api/calendar/events", params={"start": start, "end": end})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_range"


# --- Search ----------------------------------------------------------------


def test_search_spans_every_content_type(auth_client):
    auth_client.post("/api/tasks", json={"title": "Renew passport"})
    auth_client.post("/api/notes", json={"title": "Travel", "content": "passport expires in May"})
    auth_client.post("/api/reminders", json={"title": "Passport photos", "remind_at": iso(3)})
    auth_client.post("/api/activities", json={"title": "Passport office visit"})

    body = auth_client.get("/api/search", params={"q": "passport"}).json()
    assert body["query"] == "passport"
    assert body["counts"]["task"] == 1
    assert body["counts"]["note"] == 1
    assert body["counts"]["reminder"] == 1
    assert body["counts"]["activity"] >= 1
    assert body["total"] == len(body["hits"])

    note_hit = next(h for h in body["hits"] if h["kind"] == "note")
    assert "passport expires" in note_hit["snippet"]
    assert note_hit["url"].startswith("/notes?focus=")


def test_search_is_case_insensitive(auth_client):
    auth_client.post("/api/tasks", json={"title": "Book DENTIST appointment"})
    assert auth_client.get("/api/search", params={"q": "dentist"}).json()["counts"]["task"] == 1


def test_search_can_be_restricted_to_a_kind(auth_client):
    auth_client.post("/api/tasks", json={"title": "Shared word"})
    auth_client.post("/api/notes", json={"title": "Shared word"})

    body = auth_client.get("/api/search", params={"q": "shared", "kind": ["note"]}).json()
    assert set(body["counts"]) == {"note"}
    assert body["total"] == 1


def test_search_treats_wildcards_literally(auth_client):
    auth_client.post("/api/tasks", json={"title": "Plain title"})
    # "%" must not act as a LIKE wildcard that matches everything.
    assert auth_client.get("/api/search", params={"q": "%"}).json()["total"] == 0


def test_empty_search_returns_nothing(auth_client):
    auth_client.post("/api/tasks", json={"title": "Something"})
    body = auth_client.get("/api/search", params={"q": "   "}).json()
    assert body["total"] == 0
    assert body["hits"] == []
