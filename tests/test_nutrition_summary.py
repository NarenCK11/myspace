"""Meal listing, daily summaries, history, suggestions, search and the dashboard."""

from __future__ import annotations

import datetime as dt

from tests.test_meals import at, labels, log_meal

UTC = dt.UTC


# --- Listing ---------------------------------------------------------------


def test_meals_are_grouped_by_the_owners_local_day(auth_client):
    auth_client.patch("/api/auth/me", json={"timezone": "Asia/Kolkata"})  # UTC+5:30

    # 20:00 UTC on the 14th is 01:30 on the 15th in Kolkata.
    log_meal(auth_client, "Midnight snack", when=at("2026-03-14", 20, 0))
    log_meal(auth_client, "Morning tea", when=at("2026-03-14", 4, 0))

    on_14 = auth_client.get("/api/meals", params={"day": "2026-03-14"}).json()
    on_15 = auth_client.get("/api/meals", params={"day": "2026-03-15"}).json()
    assert [m["name"] for m in on_14["items"]] == ["Morning tea"]
    assert [m["name"] for m in on_15["items"]] == ["Midnight snack"]


def test_meal_list_filters_and_ordering(auth_client):
    log_meal(auth_client, "Egg bhurji", "Protein", when=at("2026-03-10", 8), meal_type="breakfast")
    log_meal(
        auth_client, "Chicken curry", "Protein", "Fatty", when=at("2026-03-10", 13), meal_type="lunch"
    )
    log_meal(auth_client, "Samosa", "Fried", when=at("2026-03-10", 17), meal_type="snack")
    protein = labels(auth_client)["Protein"]["id"]

    def names(**params) -> list[str]:
        body = auth_client.get("/api/meals", params={"day": "2026-03-10", **params}).json()
        return [m["name"] for m in body["items"]]

    assert names(order="asc") == ["Egg bhurji", "Chicken curry", "Samosa"]
    assert names(order="desc") == ["Samosa", "Chicken curry", "Egg bhurji"]
    assert names(meal_type="lunch") == ["Chicken curry"]
    assert sorted(names(label_id=protein)) == ["Chicken curry", "Egg bhurji"]
    assert names(q="SAMO") == ["Samosa"]
    assert names(q="%") == []  # a percent sign typed by the user is literal, not a wildcard


def test_meal_list_is_paginated(auth_client):
    for i in range(5):
        log_meal(auth_client, f"Item {i}", when=at("2026-03-10", 8 + i))

    page = auth_client.get("/api/meals", params={"limit": 2, "order": "asc"}).json()
    assert page["total"] == 5
    assert len(page["items"]) == 2
    assert page["has_more"] is True


# --- Summary and history ---------------------------------------------------


def test_day_summary_classifies_each_meal_by_label_tone(auth_client):
    day = "2026-03-10"
    log_meal(auth_client, "Salad bowl", "Healthy", "Protein", when=at(day, 13), calories=350)
    log_meal(auth_client, "Burger", "Unhealthy", "Fatty", when=at(day, 14), calories=800)
    log_meal(auth_client, "Pizza with salad", "Healthy", "Unhealthy", when=at(day, 15))
    log_meal(auth_client, "Water", when=at(day, 16))
    log_meal(auth_client, "Rice", "Carbs", when=at(day, 17), calories=200)
    log_meal(auth_client, "Other day", "Healthy", when=at("2026-03-11", 9))

    summary = auth_client.get("/api/nutrition/summary", params={"day": day}).json()

    assert summary["meals_count"] == 5
    assert summary["good_count"] == 1  # salad bowl: good + good
    assert summary["bad_count"] == 1  # burger: bad + neutral
    assert summary["mixed_count"] == 1  # pizza with salad: good + bad
    assert summary["neutral_count"] == 2  # water (no labels) and rice (neutral only)
    buckets = ("good_count", "mixed_count", "bad_count", "neutral_count")
    assert sum(summary[key] for key in buckets) == summary["meals_count"]

    # Calories add up only the meals that have one.
    assert summary["calories_total"] == 1350
    assert summary["calories_logged_count"] == 3

    counts = {row["name"]: row["count"] for row in summary["label_counts"]}
    assert counts == {"Healthy": 2, "Protein": 1, "Unhealthy": 2, "Fatty": 1, "Carbs": 1}
    assert summary["label_counts"][0]["count"] == 2  # most used first


def test_summary_for_an_empty_day_and_the_default_day(auth_client):
    empty = auth_client.get("/api/nutrition/summary", params={"day": "2020-01-01"}).json()
    assert empty["meals_count"] == 0
    assert empty["calories_total"] == 0
    assert empty["label_counts"] == []
    assert empty["weight_kg"] is None

    today = auth_client.get("/api/nutrition/summary").json()
    assert today["date"] == dt.datetime.now(UTC).date().isoformat()


def test_history_returns_every_day_in_order_with_weight(auth_client):
    log_meal(auth_client, "A", "Healthy", when=at("2026-03-08", 9))
    log_meal(auth_client, "B", "Unhealthy", when=at("2026-03-08", 19))
    log_meal(auth_client, "C", "Healthy", "Unhealthy", when=at("2026-03-10", 9))
    auth_client.post("/api/weights", json={"logged_on": "2026-03-09", "weight_kg": 71.4})

    body = auth_client.get("/api/nutrition/history", params={"days": 4, "end": "2026-03-10"}).json()

    dates = [d["date"] for d in body["days"]]
    assert dates == ["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]
    by_date = {d["date"]: d for d in body["days"]}
    assert by_date["2026-03-07"]["meals_count"] == 0
    assert by_date["2026-03-08"]["good_count"] == 1
    assert by_date["2026-03-08"]["bad_count"] == 1
    assert by_date["2026-03-09"]["weight_kg"] == 71.4
    assert by_date["2026-03-10"]["mixed_count"] == 1

    assert body["days_with_meals"] == 2
    assert body["meals_count"] == 3
    assert (body["good_count"], body["bad_count"], body["mixed_count"]) == (1, 1, 1)
    totals = {row["name"]: row["count"] for row in body["label_totals"]}
    assert totals == {"Healthy": 2, "Unhealthy": 2}


def test_history_range_is_validated(auth_client):
    assert auth_client.get("/api/nutrition/history", params={"days": 0}).status_code == 422
    assert auth_client.get("/api/nutrition/history", params={"days": 500}).status_code == 422
    thirty = auth_client.get("/api/nutrition/history", params={"days": 30}).json()
    assert len(thirty["days"]) == 30


# --- Suggestions, search, dashboard ----------------------------------------


def test_suggestions_rank_by_frequency_and_use_the_latest_details(auth_client):
    log_meal(auth_client, "Oats", "Healthy", when=at("2026-03-01", 8), calories=300)
    log_meal(auth_client, "oats", "Healthy", "Fibre", when=at("2026-03-02", 8), calories=320)
    log_meal(auth_client, "Oats", when=at("2026-03-03", 8), calories=340)
    log_meal(auth_client, "Coffee", when=at("2026-03-03", 10))
    log_meal(auth_client, "Biryani", "Carbs", when=at("2026-03-04", 14))

    body = auth_client.get("/api/meals/suggestions").json()

    assert [s["name"] for s in body] == ["Oats", "Biryani", "Coffee"]
    assert body[0]["times_logged"] == 3
    assert body[0]["calories"] == 340  # the newest entry wins
    limited = auth_client.get("/api/meals/suggestions", params={"limit": 1}).json()
    assert [s["name"] for s in limited] == ["Oats"]


def test_search_finds_meals_by_name_notes_and_portion(auth_client):
    log_meal(auth_client, "Masala dosa", "Carbs", when=at("2026-03-10", 9), notes="extra chutney")
    log_meal(auth_client, "Tea", portion="1 cup masala")

    body = auth_client.get("/api/search", params={"q": "masala"}).json()
    assert body["counts"]["meal"] == 2

    hit = next(h for h in body["hits"] if h["title"] == "Masala dosa")
    assert hit["kind"] == "meal"
    assert hit["url"].startswith("/meals?day=2026-03-10&focus=")
    assert hit["tags"] == ["Carbs"]

    only = auth_client.get("/api/search", params={"q": "masala", "kind": ["meal"]}).json()
    assert set(only["counts"]) == {"meal"}


def test_dashboard_reports_todays_nutrition_and_weight(auth_client):
    log_meal(auth_client, "Fruit bowl", "Healthy", when=dt.datetime.now(UTC).isoformat())
    auth_client.post("/api/weights", json={"weight_kg": 70.5})

    nutrition = auth_client.get("/api/dashboard").json()["nutrition"]

    assert nutrition["today"]["meals_count"] == 1
    assert nutrition["today"]["good_count"] == 1
    assert nutrition["today"]["weight_kg"] == 70.5
    assert nutrition["weight"]["latest"]["weight_kg"] == 70.5
    assert nutrition["weight"]["logged_today"] is True
