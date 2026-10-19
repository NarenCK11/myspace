"""Day-to-day weight log: upsert, validation, listing, editing and statistics."""

from __future__ import annotations

import datetime as dt

UTC = dt.UTC


def today() -> dt.date:
    return dt.datetime.now(UTC).date()


def days_ago(n: int) -> str:
    return (today() - dt.timedelta(days=n)).isoformat()


def log(client, weight: float, on: str | None = None, **extra):
    body = {"weight_kg": weight, **({"logged_on": on} if on else {}), **extra}
    return client.post("/api/weights", json=body)


# --- Logging ---------------------------------------------------------------


def test_logging_defaults_to_today_and_creates_the_entry(auth_client):
    response = log(auth_client, 72.4, note="after the gym")

    assert response.status_code == 201
    body = response.json()
    assert body["logged_on"] == today().isoformat()
    assert body["weight_kg"] == 72.4
    assert body["note"] == "after the gym"


def test_logging_the_same_day_again_replaces_the_entry(auth_client):
    first = log(auth_client, 72.4, days_ago(1), note="morning")
    second = log(auth_client, 72.0, days_ago(1))

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["weight_kg"] == 72.0
    assert second.json()["note"] is None  # the replacement carries its own note

    entries = auth_client.get("/api/weights").json()
    assert len(entries) == 1


def test_weights_are_rounded_to_two_decimals(auth_client):
    assert log(auth_client, 72.456).json()["weight_kg"] == 72.46


def test_weight_validation(auth_client):
    assert log(auth_client, 5).status_code == 422
    assert log(auth_client, 600).status_code == 422
    assert auth_client.post("/api/weights", json={}).status_code == 422
    assert auth_client.post("/api/weights", json={"weight_kg": "heavy"}).status_code == 422

    tomorrow = (today() + dt.timedelta(days=2)).isoformat()
    future = log(auth_client, 70, tomorrow)
    assert future.status_code == 400
    assert future.json()["error"]["code"] == "future_date"


def test_weights_are_listed_oldest_first_and_filterable(auth_client):
    for n, kg in ((10, 80.0), (5, 79.0), (1, 78.0)):
        log(auth_client, kg, days_ago(n))

    all_entries = auth_client.get("/api/weights").json()
    assert [e["weight_kg"] for e in all_entries] == [80.0, 79.0, 78.0]

    recent = auth_client.get("/api/weights", params={"start": days_ago(6)}).json()
    assert [e["weight_kg"] for e in recent] == [79.0, 78.0]

    window = auth_client.get("/api/weights", params={"start": days_ago(6), "end": days_ago(2)}).json()
    assert [e["weight_kg"] for e in window] == [79.0]

    # A limit keeps the most recent entries, still in chronological order.
    limited = auth_client.get("/api/weights", params={"limit": 2}).json()
    assert [e["weight_kg"] for e in limited] == [79.0, 78.0]


# --- Editing ---------------------------------------------------------------


def test_weight_entries_can_be_edited_and_deleted(auth_client):
    entry = log(auth_client, 75.0, days_ago(2), note="first").json()

    edited = auth_client.patch(
        f"/api/weights/{entry['id']}", json={"weight_kg": 74.6, "note": None}
    ).json()
    assert edited["weight_kg"] == 74.6
    assert edited["note"] is None
    assert edited["logged_on"] == days_ago(2)

    moved = auth_client.patch(f"/api/weights/{entry['id']}", json={"logged_on": days_ago(3)}).json()
    assert moved["logged_on"] == days_ago(3)

    assert auth_client.delete(f"/api/weights/{entry['id']}").status_code == 204
    assert auth_client.delete(f"/api/weights/{entry['id']}").status_code == 404
    assert auth_client.get("/api/weights").json() == []


def test_editing_cannot_collide_with_another_day_or_reach_the_future(auth_client):
    a = log(auth_client, 75.0, days_ago(2)).json()
    log(auth_client, 74.0, days_ago(1))

    clash = auth_client.patch(f"/api/weights/{a['id']}", json={"logged_on": days_ago(1)})
    assert clash.status_code == 409

    future = (today() + dt.timedelta(days=3)).isoformat()
    assert auth_client.patch(f"/api/weights/{a['id']}", json={"logged_on": future}).status_code == 400
    assert auth_client.patch(f"/api/weights/{a['id']}", json={"weight_kg": 1}).status_code == 422
    assert auth_client.patch("/api/weights/missing", json={"weight_kg": 70}).status_code == 404


# --- Statistics ------------------------------------------------------------


def test_stats_are_empty_before_the_first_entry(auth_client):
    stats = auth_client.get("/api/weights/stats").json()

    assert stats["latest"] is None
    assert stats["entries_count"] == 0
    assert stats["logged_today"] is False
    assert stats["change_since_previous"] is None
    assert stats["average_7d"] is None


def test_stats_with_a_single_entry_have_no_changes(auth_client):
    log(auth_client, 80.0)

    stats = auth_client.get("/api/weights/stats").json()

    assert stats["latest"]["weight_kg"] == 80.0
    assert stats["previous"] is None
    assert stats["change_since_previous"] is None
    assert stats["change_7d"] is None
    assert stats["change_30d"] is None
    assert stats["average_7d"] == 80.0
    assert stats["min_kg"] == stats["max_kg"] == 80.0


def test_stats_summarise_recent_history(auth_client):
    for n, kg in ((20, 81.0), (10, 80.0), (6, 79.5), (2, 79.0), (0, 78.5)):
        log(auth_client, kg, days_ago(n))

    stats = auth_client.get("/api/weights/stats").json()

    assert stats["latest"]["weight_kg"] == 78.5
    assert stats["previous"]["weight_kg"] == 79.0
    assert stats["logged_today"] is True
    assert stats["entries_count"] == 5
    assert stats["change_since_previous"] == -0.5
    # 7 days: oldest entry inside the window is 6 days ago (79.5).
    assert stats["change_7d"] == -1.0
    # 30 days: oldest entry inside the window is 20 days ago (81.0).
    assert stats["change_30d"] == -2.5
    # Average of the entries within 7 days of the latest: 79.5, 79.0, 78.5.
    assert stats["average_7d"] == 79.0
    assert stats["min_kg"] == 78.5
    assert stats["max_kg"] == 81.0


def test_stats_do_not_claim_today_when_the_last_entry_is_older(auth_client):
    log(auth_client, 80.0, days_ago(3))
    log(auth_client, 79.0, days_ago(1))

    stats = auth_client.get("/api/weights/stats").json()

    assert stats["logged_today"] is False
    assert stats["latest"]["logged_on"] == days_ago(1)
    assert stats["change_since_previous"] == -1.0


def test_weight_endpoints_require_authentication(client, owner):
    assert client.get("/api/weights").status_code == 401
    assert client.post("/api/weights", json={"weight_kg": 70}).status_code == 401
    assert client.get("/api/weights/stats").status_code == 401
    assert client.get("/api/meals").status_code == 401
    assert client.get("/api/meal-labels").status_code == 401
    assert client.get("/api/nutrition/summary").status_code == 401
