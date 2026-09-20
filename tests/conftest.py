"""Test fixtures.

Every test runs against a throwaway SQLite database created from the Alembic
migrations, which keeps the migration chain honest as well as the code.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

# Settings are cached at import time, so the environment must be set up first.
os.environ.setdefault("ENVIRONMENT", "development")

# SQLite by default so the suite needs no services. Point TEST_DATABASE_URL at a
# throwaway PostgreSQL database to run the same tests on the production engine:
#   TEST_DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/myspace_test pytest
SQLITE_FILE = ROOT / "tests" / ".pytest.sqlite3"
os.environ["DATABASE_URL"] = os.getenv(
    "TEST_DATABASE_URL", f"sqlite:///{SQLITE_FILE.as_posix()}"
)
USING_SQLITE = os.environ["DATABASE_URL"].startswith("sqlite")
os.environ["JWT_SECRET"] = "test-secret-key-used-only-by-the-test-suite"
os.environ["TOKEN_ENCRYPTION_KEY"] = "dGVzdC1mZXJuZXQta2V5LWZvci10aGUtdGVzdC1zdWl0ZQ=="
os.environ["COOKIE_SECURE"] = "false"
os.environ["COOKIE_SAMESITE"] = "lax"
os.environ["LOGIN_MAX_ATTEMPTS"] = "5"
os.environ["ACCESS_TOKEN_TTL_MINUTES"] = "15"
os.environ["GOOGLE_CLIENT_ID"] = "test-client-id.apps.googleusercontent.com"
os.environ["GOOGLE_CLIENT_SECRET"] = "test-client-secret"
os.environ["GOOGLE_REDIRECT_URI"] = "http://testserver/api/google/callback"
os.environ["FRONTEND_URL"] = "http://localhost:5173"

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models import Base, User  # noqa: E402

OWNER_LOGIN = "owner"
OWNER_PASSWORD = "correct-horse-battery-staple"


@pytest.fixture(scope="session", autouse=True)
def _database():
    """Build the schema from the migrations, so they are tested too."""
    if USING_SQLITE:
        SQLITE_FILE.unlink(missing_ok=True)

    alembic_cfg = Config(str(ROOT / "alembic.ini"))
    alembic_cfg.set_main_option("script_location", str(ROOT / "migrations"))
    alembic_cfg.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])
    if not USING_SQLITE:
        command.downgrade(alembic_cfg, "base")
    command.upgrade(alembic_cfg, "head")

    yield

    engine.dispose()
    if USING_SQLITE:
        SQLITE_FILE.unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def _clean_tables(_database):
    """Truncate every table between tests so each one starts from a clean slate."""
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
        session.commit()
    finally:
        session.close()


@pytest.fixture
def owner(db) -> User:
    user = User(
        login_id=OWNER_LOGIN,
        password_hash=hash_password(OWNER_PASSWORD),
        display_name="Test Owner",
        timezone="UTC",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app, base_url="http://testserver") as test_client:
        yield test_client


@pytest.fixture
def auth_client(client, owner):
    """A TestClient already signed in as the owner (bearer + refresh cookie)."""
    response = client.post(
        "/api/auth/login", json={"login_id": OWNER_LOGIN, "password": OWNER_PASSWORD}
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client
