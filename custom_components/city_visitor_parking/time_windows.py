"""Time window helpers for City visitor parking."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import datetime, time, timedelta
from typing import cast

from homeassistant.util import dt as dt_util

from .const import (
    CONF_FREE_DATES,
    CONF_FREE_WEEKDAYS,
    CONF_OPERATING_TIME_OVERRIDES,
    WEEKDAY_KEYS,
)
from .helpers import normalize_override_windows, parse_comma_separated
from .models import TimeRange


def current_or_next_window(
    windows: Sequence[TimeRange], now: datetime
) -> TimeRange | None:
    """Return the current or next chargeable window."""
    for window in sorted(windows, key=lambda item: item.start):
        if window.end <= now:
            continue
        return window
    return None


def current_or_next_window_with_overrides(
    zone_validity: Sequence[TimeRange],
    options: Mapping[str, object],
    now: datetime,
) -> TimeRange | None:
    """Return the current or next chargeable window, honoring overrides."""
    overrides = options.get(CONF_OPERATING_TIME_OVERRIDES)
    free_dates_raw = options.get(CONF_FREE_DATES)
    free_weekdays_raw = options.get(CONF_FREE_WEEKDAYS)
    has_free_dates = isinstance(free_dates_raw, str) and bool(free_dates_raw.strip())
    has_overrides = isinstance(overrides, Mapping) and bool(overrides)
    has_free_weekdays = isinstance(free_weekdays_raw, list) and bool(free_weekdays_raw)

    if not has_free_dates and not has_overrides and not has_free_weekdays:
        return current_or_next_window(zone_validity, now)

    windows: list[TimeRange] = []
    # Look ahead 8 days so the same weekday next week is always included,
    # covering the case where all other 6 weekdays are marked as free.
    for offset in range(8):
        windows.extend(
            windows_for_today(zone_validity, options, now + timedelta(days=offset))
        )

    if not windows:
        if has_free_dates or has_free_weekdays:
            # Lookahead found nothing; scan zone_validity directly so sparse or
            # seasonal windows beyond the 8-day horizon are still found.
            for block in sorted(zone_validity, key=lambda b: b.start):
                if block.end <= now:
                    continue
                candidate = windows_for_today(zone_validity, options, block.start)
                result = current_or_next_window(candidate, now)
                if result is not None:
                    return result
            return None
        return current_or_next_window(zone_validity, now)

    return current_or_next_window(windows, now)


def windows_for_today(
    zone_validity: Sequence[TimeRange],
    options: Mapping[str, object],
    now: datetime,
) -> list[TimeRange]:
    """Return chargeable windows for today, applying overrides if present."""
    local_now = dt_util.as_local(now)
    local_date = local_now.date()

    # Return no chargeable windows when today is a configured free date.
    free_dates_raw = options.get(CONF_FREE_DATES)
    if isinstance(free_dates_raw, str) and free_dates_raw.strip():
        today_ddmm = local_now.strftime("%d-%m")
        today_ddmmyyyy = local_now.strftime("%d-%m-%Y")
        for d in parse_comma_separated(free_dates_raw):
            if d in (today_ddmm, today_ddmmyyyy):
                return []

    local_day = WEEKDAY_KEYS[local_now.weekday()]

    # Return no chargeable windows when today is a configured free weekday.
    free_weekdays_raw = options.get(CONF_FREE_WEEKDAYS)
    if isinstance(free_weekdays_raw, list) and local_day in free_weekdays_raw:
        return []

    overrides = options.get(CONF_OPERATING_TIME_OVERRIDES)
    if not isinstance(overrides, Mapping):
        overrides = {}
    overrides = cast("Mapping[str, object]", overrides)
    override = overrides.get(local_day)
    override_windows = normalize_override_windows(override)
    if override_windows:
        ranges: list[TimeRange] = []
        for window in override_windows:
            start_time = _as_time(window.get("start"))
            end_time = _as_time(window.get("end"))
            if start_time is None or end_time is None or start_time >= end_time:
                continue
            start_local = datetime.combine(
                local_date, start_time, tzinfo=local_now.tzinfo
            )
            end_local = datetime.combine(local_date, end_time, tzinfo=local_now.tzinfo)
            ranges.append(
                TimeRange(
                    start=dt_util.as_utc(start_local),
                    end=dt_util.as_utc(end_local),
                )
            )
        if ranges:
            return ranges

    local_start = datetime.combine(local_date, time.min, tzinfo=local_now.tzinfo)
    local_end = local_start + timedelta(days=1)
    utc_start = dt_util.as_utc(local_start)
    utc_end = dt_util.as_utc(local_end)

    windows: list[TimeRange] = []
    for block in zone_validity:
        if block.end <= utc_start or block.start >= utc_end:
            continue
        windows.append(
            TimeRange(
                start=max(block.start, utc_start),
                end=min(block.end, utc_end),
            )
        )
    return windows


def _as_time(value: object) -> time | None:
    """Convert a stored override value into a time object."""
    if isinstance(value, time):
        return value
    if isinstance(value, str):
        try:
            return time.fromisoformat(value)
        except ValueError:
            return None
    return None
