"""Authentication: login rate limiting, session issuing and refresh rotation."""

from __future__ import annotations

import datetime as dt
import logging

from fastapi import Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AuthError, RateLimitError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    needs_rehash,
    verify_password,
)
from app.db.base import new_uuid, utcnow
from app.models.user import LoginAttempt, RefreshSession, User

logger = logging.getLogger(__name__)


# --- Rate limiting ---------------------------------------------------------


def _failures_since(db: Session, column, value: str, since: dt.datetime) -> int:
    stmt = (
        select(func.count())
        .select_from(LoginAttempt)
        .where(
            column == value,
            LoginAttempt.successful.is_(False),
            LoginAttempt.created_at >= since,
        )
    )
    return int(db.execute(stmt).scalar_one())


def enforce_login_rate_limit(db: Session, *, login_id: str, ip_address: str) -> None:
    """Raise RateLimitError when too many recent sign-in attempts have failed.

    Counted per IP and per login id, so neither dimension can be used to bypass
    the other.
    """
    window_start = utcnow() - dt.timedelta(seconds=settings.login_window_seconds)
    by_ip = _failures_since(db, LoginAttempt.ip_address, ip_address, window_start)
    by_login = _failures_since(db, LoginAttempt.login_id, login_id.lower(), window_start)

    if max(by_ip, by_login) >= settings.login_max_attempts:
        raise RateLimitError(
            "Too many failed sign-in attempts. Please wait before trying again.",
            retry_after=settings.login_lockout_seconds,
        )


def record_login_attempt(
    db: Session, *, login_id: str, ip_address: str, successful: bool, user_agent: str | None
) -> None:
    db.add(
        LoginAttempt(
            login_id=login_id.lower()[:64],
            ip_address=ip_address[:64],
            successful=successful,
            user_agent=(user_agent or "")[:400] or None,
            created_at=utcnow(),
        )
    )
    db.flush()


def purge_old_login_attempts(db: Session) -> None:
    cutoff = utcnow() - dt.timedelta(days=7)
    db.query(LoginAttempt).filter(LoginAttempt.created_at < cutoff).delete(
        synchronize_session=False
    )


# --- Login -----------------------------------------------------------------


def authenticate(db: Session, *, login_id: str, password: str) -> User:
    user = db.execute(
        select(User).where(func.lower(User.login_id) == login_id.strip().lower())
    ).scalar_one_or_none()

    if user is None:
        # Hash anyway so a missing account cannot be spotted by response timing.
        hash_password(password)
        raise AuthError("Incorrect ID or password.")

    if not verify_password(password, user.password_hash):
        raise AuthError("Incorrect ID or password.")

    if not user.is_active:
        raise AuthError("This account is disabled.")

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)

    user.last_login_at = utcnow()
    return user


# --- Refresh sessions ------------------------------------------------------


def issue_refresh_session(
    db: Session,
    *,
    user: User,
    family_id: str | None = None,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[str, RefreshSession]:
    raw_token = generate_refresh_token()
    now = utcnow()
    session = RefreshSession(
        user_id=user.id,
        family_id=family_id or new_uuid(),
        token_hash=hash_refresh_token(raw_token),
        issued_at=now,
        expires_at=now + dt.timedelta(days=settings.refresh_token_ttl_days),
        user_agent=(user_agent or "")[:400] or None,
        ip_address=(ip_address or "")[:64] or None,
    )
    db.add(session)
    db.flush()
    return raw_token, session


def revoke_family(db: Session, family_id: str, reason: str) -> None:
    db.execute(
        update(RefreshSession)
        .where(RefreshSession.family_id == family_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoked_reason=reason)
    )


def revoke_all_for_user(db: Session, user_id: str, reason: str = "logout_all") -> int:
    result = db.execute(
        update(RefreshSession)
        .where(RefreshSession.user_id == user_id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoked_reason=reason)
    )
    return int(result.rowcount or 0)


def rotate_refresh_session(
    db: Session, *, raw_token: str, user_agent: str | None = None, ip_address: str | None = None
) -> tuple[str, User, RefreshSession]:
    """Exchange a refresh token for a fresh one, invalidating the presented token.

    Presenting a token that was already rotated (or explicitly revoked) is
    treated as theft, so the entire token family is revoked immediately. Those
    revocations are committed before raising, since the failing request would
    otherwise roll them back.
    """
    token_hash = hash_refresh_token(raw_token)
    session = db.execute(
        select(RefreshSession).where(RefreshSession.token_hash == token_hash)
    ).scalar_one_or_none()

    if session is None:
        raise AuthError("Your session has expired. Please sign in again.")

    if session.revoked_at is not None:
        logger.warning("Refresh token reuse detected for family %s", session.family_id)
        revoke_family(db, session.family_id, "reuse_detected")
        db.commit()
        raise AuthError("Your session has expired. Please sign in again.")

    if session.expires_at <= utcnow():
        session.revoked_at = utcnow()
        session.revoked_reason = "expired"
        db.commit()
        raise AuthError("Your session has expired. Please sign in again.")

    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        revoke_family(db, session.family_id, "user_unavailable")
        db.commit()
        raise AuthError("Your session is no longer valid.")

    new_raw, new_session = issue_refresh_session(
        db,
        user=user,
        family_id=session.family_id,
        user_agent=user_agent or session.user_agent,
        ip_address=ip_address or session.ip_address,
    )
    session.revoked_at = utcnow()
    session.revoked_reason = "rotated"
    session.replaced_by_id = new_session.id
    return new_raw, user, new_session


def revoke_by_raw_token(db: Session, raw_token: str, reason: str = "logout") -> bool:
    session = db.execute(
        select(RefreshSession).where(RefreshSession.token_hash == hash_refresh_token(raw_token))
    ).scalar_one_or_none()
    if session is None:
        return False
    # Signing out invalidates every token descended from that login.
    revoke_family(db, session.family_id, reason)
    return True


def purge_expired_sessions(db: Session) -> None:
    cutoff = utcnow() - dt.timedelta(days=2)
    db.query(RefreshSession).filter(RefreshSession.expires_at < cutoff).delete(
        synchronize_session=False
    )


# --- Cookies ---------------------------------------------------------------


def set_refresh_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw_token,
        max_age=settings.refresh_token_ttl_days * 24 * 3600,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path=settings.cookie_path,
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        domain=settings.cookie_domain,
        path=settings.cookie_path,
    )


def build_access_token(user: User) -> tuple[str, int]:
    return create_access_token(user.id)
