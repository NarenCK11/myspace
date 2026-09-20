"""Password hashing, JWT access tokens, refresh tokens and token encryption."""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import secrets
from dataclasses import dataclass

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_hasher = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)

ACCESS_TOKEN_TYPE = "access"


class TokenError(Exception):
    """Raised when a JWT is missing, malformed, expired or of the wrong type."""


@dataclass(frozen=True)
class AccessTokenPayload:
    user_id: str
    jti: str
    issued_at: dt.datetime
    expires_at: dt.datetime


# --- Passwords -------------------------------------------------------------


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _hasher.verify(password_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(password_hash: str) -> bool:
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


# --- Access tokens ---------------------------------------------------------


def create_access_token(user_id: str, expires_in_minutes: int | None = None) -> tuple[str, int]:
    """Return the encoded JWT plus its lifetime in seconds."""
    ttl = expires_in_minutes or settings.access_token_ttl_minutes
    now = dt.datetime.now(dt.UTC)
    expires_at = now + dt.timedelta(minutes=ttl)
    payload = {
        "sub": user_id,
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    return token, int((expires_at - now).total_seconds())


def decode_access_token(token: str) -> AccessTokenPayload:
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Access token has expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid access token") from exc

    if claims.get("type") != ACCESS_TOKEN_TYPE:
        raise TokenError("Invalid token type")

    return AccessTokenPayload(
        user_id=str(claims["sub"]),
        jti=str(claims.get("jti", "")),
        issued_at=dt.datetime.fromtimestamp(claims["iat"], dt.UTC),
        expires_at=dt.datetime.fromtimestamp(claims["exp"], dt.UTC),
    )


# --- Refresh tokens --------------------------------------------------------


def generate_refresh_token() -> str:
    """Opaque, high-entropy refresh token. Only its hash is ever persisted."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    keyed = hmac.new(settings.jwt_secret.encode(), token.encode(), hashlib.sha256)
    return keyed.hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


# --- OAuth token encryption ------------------------------------------------


def _fernet() -> Fernet:
    return Fernet(settings.fernet_key)


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken as exc:
        raise TokenError("Stored credential could not be decrypted") from exc


# --- PKCE helpers ----------------------------------------------------------


def generate_pkce_pair() -> tuple[str, str]:
    """Return a code verifier and its S256 challenge."""
    verifier = secrets.token_urlsafe(64)[:128]
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


def generate_state() -> str:
    return secrets.token_urlsafe(32)
