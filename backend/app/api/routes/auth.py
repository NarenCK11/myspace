"""Authentication endpoints: login, refresh, logout, profile and sessions."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import ClientIP, CurrentUser, DbSession
from app.core.errors import AuthError
from app.core.security import hash_password, verify_password
from app.db.base import utcnow
from app.models.user import RefreshSession
from app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    SessionRead,
    TokenResponse,
    UserRead,
    UserUpdate,
)
from app.schemas.common import MessageResponse
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(db, user, response: Response, request: Request, *, family_id=None) -> TokenResponse:
    raw_refresh, _session = auth_service.issue_refresh_session(
        db,
        user=user,
        family_id=family_id,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    auth_service.set_refresh_cookie(response, raw_refresh)
    access_token, expires_in = auth_service.build_access_token(user)
    return TokenResponse(
        access_token=access_token,
        expires_in=expires_in,
        user=UserRead.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: DbSession,
    ip: ClientIP,
) -> TokenResponse:
    auth_service.enforce_login_rate_limit(db, login_id=payload.login_id, ip_address=ip)
    user_agent = request.headers.get("user-agent")

    try:
        user = auth_service.authenticate(db, login_id=payload.login_id, password=payload.password)
    except AuthError:
        auth_service.record_login_attempt(
            db, login_id=payload.login_id, ip_address=ip, successful=False, user_agent=user_agent
        )
        # Commit explicitly: the raised error rolls back the request session.
        db.commit()
        raise

    auth_service.record_login_attempt(
        db, login_id=payload.login_id, ip_address=ip, successful=True, user_agent=user_agent
    )
    auth_service.purge_old_login_attempts(db)
    auth_service.purge_expired_sessions(db)
    return _token_response(db, user, response, request)


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: Request, response: Response, db: DbSession, ip: ClientIP) -> TokenResponse:
    raw_token = request.cookies.get(settings.refresh_cookie_name)
    if not raw_token:
        raise AuthError("No active session.", code="no_refresh_cookie")

    try:
        new_raw, user, _session = auth_service.rotate_refresh_session(
            db,
            raw_token=raw_token,
            user_agent=request.headers.get("user-agent"),
            ip_address=ip,
        )
    except AuthError:
        auth_service.clear_refresh_cookie(response)
        raise

    auth_service.set_refresh_cookie(response, new_raw)
    access_token, expires_in = auth_service.build_access_token(user)
    return TokenResponse(
        access_token=access_token, expires_in=expires_in, user=UserRead.model_validate(user)
    )


@router.post("/logout", response_model=MessageResponse)
def logout(request: Request, response: Response, db: DbSession) -> MessageResponse:
    raw_token = request.cookies.get(settings.refresh_cookie_name)
    if raw_token:
        auth_service.revoke_by_raw_token(db, raw_token)
    auth_service.clear_refresh_cookie(response)
    return MessageResponse(message="Signed out.")


@router.post("/logout-all", response_model=MessageResponse)
def logout_all(response: Response, db: DbSession, user: CurrentUser) -> MessageResponse:
    revoked = auth_service.revoke_all_for_user(db, user.id)
    auth_service.clear_refresh_cookie(response)
    return MessageResponse(message=f"Signed out of {revoked} session(s).")


@router.get("/me", response_model=UserRead)
def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me", response_model=UserRead)
def update_me(payload: UserUpdate, db: DbSession, user: CurrentUser) -> UserRead:
    data = payload.model_dump(exclude_unset=True)
    if "theme" in data and data["theme"] is not None:
        data["theme"] = data["theme"].value
    for field, value in data.items():
        setattr(user, field, value)
    db.flush()
    return UserRead.model_validate(user)


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: PasswordChangeRequest,
    request: Request,
    response: Response,
    db: DbSession,
    user: CurrentUser,
) -> MessageResponse:
    if not verify_password(payload.current_password, user.password_hash):
        raise AuthError("Current password is incorrect.", code="invalid_password")
    if payload.current_password == payload.new_password:
        raise AuthError("New password must be different.", code="password_unchanged")

    user.password_hash = hash_password(payload.new_password)
    user.password_changed_at = utcnow()
    # Every existing refresh token dies with the old password.
    auth_service.revoke_all_for_user(db, user.id, reason="password_changed")

    raw_refresh, _ = auth_service.issue_refresh_session(
        db,
        user=user,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    auth_service.set_refresh_cookie(response, raw_refresh)
    return MessageResponse(message="Password updated.")


@router.get("/sessions", response_model=list[SessionRead])
def list_sessions(request: Request, db: DbSession, user: CurrentUser) -> list[SessionRead]:
    from app.core.security import hash_refresh_token

    raw_token = request.cookies.get(settings.refresh_cookie_name)
    current_hash = hash_refresh_token(raw_token) if raw_token else None

    rows = db.execute(
        select(RefreshSession)
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .order_by(RefreshSession.issued_at.desc())
        .limit(50)
    ).scalars()

    return [
        SessionRead(
            id=row.id,
            issued_at=row.issued_at,
            expires_at=row.expires_at,
            revoked_at=row.revoked_at,
            user_agent=row.user_agent,
            ip_address=row.ip_address,
            is_current=row.token_hash == current_hash,
        )
        for row in rows
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def revoke_session(session_id: str, db: DbSession, user: CurrentUser) -> None:
    row = db.get(RefreshSession, session_id)
    if row is None or row.user_id != user.id:
        from app.core.errors import NotFoundError

        raise NotFoundError("Session not found.")
    auth_service.revoke_family(db, row.family_id, "revoked_by_user")
