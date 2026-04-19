"""Tests for time window helpers."""

from __future__ import annotations

from datetime import UTC, datetime, time

from homeassistant.util import dt as dt_util

from custom_components.city_visitor_parking.const import (
    CONF_FREE_DATES,
    CONF_OPERATING_TIME_OVERRIDES,
)
from custom_components.city_visitor_parking.models import TimeRange
from custom_components.city_visitor_parking.time_windows import (
    current_or_next_window_with_overrides,
    windows_for_today,
)


def test_current_or_next_window_with_overrides_prefers_override() -> None:
    """Overrides should take precedence over provider validity."""
    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    zone_validity = [
        TimeRange(
            start=datetime(2025, 1, 6, 8, 0, tzinfo=UTC),
            end=datetime(2025, 1, 6, 16, 0, tzinfo=UTC),
        )
    ]
    options = {
        CONF_OPERATING_TIME_OVERRIDES: {"mon": [{"start": "10:00", "end": "12:00"}]}
    }

    window = current_or_next_window_with_overrides(zone_validity, options, now)

    local_now = dt_util.as_local(now)
    expected_start = dt_util.as_utc(
        datetime.combine(local_now.date(), time(10, 0), tzinfo=local_now.tzinfo)
    )
    expected_end = dt_util.as_utc(
        datetime.combine(local_now.date(), time(12, 0), tzinfo=local_now.tzinfo)
    )
    assert window is not None
    assert window.start == expected_start
    assert window.end == expected_end


def test_current_or_next_window_with_overrides_fallback() -> None:
    """Empty overrides should fall back to provider windows."""
    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    zone_validity = [
        TimeRange(
            start=datetime(2025, 1, 6, 8, 0, tzinfo=UTC),
            end=datetime(2025, 1, 6, 16, 0, tzinfo=UTC),
        )
    ]

    window = current_or_next_window_with_overrides(
        zone_validity, {CONF_OPERATING_TIME_OVERRIDES: {}}, now
    )

    assert window == zone_validity[0]


def test_current_or_next_window_with_overrides_no_windows() -> None:
    """Invalid overrides should fall back to provider windows."""
    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    zone_validity: list[TimeRange] = []
    options = {
        CONF_OPERATING_TIME_OVERRIDES: {"mon": [{"start": "12:00", "end": "11:00"}]}
    }

    window = current_or_next_window_with_overrides(zone_validity, options, now)

    assert window is None


# --- free_dates: windows_for_today ---


def _make_zone(now: datetime) -> list[TimeRange]:
    """Return a zone validity block covering the full day of now (UTC)."""
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return [TimeRange(start=day_start, end=day_start.replace(hour=23, minute=59))]


def test_windows_for_today_annual_free_date_returns_empty() -> None:
    """windows_for_today returns [] when today matches a DD-MM free date."""
    # 2025-12-25 UTC
    now = datetime(2025, 12, 25, 10, 0, tzinfo=UTC)
    zone_validity = _make_zone(now)
    options = {CONF_FREE_DATES: "25-12"}

    result = windows_for_today(zone_validity, options, now)

    assert result == []


def test_windows_for_today_specific_free_date_returns_empty() -> None:
    """windows_for_today returns [] when today matches a DD-MM-YYYY free date."""
    now = datetime(2025, 4, 18, 10, 0, tzinfo=UTC)
    zone_validity = _make_zone(now)
    options = {CONF_FREE_DATES: "18-04-2025"}

    result = windows_for_today(zone_validity, options, now)

    assert result == []


def test_windows_for_today_specific_free_date_other_year_not_matched() -> None:
    """A DD-MM-YYYY free date does not suppress windows in a different year."""
    now = datetime(2026, 4, 18, 10, 0, tzinfo=UTC)
    zone_validity = _make_zone(now)
    options = {CONF_FREE_DATES: "18-04-2025"}

    result = windows_for_today(zone_validity, options, now)

    assert result != []


def test_windows_for_today_non_matching_free_date_returns_windows() -> None:
    """windows_for_today returns normal windows when today is not a free date."""
    now = datetime(2025, 12, 26, 10, 0, tzinfo=UTC)
    zone_validity = _make_zone(now)
    options = {CONF_FREE_DATES: "25-12"}

    result = windows_for_today(zone_validity, options, now)

    assert result != []


def test_windows_for_today_multiple_free_dates() -> None:
    """windows_for_today matches any date in a comma-separated list."""
    now = datetime(2025, 1, 1, 10, 0, tzinfo=UTC)
    zone_validity = _make_zone(now)
    options = {CONF_FREE_DATES: "25-12, 01-01"}

    result = windows_for_today(zone_validity, options, now)

    assert result == []


# --- free_dates: current_or_next_window_with_overrides ---


def test_current_or_next_window_free_date_no_overrides_returns_none() -> None:
    """free_dates suppresses the window even when no day overrides are set."""
    now = datetime(2025, 12, 25, 10, 0, tzinfo=UTC)
    zone_validity = _make_zone(now)
    options = {CONF_FREE_DATES: "25-12"}

    window = current_or_next_window_with_overrides(zone_validity, options, now)

    assert window is None


def test_current_or_next_window_free_date_with_overrides_finds_next_week() -> None:
    """free_dates suppresses today; the same-weekday override next week is found."""
    # 2025-12-25 is a Thursday; the next Thursday is 2026-01-01 (offset 7).
    now = datetime(2025, 12, 25, 10, 0, tzinfo=UTC)
    zone_validity = _make_zone(now)
    options = {
        CONF_FREE_DATES: "25-12",
        CONF_OPERATING_TIME_OVERRIDES: {"thu": [{"start": "09:00", "end": "17:00"}]},
    }

    window = current_or_next_window_with_overrides(zone_validity, options, now)

    assert window is not None
    assert window.start.date() == datetime(2026, 1, 1, tzinfo=UTC).date()
