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
    NextChargeableEndSensor,
    NextChargeableStartSensor,
    PermitZoneAvailabilitySensor,
    ProviderChargeableEndSensor,
    ProviderChargeableStartSensor,
    _as_utc_iso,
    _current_or_next_window,
    _next_end_time,
    _remaining_balance_minutes,
    _timerange_to_dict,
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

        data = CoordinatorData(
            permit_id="permit",
            permit_remaining_minutes=0,
            zone_validity=zone_validity,
            reservations=[],
            favorites=[],
            zone_availability=availability,
            active_reservations=[],
        )
        coordinator = _make_coordinator(data)
        entry = _create_entry("provider:permit1:city")
        sensor = PermitZoneAvailabilitySensor(coordinator, entry)

        assert sensor.native_value == "free"
        attributes = sensor.extra_state_attributes
        expected_override_start = dt_util.as_utc(expected_local)
        expected_override_end = dt_util.as_utc(
            datetime.combine(
                local_now.date(),
                time(12, 0),
                tzinfo=local_now.tzinfo,
            )
        )
        assert attributes["windows_today"] == [
            _timerange_to_dict(
                TimeRange(start=expected_override_start, end=expected_override_end)
            )
        ]
        assert attributes["provider_windows_today"] == [
            _timerange_to_dict(zone_validity[0])
        ]
        provider_start_sensor = ProviderChargeableStartSensor(coordinator, entry)
        provider_end_sensor = ProviderChargeableEndSensor(coordinator, entry)
        assert provider_start_sensor.native_value == zone_validity[0].start
        assert provider_end_sensor.native_value == zone_validity[0].end


async def test_next_chargeable_window_uses_overrides() -> None:
    """Next chargeable window should use overrides when configured."""

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
        data = CoordinatorData(
            permit_id="permit",
            permit_remaining_minutes=0,
            zone_validity=zone_validity,
            reservations=[],
            favorites=[],
            zone_availability=availability,
            active_reservations=[],
        )
        coordinator = _make_coordinator(data)
        entry = MockConfigEntry(
            domain=DOMAIN,
            data={},
            options=options,
            unique_id="provider:permit1:city",
            title="City",
        )
        start_sensor = NextChargeableStartSensor(coordinator, entry)
        end_sensor = NextChargeableEndSensor(coordinator, entry)

        local_now = dt_util.as_local(now)
        expected_start_local = datetime.combine(
            local_now.date(),
            time(10, 0),
            tzinfo=local_now.tzinfo,
        )
        expected_end_local = datetime.combine(
            local_now.date(),
            time(12, 0),
            tzinfo=local_now.tzinfo,
        )

        assert start_sensor.native_value == dt_util.as_utc(expected_start_local)
        assert end_sensor.native_value == dt_util.as_utc(expected_end_local)


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


def test_sensor_helpers() -> None:
    """Sensor helper functions should normalize values."""

    data = _sample_data()
    data_no_active = CoordinatorData(
        permit_id=data.permit_id,
        permit_remaining_minutes=data.permit_remaining_minutes,
        zone_validity=data.zone_validity,
        reservations=data.reservations,
        favorites=data.favorites,
        zone_availability=data.zone_availability,
        active_reservations=[],
    )
    data_with_active = CoordinatorData(
        permit_id=data.permit_id,
        permit_remaining_minutes=data.permit_remaining_minutes,
        zone_validity=data.zone_validity,
        reservations=data.reservations,
        favorites=data.favorites,
        zone_availability=data.zone_availability,
        active_reservations=[
            Reservation(
                reservation_id="res2",
                start_time=datetime(2025, 1, 1, 7, 0, tzinfo=UTC),
                end_time=datetime(2025, 1, 1, 8, 0, tzinfo=UTC),
            ),
            Reservation(
                reservation_id="res3",
                start_time=datetime(2025, 1, 1, 6, 0, tzinfo=UTC),
                end_time=datetime(2025, 1, 1, 7, 30, tzinfo=UTC),
            ),
        ],
    )
    assert _remaining_balance_minutes(data) == 90
    assert _next_end_time(data_no_active) is None
    assert _next_end_time(data_with_active) == datetime(2025, 1, 1, 7, 30, tzinfo=UTC)
    assert _as_utc_iso(None) == ""

    window = TimeRange(
        start=datetime(2025, 1, 1, 8, 0, tzinfo=UTC),
        end=datetime(2025, 1, 1, 9, 0, tzinfo=UTC),
    )
    assert _timerange_to_dict(window)["start"].endswith("+00:00")
    assert _current_or_next_window([window], datetime(2025, 1, 1, 7, 0, tzinfo=UTC))
    assert (
        _current_or_next_window([window], datetime(2025, 1, 1, 9, 0, tzinfo=UTC))
        is None
    )
