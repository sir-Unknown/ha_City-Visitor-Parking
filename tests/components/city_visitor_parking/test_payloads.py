"""Tests for City visitor parking payload helpers."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from custom_components.city_visitor_parking.const import STATE_FREE, STATE_PAID
from custom_components.city_visitor_parking.models import (
    CoordinatorData,
    ParkingArea,
    Reservation,
    TimeRange,
    ZoneAvailability,
)
from custom_components.city_visitor_parking.payloads import (
    build_status_payload,
    reservation_payload,
)

ZONE_STATUS_RESPONSE_KEYS = {
    "state",
    "window_kind",
    "window_start",
    "window_end",
    "remaining_balance",
    "balance_unit",
}
EXPECTED_REMAINING_MINUTES = 15


def test_build_status_payload_includes_parking_area_status_response_contract() -> None:
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
            is_paid_now=True,
            next_change_time=current_window.end,
            windows_today=(current_window,),
        ),
        active_reservations=(),
    )

    payload = build_status_payload(data, {}, now)

    # Keep this assertion aligned with frontend/src/types.ts:ZoneStatusResponse.
    assert payload.keys() >= ZONE_STATUS_RESPONSE_KEYS
    assert payload["state"] == STATE_PAID
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
            is_paid_now=False,
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


def test_build_status_payload_reports_each_parking_area_with_its_own_window() -> None:
    """Each parking area has its own state and window; top level is the default."""
    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    current = TimeRange(start=now - timedelta(hours=1), end=now + timedelta(hours=1))
    later = TimeRange(start=now + timedelta(hours=1), end=now + timedelta(hours=3))
    paid = ZoneAvailability(
        is_paid_now=True, next_change_time=current.end, windows_today=(current,)
    )
    free = ZoneAvailability(
        is_paid_now=False, next_change_time=later.start, windows_today=(later,)
    )
    data = CoordinatorData(
        permit_id="permit-1",
        permit_remaining_balance=15,
        permit_balance_unit=None,
        zone_validity=(current,),
        reservations=(),
        favorites=(),
        zone_availability=paid,
        active_reservations=(),
        parking_areas=(
            ParkingArea(
                parking_area_id="10",
                name="10",
                zone_validity=(current,),
                zone_availability=paid,
            ),
            ParkingArea(
                parking_area_id="630",
                name="630",
                zone_validity=(later,),
                zone_availability=free,
            ),
        ),
    )

    payload = build_status_payload(data, {}, now)

    # Keep aligned with frontend/src/types.ts:ParkingAreaStatus.
    assert payload["state"] == STATE_PAID
    assert payload["parking_areas"] == [
        {
            "parking_area_id": "10",
            "name": "10",
            "state": STATE_PAID,
            "next_change_time": current.end.isoformat(),
            "window_kind": "current",
            "window_start": current.start.isoformat(),
            "window_end": current.end.isoformat(),
        },
        {
            "parking_area_id": "630",
            "name": "630",
            "state": STATE_FREE,
            "next_change_time": later.start.isoformat(),
            "window_kind": "next",
            "window_start": later.start.isoformat(),
            "window_end": later.end.isoformat(),
        },
    ]


def test_reservation_payload_includes_parking_area_only_when_present() -> None:
    """Reservations carry the parking area ID and name; unknown names use the ID."""
    start = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    parking_areas = (
        ParkingArea(
            parking_area_id="630",
            name="Centrum",
            zone_validity=(),
            zone_availability=ZoneAvailability(
                is_paid_now=False, next_change_time=None, windows_today=()
            ),
        ),
    )

    def _payload(parking_area_id: str | None) -> dict[str, str]:
        reservation = Reservation(
            reservation_id="res",
            start_time=start,
            end_time=start + timedelta(hours=1),
            parking_area_id=parking_area_id,
        )
        return reservation_payload(reservation, {}, parking_areas, {}, start)

    known = _payload("630")
    assert known["parking_area_id"] == "630"
    assert known["parking_area_name"] == "Centrum"

    unknown = _payload("999")
    assert unknown["parking_area_id"] == "999"
    assert unknown["parking_area_name"] == "999"

    without_parking_area = _payload(None)
    assert "parking_area_id" not in without_parking_area
    assert "parking_area_name" not in without_parking_area


def test_reservation_payload_uses_the_paid_window_of_its_own_parking_area() -> None:
    """The paid window comes from the reservation's parking area and time span."""
    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    today = TimeRange(start=now - timedelta(hours=1), end=now + timedelta(hours=11))
    tomorrow = TimeRange(start=now + timedelta(hours=23), end=now + timedelta(hours=35))
    parking_areas = (
        ParkingArea(
            parking_area_id="630",
            name="630",
            zone_validity=(today, tomorrow),
            zone_availability=ZoneAvailability(
                is_paid_now=True, next_change_time=today.end, windows_today=()
            ),
        ),
    )

    def _window(start: datetime, hours: int) -> tuple[str | None, str | None]:
        reservation = Reservation(
            reservation_id="res",
            start_time=start,
            end_time=start + timedelta(hours=hours),
            parking_area_id="630",
        )
        payload = reservation_payload(reservation, {}, parking_areas, {}, now)
        return payload.get("parking_area_paid_start"), payload.get(
            "parking_area_paid_end"
        )

    # Running now: the window that is paid right now.
    assert _window(now - timedelta(minutes=30), 2) == (
        today.start.isoformat(),
        today.end.isoformat(),
    )
    # Planned for tomorrow: tomorrow's window, not today's.
    assert _window(now + timedelta(hours=24), 2) == (
        tomorrow.start.isoformat(),
        tomorrow.end.isoformat(),
    )
    # Entirely in free time (tonight): no paid window applies.
    assert _window(now + timedelta(hours=12), 2) == (None, None)
