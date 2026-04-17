"""Tests for City visitor parking payload helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from custom_components.city_visitor_parking.const import STATE_CHARGEABLE, STATE_FREE
from custom_components.city_visitor_parking.models import (
    CoordinatorData,
    TimeRange,
    ZoneAvailability,
)
from custom_components.city_visitor_parking.payloads import build_status_payload

ZONE_STATUS_RESPONSE_KEYS = {
    "state",
    "window_kind",
    "window_start",
    "window_end",
    "remaining_balance",
    "balance_unit",
}
EXPECTED_REMAINING_MINUTES = 15


def test_build_status_payload_includes_zone_status_response_contract() -> None:
    """Status payload should always include the frontend contract key set."""
    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    current_window = TimeRange(
        start=now - timedelta(minutes=30),
        end=now + timedelta(minutes=45),
    )
    data = CoordinatorData(
        permit_id="permit-1",
        permit_remaining_balance=-12,
        permit_balance_unit="minutes",
        zone_validity=(current_window,),
        reservations=(),
        favorites=(),
        zone_availability=ZoneAvailability(
            is_chargeable_now=True,
            next_change_time=current_window.end,
            windows_today=(current_window,),
        ),
        active_reservations=(),
    )

    payload = build_status_payload(data, {}, now)

    # Keep this assertion aligned with frontend/src/types.ts:ZoneStatusResponse.
    assert payload.keys() >= ZONE_STATUS_RESPONSE_KEYS
    assert payload["state"] == STATE_CHARGEABLE
    assert payload["window_kind"] == "current"
    assert payload["window_start"] == current_window.start.isoformat()
    assert payload["window_end"] == current_window.end.isoformat()
    assert payload["remaining_balance"] == 0.0
    assert payload["balance_unit"] == "minutes"


def test_build_status_payload_uses_null_window_fields_when_no_window_applies() -> None:
    """Status payload should preserve explicit nulls for unavailable window data."""
    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    next_change = now + timedelta(hours=2)
    data = CoordinatorData(
        permit_id="permit-1",
        permit_remaining_balance=15,
        permit_balance_unit=None,
        zone_validity=(),
        reservations=(),
        favorites=(),
        zone_availability=ZoneAvailability(
            is_chargeable_now=False,
            next_change_time=next_change,
            windows_today=(),
        ),
        active_reservations=(),
    )

    payload = build_status_payload(data, {}, now)

    assert payload["state"] == STATE_FREE
    assert payload["window_kind"] is None
    assert payload["window_start"] is None
    assert payload["window_end"] is None
    assert payload["remaining_balance"] == EXPECTED_REMAINING_MINUTES
    assert payload["balance_unit"] is None
