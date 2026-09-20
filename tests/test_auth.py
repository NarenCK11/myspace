"""Login, refresh rotation, logout and protected-route behaviour."""

from __future__ import annotations

from app.core.config import settings
from tests.conftest import OWNER_LOGIN, OWNER_PASSWORD

COOKIE = settings.refresh_cookie_name


def login(client, password: str = OWNER_PASSWORD, login_id: str = OWNER_LOGIN):
    return client.post("/api/auth/login", json={"login_id": login_id, "password": password})


def test_login_returns_access_token_and_refresh_cookie(client, owner):
    response = login(client)
    assert response.status_code == 200

    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] > 0
    assert body["user"]["login_id"] == OWNER_LOGIN
    assert "password" not in str(body)

    cookie = response.cookies.get(COOKIE)
    assert cookie, "refresh cookie must be set"
    set_cookie_header = response.headers["set-cookie"]
    assert "HttpOnly" in set_cookie_header
    assert "Path=/api/auth" in set_cookie_header


def test_login_is_case_insensitive_on_login_id(client, owner):
    assert login(client, login_id=OWNER_LOGIN.upper()).status_code == 200


def test_login_rejects_wrong_password(client, owner):
    response = login(client, password="not-the-password")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert COOKIE not in response.cookies


def test_login_rejects_unknown_user(client, owner):
    assert login(client, login_id="nobody").status_code == 401


def test_login_rate_limit_locks_after_repeated_failures(client, owner):
    for _ in range(settings.login_max_attempts):
        assert login(client, password="wrong").status_code == 401

    blocked = login(client, password="wrong")
    assert blocked.status_code == 429
    assert blocked.headers["retry-after"] == str(settings.login_lockout_seconds)

    # A correct password is still refused while the lockout window is open.
    assert login(client).status_code == 429


def test_protected_route_requires_a_token(client, owner):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/tasks").status_code == 401
    assert client.get("/api/dashboard").status_code == 401


def test_protected_route_rejects_a_garbage_token(client, owner):
    response = client.get("/api/auth/me", headers={"Authorization": "Bearer not.a.jwt"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "token_invalid"


def test_me_returns_the_owner(auth_client, owner):
    body = auth_client.get("/api/auth/me").json()
    assert body["id"] == owner.id
    assert body["display_name"] == "Test Owner"


def test_refresh_rotates_the_token_and_issues_a_new_access_token(client, owner):
    login(client)
    first_cookie = client.cookies.get(COOKIE)

    response = client.post("/api/auth/refresh")
    assert response.status_code == 200
    assert response.json()["access_token"]

    second_cookie = client.cookies.get(COOKIE)
    assert second_cookie and second_cookie != first_cookie


def test_reusing_a_rotated_refresh_token_revokes_the_whole_family(client, owner):
    login(client)
    stolen = client.cookies.get(COOKIE)

    assert client.post("/api/auth/refresh").status_code == 200
    current = client.cookies.get(COOKIE)

    # Replaying the old token must fail...
    client.cookies.set(COOKIE, stolen)
    replay = client.post("/api/auth/refresh")
    assert replay.status_code == 401

    # ...and must also kill the token that legitimately replaced it.
    client.cookies.set(COOKIE, current)
    assert client.post("/api/auth/refresh").status_code == 401


def test_refresh_without_a_cookie_fails(client, owner):
    response = client.post("/api/auth/refresh")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "no_refresh_cookie"


def test_logout_revokes_the_session(client, owner):
    login(client)
    assert client.post("/api/auth/logout").status_code == 200
    assert client.post("/api/auth/refresh").status_code == 401


def test_logout_all_revokes_every_session(client, owner):
    login(client)
    token = login(client).json()["access_token"]

    response = client.post("/api/auth/logout-all", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert client.post("/api/auth/refresh").status_code == 401


def test_sessions_list_marks_the_current_session(auth_client, owner):
    rows = auth_client.get("/api/auth/sessions").json()
    assert len(rows) == 1
    assert rows[0]["is_current"] is True


def test_change_password_invalidates_old_sessions_and_works_for_new_logins(client, owner):
    token = login(client).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    bad = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrong", "new_password": "a-brand-new-passphrase"},
        headers=headers,
    )
    assert bad.status_code == 401

    ok = client.post(
        "/api/auth/change-password",
        json={"current_password": OWNER_PASSWORD, "new_password": "a-brand-new-passphrase"},
        headers=headers,
    )
    assert ok.status_code == 200

    client.cookies.clear()
    assert login(client).status_code == 401
    assert login(client, password="a-brand-new-passphrase").status_code == 200


def test_update_profile(auth_client, owner):
    response = auth_client.patch(
        "/api/auth/me", json={"display_name": "Renamed", "theme": "dark", "timezone": "Asia/Kolkata"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["display_name"] == "Renamed"
    assert body["theme"] == "dark"
    assert body["timezone"] == "Asia/Kolkata"
