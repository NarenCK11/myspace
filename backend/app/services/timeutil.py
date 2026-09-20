"""Timezone helpers.

Everything is stored in UTC; these helpers convert to and from the owner's
configured timezone so "today" means today where they actually are.
"""

from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def get_tz(name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def local_now(tz_name: str | None) -> dt.datetime:
    return dt.datetime.now(get_tz(tz_name))


def local_today(tz_name: str | None) -> dt.date:
    return local_now(tz_name).date()


def day_bounds(day: dt.date, tz_name: str | None) -> tuple[dt.datetime, dt.datetime]:
    """Return the UTC instants bounding a local calendar day."""
    tz = get_tz(tz_name)
    start_local = dt.datetime.combine(day, dt.time.min, tzinfo=tz)
    end_local = start_local + dt.timedelta(days=1)
    return start_local.astimezone(dt.UTC), end_local.astimezone(dt.UTC)


def range_bounds(
    start_day: dt.date, end_day: dt.date, tz_name: str | None
) -> tuple[dt.datetime, dt.datetime]:
    start, _ = day_bounds(start_day, tz_name)
    _, end = day_bounds(end_day, tz_name)
    return start, end


def week_bounds(day: dt.date, tz_name: str | None, week_starts_on: int = 1) -> tuple[dt.datetime, dt.datetime]:
    """UTC bounds of the local week containing ``day``."""
    offset = (day.weekday() - (0 if week_starts_on == 1 else 6)) % 7
    start_day = day - dt.timedelta(days=offset)
    return range_bounds(start_day, start_day + dt.timedelta(days=6), tz_name)


def ensure_utc(value: dt.datetime) -> dt.datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=dt.UTC)
    return value.astimezone(dt.UTC)
