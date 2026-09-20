"""CRUD coverage for tasks, reminders, notes, activities and tags."""

from __future__ import annotations

import datetime as dt

UTC = dt.UTC


def iso(offset_hours: float) -> str:
    return (dt.datetime.now(UTC) + dt.timedelta(hours=offset_hours)).isoformat()


# --- Tags ------------------------------------------------------------------


def test_tag_lifecycle(auth_client):
    created = auth_client.post("/api/tags", json={"name": "Health", "color": "emerald"})
    assert created.status_code == 201
    tag_id = created.json()["id"]

    assert auth_client.post("/api/tags", json={"name": "health"}).status_code == 409

    listed = auth_client.get("/api/tags").json()
    assert [t["name"] for t in listed] == ["Health"]
    assert listed[0]["task_count"] == 0

    renamed = auth_client.patch(f"/api/tags/{tag_id}", json={"name": "Wellbeing"})
    assert renamed.json()["name"] == "Wellbeing"

    assert auth_client.delete(f"/api/tags/{tag_id}").status_code == 204
    assert auth_client.get("/api/tags").json() == []


# --- Tasks -----------------------------------------------------------------


def test_task_crud_and_tag_association(auth_client):
    tag_id = auth_client.post("/api/tags", json={"name": "Work"}).json()["id"]

    created = auth_client.post(
        "/api/tasks",
        json={
            "title": "Write the quarterly summary",
            "description": "Pull the numbers first",
            "priority": "high",
            "due_at": iso(3),
            "tag_ids": [tag_id],
        },
    )
    assert created.status_code == 201
    task = created.json()
    assert task["status"] == "todo"
    assert [t["name"] for t in task["tags"]] == ["Work"]

    fetched = auth_client.get(f"/api/tasks/{task['id']}").json()
    assert fetched["title"] == "Write the quarterly summary"

    updated = auth_client.patch(
        f"/api/tasks/{task['id']}", json={"title": "Quarterly summary", "priority": "urgent"}
    ).json()
    assert updated["title"] == "Quarterly summary"
    assert updated["priority"] == "urgent"

    completed = auth_client.post(f"/api/tasks/{task['id']}/complete").json()
    assert completed["status"] == "done"
    assert completed["completed_at"] is not None

    reopened = auth_client.post(f"/api/tasks/{task['id']}/reopen").json()
    assert reopened["status"] == "todo"
    assert reopened["completed_at"] is None

    assert auth_client.delete(f"/api/tasks/{task['id']}").status_code == 204
    assert auth_client.get(f"/api/tasks/{task['id']}").status_code == 404


def test_task_views_filter_correctly(auth_client):
    auth_client.post("/api/tasks", json={"title": "Due today", "due_at": iso(2)})
    auth_client.post("/api/tasks", json={"title": "Overdue", "due_at": iso(-48)})
    auth_client.post("/api/tasks", json={"title": "Someday"})

    overdue = auth_client.get("/api/tasks", params={"view": "overdue"}).json()
    assert [t["title"] for t in overdue["items"]] == ["Overdue"]

    unscheduled = auth_client.get("/api/tasks", params={"view": "unscheduled"}).json()
    assert [t["title"] for t in unscheduled["items"]] == ["Someday"]

    all_tasks = auth_client.get("/api/tasks").json()
    assert all_tasks["total"] == 3
    assert all_tasks["has_more"] is False

    searched = auth_client.get("/api/tasks", params={"q": "overd"}).json()
    assert searched["total"] == 1


def test_task_rejects_unknown_tag(auth_client):
    response = auth_client.post(
        "/api/tasks", json={"title": "Bad tag", "tag_ids": ["00000000-0000-0000-0000-000000000000"]}
    )
    assert response.status_code == 404


def test_task_validation_errors(auth_client):
    response = auth_client.post("/api/tasks", json={"title": ""})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


# --- Reminders -------------------------------------------------------------


def test_reminder_crud_complete_snooze_and_dismiss(auth_client):
    created = auth_client.post(
        "/api/reminders", json={"title": "Call the dentist", "remind_at": iso(1)}
    )
    assert created.status_code == 201
    reminder_id = created.json()["id"]
    assert created.json()["status"] == "pending"

    snoozed = auth_client.post(f"/api/reminders/{reminder_id}/snooze", json={"minutes": 30}).json()
    assert snoozed["snoozed_until"] is not None

    completed = auth_client.post(f"/api/reminders/{reminder_id}/complete").json()
    assert completed["status"] == "done"
    assert completed["completed_at"] is not None

    dismissed = auth_client.post(f"/api/reminders/{reminder_id}/dismiss").json()
    assert dismissed["status"] == "dismissed"

    assert auth_client.delete(f"/api/reminders/{reminder_id}").status_code == 204


def test_repeating_reminder_rolls_forward_instead_of_closing(auth_client):
    created = auth_client.post(
        "/api/reminders",
        json={"title": "Weekly review", "remind_at": iso(1), "repeat_rule": "weekly"},
    ).json()

    completed = auth_client.post(f"/api/reminders/{created['id']}/complete").json()
    assert completed["status"] == "pending"

    before = dt.datetime.fromisoformat(created["remind_at"])
    after = dt.datetime.fromisoformat(completed["remind_at"])
    assert (after - before).days == 7


def test_reminder_views(auth_client):
    auth_client.post("/api/reminders", json={"title": "Later", "remind_at": iso(5)})
    auth_client.post("/api/reminders", json={"title": "Missed", "remind_at": iso(-5)})

    assert auth_client.get("/api/reminders", params={"view": "overdue"}).json()["total"] == 1
    assert auth_client.get("/api/reminders", params={"view": "upcoming"}).json()["total"] == 1


# --- Notes -----------------------------------------------------------------


def test_note_crud_and_views(auth_client):
    created = auth_client.post(
        "/api/notes",
        json={"title": "Wifi password", "content": "hunter2", "is_important": True},
    )
    assert created.status_code == 201
    note_id = created.json()["id"]

    important = auth_client.get("/api/notes", params={"view": "important"}).json()
    assert important["total"] == 1

    pinned = auth_client.patch(f"/api/notes/{note_id}", json={"is_pinned": True}).json()
    assert pinned["is_pinned"] is True

    archived = auth_client.patch(f"/api/notes/{note_id}", json={"is_archived": True}).json()
    assert archived["is_archived"] is True
    assert auth_client.get("/api/notes").json()["total"] == 0
    assert auth_client.get("/api/notes", params={"view": "archived"}).json()["total"] == 1

    assert auth_client.delete(f"/api/notes/{note_id}").status_code == 204


# --- Activities ------------------------------------------------------------


def test_manual_activity_crud(auth_client):
    created = auth_client.post(
        "/api/activities", json={"title": "Gym session", "duration_minutes": 60}
    )
    assert created.status_code == 201
    activity = created.json()
    assert activity["source"] == "manual"

    updated = auth_client.patch(
        f"/api/activities/{activity['id']}", json={"title": "Gym + sauna"}
    ).json()
    assert updated["title"] == "Gym + sauna"

    assert auth_client.delete(f"/api/activities/{activity['id']}").status_code == 204


def test_system_activities_are_recorded_and_not_editable(auth_client):
    auth_client.post("/api/tasks", json={"title": "Buy milk"})

    system = auth_client.get("/api/activities", params={"source": "system"}).json()
    assert system["total"] == 1
    entry = system["items"][0]
    assert entry["action"] == "created"
    assert entry["entity_type"] == "task"
    assert "Buy milk" in entry["title"]

    blocked = auth_client.patch(f"/api/activities/{entry['id']}", json={"title": "Tampered"})
    assert blocked.status_code == 403


# --- Quick add -------------------------------------------------------------


def test_quick_add_creates_each_kind(auth_client):
    for kind in ("task", "reminder", "note", "activity"):
        payload = {"kind": kind, "title": f"Quick {kind}"}
        if kind == "reminder":
            payload["when"] = iso(2)
        response = auth_client.post("/api/quick-add", json=payload)
        assert response.status_code == 201, response.text
        assert response.json()["kind"] == kind

    assert auth_client.get("/api/tasks").json()["total"] == 1
    assert auth_client.get("/api/reminders").json()["total"] == 1
    assert auth_client.get("/api/notes").json()["total"] == 1
    assert auth_client.get("/api/activities", params={"source": "manual"}).json()["total"] == 1
