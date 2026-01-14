"""Tests for time window helpers."""

from __future__ import annotations

from datetime import UTC, datetime, time

from homeassistant.util import dt as dt_util

from custom_components.city_visitor_parking.const import (
    CONF_OPERATING_TIME_OVERRIDES,
)
from custom_components.city_visitor_parking.models import TimeRange
from custom_components.city_visitor_parking.time_windows import (
    _current_or_next_window_with_overrides,
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

    window = _current_or_next_window_with_overrides(zone_validity, options, now)

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

    window = _current_or_next_window_with_overrides(
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

    window = _current_or_next_window_with_overrides(zone_validity, options, now)

    assert window is None
