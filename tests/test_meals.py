"""Meals, food labels, daily summaries, history, suggestions and search."""

from __future__ import annotations

import datetime as dt

from app.core.security import hash_password
from app.models import FoodLabel, Meal, User

UTC = dt.UTC

DEFAULT_LABEL_NAMES = {"Healthy", "Unhealthy", "Protein", "Fibre", "Fatty", "Carbs", "Sugary", "Fried"}


def at(day: str, hour: int = 12, minute: int = 0) -> str:
    year, month, date = (int(part) for part in day.split("-"))
    return dt.datetime(year, month, date, hour, minute, tzinfo=UTC).isoformat()


def labels(client) -> dict[str, dict]:
    return {label["name"]: label for label in client.get("/api/meal-labels").json()}


def log_meal(client, name: str, *label_names: str, when: str | None = None, **extra) -> dict:
    by_name = labels(client)
    payload = {
        "name": name,
        "label_ids": [by_name[n]["id"] for n in label_names],
        **({"eaten_at": when} if when else {}),
        **extra,
    }
    response = client.post("/api/meals", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


# --- Labels ----------------------------------------------------------------


def test_default_labels_are_created_once_with_tones(auth_client):
    first = labels(auth_client)
    assert set(first) == DEFAULT_LABEL_NAMES
    assert first["Healthy"]["tone"] == "good"
    assert first["Unhealthy"]["tone"] == "bad"
    assert first["Protein"]["tone"] == "good"
    assert first["Fatty"]["tone"] == "neutral"

    assert set(labels(auth_client)) == DEFAULT_LABEL_NAMES  # listing again adds nothing


def test_deleted_default_labels_do_not_come_back(auth_client):
    by_name = labels(auth_client)
    assert auth_client.delete(f"/api/meal-labels/{by_name['Fried']['id']}").status_code == 204

    assert "Fried" not in labels(auth_client)


def test_label_lifecycle(auth_client):
    created = auth_client.post(
        "/api/meal-labels", json={"name": "Spicy", "color": "orange", "tone": "neutral"}
    )
    assert created.status_code == 201
    label_id = created.json()["id"]

    assert auth_client.post("/api/meal-labels", json={"name": "spicy"}).status_code == 409
    assert auth_client.post("/api/meal-labels", json={"name": "X", "color": "pink"}).status_code == 422
    assert auth_client.post("/api/meal-labels", json={"name": "X", "tone": "evil"}).status_code == 422

    updated = auth_client.patch(
        f"/api/meal-labels/{label_id}", json={"name": "Very spicy", "tone": "bad"}
    ).json()
    assert updated["name"] == "Very spicy"
    assert updated["tone"] == "bad"

    clash = auth_client.patch(f"/api/meal-labels/{label_id}", json={"name": "healthy"})
    assert clash.status_code == 409

    assert auth_client.delete(f"/api/meal-labels/{label_id}").status_code == 204
    assert auth_client.patch(f"/api/meal-labels/{label_id}", json={"name": "Z"}).status_code == 404


def test_deleting_a_label_keeps_the_meals(auth_client):
    meal = log_meal(auth_client, "Fries", "Fried", "Unhealthy")
    fried = labels(auth_client)["Fried"]
    assert fried["meal_count"] == 1

    auth_client.delete(f"/api/meal-labels/{fried['id']}")

    kept = auth_client.get(f"/api/meals/{meal['id']}").json()
    assert [label["name"] for label in kept["labels"]] == ["Unhealthy"]


# --- Meals -----------------------------------------------------------------


def test_meal_lifecycle(auth_client):
    meal = log_meal(
        auth_client,
        "Paneer wrap",
        "Protein",
        "Carbs",
        when=at("2026-03-10", 13, 30),
        meal_type="lunch",
        portion="1 large",
        calories=520,
        notes="  from the canteen  ",
    )
    assert meal["meal_type"] == "lunch"
    assert meal["calories"] == 520
    assert meal["notes"] == "from the canteen"
    assert [label["name"] for label in meal["labels"]] == ["Protein", "Carbs"]

    by_name = labels(auth_client)
    updated = auth_client.patch(
        f"/api/meals/{meal['id']}",
        json={
            "name": "Paneer wrap with salad",
            "calories": None,
            "portion": None,
            "label_ids": [by_name["Healthy"]["id"]],
        },
    ).json()
    assert updated["name"] == "Paneer wrap with salad"
    assert updated["calories"] is None
    assert updated["portion"] is None
    assert [label["name"] for label in updated["labels"]] == ["Healthy"]
    assert updated["meal_type"] == "lunch"  # untouched fields survive a partial update

    assert auth_client.delete(f"/api/meals/{meal['id']}").status_code == 204
    assert auth_client.get(f"/api/meals/{meal['id']}").status_code == 404


def test_a_meal_name_cannot_be_blanked_or_cleared(auth_client):
    meal = log_meal(auth_client, "Oats")

    assert auth_client.patch(f"/api/meals/{meal['id']}", json={"name": ""}).status_code == 422
    kept = auth_client.patch(f"/api/meals/{meal['id']}", json={"name": None, "notes": "n"}).json()
    assert kept["name"] == "Oats"
    assert kept["notes"] == "n"


def test_meal_validation(auth_client):
    labels(auth_client)
    assert auth_client.post("/api/meals", json={"name": "   "}).status_code == 422
    assert auth_client.post("/api/meals", json={"name": "x", "calories": -5}).status_code == 422
    assert auth_client.post("/api/meals", json={"name": "x", "meal_type": "brunch"}).status_code == 422
    bad_label = auth_client.post(
        "/api/meals", json={"name": "x", "label_ids": ["00000000-0000-0000-0000-000000000000"]}
    )
    assert bad_label.status_code == 404

    many = auth_client.post("/api/meals", json={"name": "x", "label_ids": ["a"] * 13})
    assert many.status_code == 422


def test_meals_and_labels_of_another_account_are_unreachable(auth_client, db):
    stranger = User(login_id="stranger", password_hash=hash_password("another-passphrase"))
    db.add(stranger)
    db.flush()
    foreign_label = FoodLabel(user_id=stranger.id, name="Secret", tone="good")
    foreign_meal = Meal(user_id=stranger.id, name="Hidden", eaten_at=dt.datetime.now(UTC))
    db.add_all([foreign_label, foreign_meal])
    db.commit()

    assert auth_client.get(f"/api/meals/{foreign_meal.id}").status_code == 404
    assert auth_client.delete(f"/api/meals/{foreign_meal.id}").status_code == 404
    assert auth_client.patch(f"/api/meal-labels/{foreign_label.id}", json={"name": "Mine"}).status_code == 404
    stolen = auth_client.post("/api/meals", json={"name": "x", "label_ids": [foreign_label.id]})
    assert stolen.status_code == 404
    assert auth_client.get("/api/meals").json()["total"] == 0
    assert "Secret" not in labels(auth_client)
