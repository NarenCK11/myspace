"""Command line utilities.

Usage::

    python -m app.cli create-owner            # reads OWNER_* env vars
    python -m app.cli create-owner --force    # overwrite the existing password
    python -m app.cli reset-password
    python -m app.cli show-owner
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.base import utcnow
from app.db.session import SessionLocal
from app.models.user import User


def _load_owner(db) -> User | None:
    return db.execute(select(User).order_by(User.created_at.asc())).scalars().first()


def _require_credentials() -> tuple[str, str]:
    login_id = (settings.owner_login_id or "").strip()
    password = settings.owner_password or ""
    if not login_id or not password:
        print(
            "ERROR: OWNER_LOGIN_ID and OWNER_PASSWORD must be set in the environment.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    if len(password) < 10:
        print("ERROR: OWNER_PASSWORD must be at least 10 characters.", file=sys.stderr)
        raise SystemExit(2)
    return login_id, password


def create_owner(force: bool = False) -> int:
    login_id, password = _require_credentials()
    with SessionLocal() as db:
        existing = db.execute(
            select(User).where(func.lower(User.login_id) == login_id.lower())
        ).scalar_one_or_none()

        if existing is not None:
            if not force:
                print(
                    f"Owner '{existing.login_id}' already exists. "
                    "Re-run with --force to reset the password from OWNER_PASSWORD."
                )
                return 0
            existing.password_hash = hash_password(password)
            existing.password_changed_at = utcnow()
            existing.display_name = settings.owner_display_name
            existing.email = settings.owner_email
            existing.timezone = settings.owner_timezone
            db.commit()
            print(f"Password reset for owner '{existing.login_id}'.")
            return 0

        other = _load_owner(db)
        if other is not None and not force:
            print(
                f"A different owner account already exists ('{other.login_id}'). "
                "This portal supports a single user; use reset-password or --force.",
                file=sys.stderr,
            )
            return 1

        user = User(
            login_id=login_id,
            password_hash=hash_password(password),
            display_name=settings.owner_display_name,
            email=settings.owner_email,
            timezone=settings.owner_timezone,
            password_changed_at=utcnow(),
        )
        db.add(user)
        db.commit()
        print(f"Owner account '{login_id}' created.")
        return 0


def reset_password() -> int:
    return create_owner(force=True)


def show_owner() -> int:
    with SessionLocal() as db:
        user = _load_owner(db)
        if user is None:
            print("No owner account exists yet. Run: python -m app.cli create-owner")
            return 1
        print(f"login_id     : {user.login_id}")
        print(f"display_name : {user.display_name}")
        print(f"timezone     : {user.timezone}")
        print(f"created_at   : {user.created_at.isoformat()}")
        print(f"last_login_at: {user.last_login_at.isoformat() if user.last_login_at else 'never'}")
        return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli", description="MySpace admin commands")
    sub = parser.add_subparsers(dest="command", required=True)

    create = sub.add_parser("create-owner", help="Create the single owner account from env vars")
    create.add_argument("--force", action="store_true", help="Reset the password if it exists")

    sub.add_parser("reset-password", help="Reset the owner password from OWNER_PASSWORD")
    sub.add_parser("show-owner", help="Print the current owner account")

    args = parser.parse_args(argv)
    if args.command == "create-owner":
        return create_owner(force=args.force)
    if args.command == "reset-password":
        return reset_password()
    return show_owner()


if __name__ == "__main__":
    raise SystemExit(main())
