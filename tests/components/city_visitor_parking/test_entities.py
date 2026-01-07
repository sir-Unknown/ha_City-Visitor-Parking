"""Tests for City visitor parking entities."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from unittest.mock import MagicMock

from freezegun import freeze_time
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.const import (
    CONF_OPERATING_TIME_OVERRIDES,
    DOMAIN,
)
from custom_components.city_visitor_parking.coordinator import (
    _compute_zone_availability,
)
from custom_components.city_visitor_parking.models import (
    CoordinatorData,
    Favorite,
    Reservation,
    TimeRange,
    ZoneAvailability,
)
from custom_components.city_visitor_parking.sensor import (
    ActiveReservationsSensor,
    PermitZoneAvailabilitySensor,
)


async def test_entity_unique_id_and_device_info() -> None:
    """Entities should derive unique IDs from entry unique IDs."""

    coordinator = _make_coordinator(_sample_data())
    entry_one = _create_entry("provider:permit1:city")
    entry_two = _create_entry("provider:permit2:city")

    sensor_one = ActiveReservationsSensor(coordinator, entry_one)
    sensor_two = ActiveReservationsSensor(coordinator, entry_two)

    assert sensor_one.unique_id == "provider:permit1:city:active_reservations"
    assert sensor_two.unique_id == "provider:permit2:city:active_reservations"
    assert (DOMAIN, entry_one.entry_id) in sensor_one.device_info["identifiers"]
    assert (DOMAIN, entry_two.entry_id) in sensor_two.device_info["identifiers"]


async def test_zone_availability_uses_overrides() -> None:
    """Zone availability should reflect overrides for the current day."""

    now = datetime(2025, 1, 6, 9, 30, tzinfo=UTC)
    zone_validity = [
        TimeRange(
            start=datetime(2025, 1, 6, 8, 0, tzinfo=UTC),
            end=datetime(2025, 1, 6, 16, 0, tzinfo=UTC),
        )
    ]
    options = {
        CONF_OPERATING_TIME_OVERRIDES: {"mon": [{"start": "10:00", "end": "12:00"}]}
    }

    with freeze_time(now):
        availability = _compute_zone_availability(zone_validity, options, now)

    assert availability.is_chargeable_now is False
    local_now = dt_util.as_local(now)
    expected_local = datetime.combine(
        local_now.date(),
        time(10, 0),
        tzinfo=local_now.tzinfo,
    )
    assert availability.next_change_time == dt_util.as_utc(expected_local)

    data = _sample_data(zone_availability=availability)
    coordinator = _make_coordinator(data)
    entry = _create_entry("provider:permit1:city")
    sensor = PermitZoneAvailabilitySensor(coordinator, entry)

    assert sensor.native_value == "free"


def _sample_data(zone_availability: ZoneAvailability | None = None) -> CoordinatorData:
    """Create coordinator data for tests."""

    availability = zone_availability or ZoneAvailability(
        is_chargeable_now=True,
        next_change_time=None,
        windows_today=[],
    )
    return CoordinatorData(
        permit_id="permit",
        permit_remaining_minutes=90,
        zone_validity=[],
        reservations=[
            Reservation(
                reservation_id="res1",
                start_time=datetime.now(UTC) - timedelta(hours=1),
                end_time=datetime.now(UTC) + timedelta(hours=1),
            )
        ],
        favorites=[Favorite(favorite_id="fav1")],
        zone_availability=availability,
        active_reservations=[],
    )


def _make_coordinator(data: CoordinatorData):
    """Return a minimal coordinator mock."""

    coordinator = MagicMock()
    coordinator.data = data
    coordinator.async_add_listener.return_value = lambda: None
    return coordinator


def _create_entry(unique_id: str):
    """Create a mock entry for entity tests."""

    return MockConfigEntry(domain=DOMAIN, data={}, unique_id=unique_id, title="City")
