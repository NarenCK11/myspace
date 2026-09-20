"""Shared FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.errors import AuthError
from app.core.security import TokenError, decode_access_token
from app.db.session import get_db
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False, scheme_name="Bearer")

DbSession = Annotated[Session, Depends(get_db)]


def client_ip(request: Request) -> str:
    """Best-effort client IP, honouring one level of proxy forwarding."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> User:
    if credentials is None or not credentials.credentials:
        raise AuthError("Authentication required.")

    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError as exc:
        raise AuthError(str(exc), code="token_invalid") from exc

    user = db.get(User, payload.user_id)
    if user is None or not user.is_active:
        raise AuthError("Account is unavailable.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
ClientIP = Annotated[str, Depends(client_ip)]
