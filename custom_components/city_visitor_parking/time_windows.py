"""Time window helpers for City visitor parking."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, time, timedelta
from typing import cast

from homeassistant.util import dt as dt_util

from .const import CONF_OPERATING_TIME_OVERRIDES, WEEKDAY_KEYS
from .helpers import normalize_override_windows
from .models import TimeRange


def current_or_next_window(windows: list[TimeRange], now: datetime) -> TimeRange | None:
    """Return the current or next chargeable window."""

    for window in sorted(windows, key=lambda item: item.start):
        if window.end <= now:
            continue
        return window
    return None


def current_or_next_window_with_overrides(
    zone_validity: list[TimeRange],
    options: Mapping[str, object],
    now: datetime,
) -> TimeRange | None:
    """Return the current or next chargeable window, honoring overrides."""

    overrides = options.get(CONF_OPERATING_TIME_OVERRIDES)
    if not isinstance(overrides, Mapping) or not overrides:
        return current_or_next_window(zone_validity, now)
    overrides = cast(Mapping[str, object], overrides)

    windows: list[TimeRange] = []
    # Look ahead one week to apply weekday overrides for upcoming windows.
    for offset in range(7):
        windows.extend(
            windows_for_today(zone_validity, options, now + timedelta(days=offset))
        )

    if not windows:
        return current_or_next_window(zone_validity, now)

    return current_or_next_window(windows, now)


def windows_for_today(
    zone_validity: list[TimeRange],
    options: Mapping[str, object],
    now: datetime,
) -> list[TimeRange]:
    """Return chargeable windows for today, applying overrides if present."""

    local_now = dt_util.as_local(now)
    local_date = local_now.date()
    local_day = WEEKDAY_KEYS[local_now.weekday()]

    overrides = options.get(CONF_OPERATING_TIME_OVERRIDES)
    if not isinstance(overrides, Mapping):
        overrides = {}
    overrides = cast(Mapping[str, object], overrides)
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
        return time.fromisoformat(value)
    return None
