"""Portable column types.

The application targets PostgreSQL in production but the test-suite runs on
SQLite, so a handful of types need a dialect-aware implementation.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import DateTime, types
from sqlalchemy.dialects import postgresql
from sqlalchemy.engine import Dialect


class JSONVariant(types.TypeDecorator):
    """``JSONB`` on PostgreSQL, plain ``JSON`` everywhere else."""

    impl = types.JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.JSONB())
        return dialect.type_descriptor(types.JSON())


class UTCDateTime(types.TypeDecorator):
    """Timezone-aware datetimes that round-trip as UTC on every backend.

    SQLite drops tzinfo, which silently turns aware datetimes into naive ones.
    This decorator normalises on the way in and re-attaches UTC on the way out
    so application code can always assume aware datetimes.
    """

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value: dt.datetime | None, dialect: Dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=dt.UTC)
        return value.astimezone(dt.UTC)

    def process_result_value(self, value: dt.datetime | None, dialect: Dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=dt.UTC)
        return value.astimezone(dt.UTC)
