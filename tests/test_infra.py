"""Migrations, the owner CLI, security primitives and timezone handling."""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.core import security
from app.db.base import utcnow
from app.models import Base, User
from app.services import timeutil

ROOT = Path(__file__).resolve().parents[1]
UTC = dt.UTC


# --- Migrations ------------------------------------------------------------


def _alembic_config(url: str) -> Config:
    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))
    cfg.set_main_option("sqlalchemy.url", url)
    return cfg


def test_migrations_build_the_full_schema_and_roll_back(tmp_path):
    db_file = tmp_path / "migration-check.sqlite3"
    url = f"sqlite:///{db_file.as_posix()}"
    cfg = _alembic_config(url)

    command.upgrade(cfg, "head")

    engine = create_engine(url)
    tables = set(inspect(engine).get_table_names())
    expected = set(Base.metadata.tables) | {"alembic_version"}
    assert expected <= tables, f"missing tables: {expected - tables}"

    command.downgrade(cfg, "base")
    remaining = set(inspect(engine).get_table_names()) - {"alembic_version"}
    assert remaining == set()
    engine.dispose()


def test_every_model_column_exists_in_the_migrated_schema(tmp_path):
    db_file = tmp_path / "columns.sqlite3"
    url = f"sqlite:///{db_file.as_posix()}"
    command.upgrade(_alembic_config(url), "head")

    engine = create_engine(url)
    inspector = inspect(engine)
    for table_name, table in Base.metadata.tables.items():
        actual = {c["name"] for c in inspector.get_columns(table_name)}
        expected = {c.name for c in table.columns}
        assert expected == actual, f"{table_name}: expected {expected}, got {actual}"
    engine.dispose()


# --- Owner CLI -------------------------------------------------------------


def test_create_owner_cli_is_idempotent_and_can_reset(monkeypatch, capsys, db):
    from app import cli
    from app.core.config import settings

    monkeypatch.setattr(settings, "owner_login_id", "cli-owner")
    monkeypatch.setattr(settings, "owner_password", "a-long-enough-passphrase")
    monkeypatch.setattr(settings, "owner_display_name", "CLI Owner")
    monkeypatch.setattr(settings, "owner_email", None)
    monkeypatch.setattr(settings, "owner_timezone", "UTC")

    assert cli.create_owner() == 0
    assert "created" in capsys.readouterr().out

    user = db.query(User).filter(User.login_id == "cli-owner").one()
    first_hash = user.password_hash
    assert security.verify_password("a-long-enough-passphrase", first_hash)

    # Running it again is a no-op rather than an error.
    assert cli.create_owner() == 0
    assert "already exists" in capsys.readouterr().out

    monkeypatch.setattr(settings, "owner_password", "a-different-passphrase")
    assert cli.reset_password() == 0
    db.expire_all()
    user = db.query(User).filter(User.login_id == "cli-owner").one()
    assert security.verify_password("a-different-passphrase", user.password_hash)

    assert cli.show_owner() == 0
    assert "cli-owner" in capsys.readouterr().out


def test_create_owner_requires_credentials(monkeypatch):
    from app import cli
    from app.core.config import settings

    monkeypatch.setattr(settings, "owner_login_id", None)
    monkeypatch.setattr(settings, "owner_password", None)
    with pytest.raises(SystemExit):
        cli.create_owner()


def test_create_owner_rejects_a_short_password(monkeypatch):
    from app import cli
    from app.core.config import settings

    monkeypatch.setattr(settings, "owner_login_id", "x")
    monkeypatch.setattr(settings, "owner_password", "short")
    with pytest.raises(SystemExit):
        cli.create_owner()


def test_bootstrap_owner_creates_account_when_database_is_empty(monkeypatch, db):
    from app import cli
    from app.core import security
    from app.core.config import settings

    monkeypatch.setattr(settings, "owner_login_id", "bootstrap-owner")
    monkeypatch.setattr(settings, "owner_password", "a-long-enough-passphrase")
    monkeypatch.setattr(settings, "owner_display_name", "Bootstrap Owner")
    monkeypatch.setattr(settings, "owner_email", None)
    monkeypatch.setattr(settings, "owner_timezone", "UTC")

    assert cli.bootstrap_owner() == 0

    user = db.query(User).filter(User.login_id == "bootstrap-owner").one()
    assert user.display_name == "Bootstrap Owner"
    assert security.verify_password("a-long-enough-passphrase", user.password_hash)


def test_bootstrap_owner_does_not_modify_existing_account(monkeypatch, capsys, owner):
    from app import cli
    from app.core.config import settings

    monkeypatch.setattr(settings, "owner_login_id", "different-owner")
    monkeypatch.setattr(settings, "owner_password", "a-different-passphrase")
    original_hash = owner.password_hash

    assert cli.bootstrap_owner() == 0

    assert "bootstrap skipped" in capsys.readouterr().out
    assert owner.password_hash == original_hash
    assert owner.login_id == "owner"


# --- Security primitives ---------------------------------------------------


def test_password_hashing_round_trip():
    digest = security.hash_password("a-real-passphrase")
    assert digest != "a-real-passphrase"
    assert digest.startswith("$argon2")
    assert security.verify_password("a-real-passphrase", digest)
    assert not security.verify_password("wrong", digest)
    assert not security.verify_password("a-real-passphrase", "not-a-hash")


def test_access_tokens_encode_and_expire():
    token, expires_in = security.create_access_token("user-123")
    assert expires_in > 0

    payload = security.decode_access_token(token)
    assert payload.user_id == "user-123"
    assert payload.expires_at > utcnow()

    expired, _ = security.create_access_token("user-123", expires_in_minutes=-1)
    with pytest.raises(security.TokenError):
        security.decode_access_token(expired)

    with pytest.raises(security.TokenError):
        security.decode_access_token("garbage")


def test_refresh_tokens_are_unique_and_hashed():
    a = security.generate_refresh_token()
    b = security.generate_refresh_token()
    assert a != b
    assert len(a) > 40
    assert security.hash_refresh_token(a) == security.hash_refresh_token(a)
    assert security.hash_refresh_token(a) != security.hash_refresh_token(b)
    assert a not in security.hash_refresh_token(a)


def test_oauth_tokens_encrypt_and_decrypt():
    secret = "ya29.a0AfH6SMB-example-token"
    encrypted = security.encrypt_secret(secret)
    assert encrypted != secret
    assert secret not in encrypted
    assert security.decrypt_secret(encrypted) == secret
    with pytest.raises(security.TokenError):
        security.decrypt_secret("not-a-fernet-token")


def test_pkce_pair_is_valid():
    verifier, challenge = security.generate_pkce_pair()
    assert 43 <= len(verifier) <= 128
    assert "=" not in challenge
    assert verifier != challenge


# --- Timezone handling -----------------------------------------------------


def test_day_bounds_follow_the_owners_timezone():
    day = dt.date(2026, 3, 15)
    start_utc, end_utc = timeutil.day_bounds(day, "UTC")
    assert start_utc == dt.datetime(2026, 3, 15, tzinfo=UTC)
    assert end_utc == dt.datetime(2026, 3, 16, tzinfo=UTC)

    # Asia/Kolkata is UTC+5:30, so its day starts the previous evening in UTC.
    start_ist, end_ist = timeutil.day_bounds(day, "Asia/Kolkata")
    assert start_ist == dt.datetime(2026, 3, 14, 18, 30, tzinfo=UTC)
    assert (end_ist - start_ist) == dt.timedelta(days=1)


def test_unknown_timezone_falls_back_to_utc():
    assert timeutil.get_tz("Not/AZone").key == "UTC"
    assert timeutil.get_tz(None).key == "UTC"


def test_week_bounds_span_seven_days():
    start, end = timeutil.week_bounds(dt.date(2026, 3, 18), "UTC", week_starts_on=1)
    assert (end - start) == dt.timedelta(days=7)
    assert start == dt.datetime(2026, 3, 16, tzinfo=UTC)  # the Monday


def test_datetimes_round_trip_as_utc_through_the_database(db, owner):
    from app.models import Task

    aware = dt.datetime(2026, 5, 1, 9, 30, tzinfo=dt.timezone(dt.timedelta(hours=5, minutes=30)))
    task = Task(user_id=owner.id, title="TZ check", due_at=aware)
    db.add(task)
    db.commit()
    db.expire_all()

    stored = db.query(Task).filter(Task.id == task.id).one()
    assert stored.due_at.tzinfo is not None
    assert stored.due_at == aware
    assert stored.due_at.utcoffset() == dt.timedelta(0)


def test_health_endpoint(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["database"] == "up"
