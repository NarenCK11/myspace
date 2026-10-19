"""The meal-tracking migration must upgrade an account that already has data."""

from __future__ import annotations

from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

ROOT = Path(__file__).resolve().parents[1]
FIRST_REVISION = "b4fe6812c15c"
NUTRITION_TABLES = {"food_labels", "meals", "meal_labels", "weight_entries"}


def _config(url: str) -> Config:
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def test_upgrading_an_existing_database_keeps_the_owner_and_adds_meal_tracking(tmp_path):
    url = f"sqlite:///{(tmp_path / 'upgrade.sqlite3').as_posix()}"
    cfg = _config(url)
    engine = create_engine(url)

    command.upgrade(cfg, FIRST_REVISION)
    assert not NUTRITION_TABLES & set(inspect(engine).get_table_names())

    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO users (id, login_id, password_hash, display_name, timezone, theme,"
                " week_starts_on, is_active) VALUES ('u1', 'owner', 'hash', 'Owner', 'UTC',"
                " 'system', 1, 1)"
            )
        )

    command.upgrade(cfg, "head")

    assert set(inspect(engine).get_table_names()) >= NUTRITION_TABLES
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT login_id, food_labels_seeded FROM users WHERE id = 'u1'")
        ).one()
    assert row.login_id == "owner"
    assert not row.food_labels_seeded  # existing owners still get the starter labels on first use

    command.downgrade(cfg, FIRST_REVISION)
    assert not NUTRITION_TABLES & set(inspect(engine).get_table_names())
    assert "food_labels_seeded" not in {c["name"] for c in inspect(engine).get_columns("users")}
    engine.dispose()
