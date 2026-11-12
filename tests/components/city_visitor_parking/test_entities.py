"""Tests for City visitor parking entities."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock, MagicMock

from freezegun import freeze_time
from homeassistant.components.sensor import SensorDeviceClass, SensorStateClass
from homeassistant.const import UnitOfTime
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.const import (
    CONF_OPERATING_TIME_OVERRIDES,
    DOMAIN,
    STATE_CHARGEABLE,
)
from custom_components.city_visitor_parking.coordinator import (
    _compute_zone_availability,
)
from custom_components.city_visitor_parking.entity import CityVisitorParkingEntity
from custom_components.city_visitor_parking.models import (
    CoordinatorData,
    Favorite,
    Reservation,
    TimeRange,
    Zone,
    ZoneAvailability,
)
from custom_components.city_visitor_parking.sensor import (
    ActiveReservationsSensor,
    FavoritesSensor,
    FutureReservationsSensor,
    NextChargeableEndSensor,
    NextChargeableStartSensor,
    PermitZoneAvailabilitySensor,
    ProviderChargeableEndSensor,
    ProviderChargeableStartSensor,
    RemainingTimeSensor,
    ZoneAvailabilitySensor,
    ZoneNextChargeableEndSensor,
    ZoneNextChargeableStartSensor,
    ZoneProviderChargeableEndSensor,
    ZoneProviderChargeableStartSensor,
    _as_utc_iso,
    _next_end_time,
    _remaining_balance,
    _timerange_to_dict,
    async_setup_entry,
)
from custom_components.city_visitor_parking.time_windows import current_or_next_window

if TYPE_CHECKING:
    from collections.abc import Callable, Iterable, Mapping

    from homeassistant.components.sensor import SensorEntity
    from homeassistant.core import HomeAssistant
    from homeassistant.helpers import entity_registry as er
    from pytest import MonkeyPatch

EXPECTED_REMAINING_HOURS = 2.0
EXPECTED_REMAINING_MINUTES = 90
EXPECTED_COUNT_BALANCE = 3
EXPECTED_DURATION_BALANCE = 120
EXPECTED_MONETARY_BALANCE = 12.5
EXPECTED_EURO_BALANCE = 237.5
PERMIT_SENSOR_COUNT = 9
ZONE_SENSOR_SUFFIXES = (
    "availability",
    "provider_chargeable_start",
    "provider_chargeable_end",
    "next_chargeable_start",
    "next_chargeable_end",
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
    device_info_one = sensor_one.device_info
    device_info_two = sensor_two.device_info
    assert device_info_one is not None
    assert device_info_two is not None
    assert (DOMAIN, entry_one.entry_id) in device_info_one["identifiers"]
    assert (DOMAIN, entry_two.entry_id) in device_info_two["identifiers"]


async def test_count_sensors_use_measurement_state_class() -> None:
    """Count sensors should be numeric measurements so HA records statistics."""
    coordinator = _make_coordinator(_sample_data())
    entry = _create_entry("provider:permit1:city")

    for sensor_cls in (
        ActiveReservationsSensor,
        FutureReservationsSensor,
        FavoritesSensor,
    ):
        sensor = sensor_cls(coordinator, entry)
        assert sensor.state_class == SensorStateClass.MEASUREMENT


async def test_entity_device_info_includes_configuration_url() -> None:
    """Entities should expose the provider GUI URL in device info."""
    coordinator = _make_coordinator(_sample_data())
    entry = _create_entry("provider:permit1:city")
    entry.runtime_data = SimpleNamespace(
        provider_config=SimpleNamespace(
            gui_url="https://parkeren.rijswijk.nl/DVSPortal/"
        )
    )

    sensor = ActiveReservationsSensor(coordinator, entry)

    device_info = sensor.device_info
    assert device_info is not None
    assert device_info["configuration_url"] == "https://parkeren.rijswijk.nl/DVSPortal/"


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
            permit_remaining_balance=0,
            permit_balance_unit=None,
            zone_validity=tuple(zone_validity),
            reservations=(),
            favorites=(),
            zone_availability=availability,
            active_reservations=(),
        )
        coordinator = _make_coordinator(data)
        entry = _create_entry("provider:permit1:city", options=options)
        sensor = PermitZoneAvailabilitySensor(coordinator, entry)

        assert sensor.native_value == "free"
        attributes = sensor.extra_state_attributes
        assert attributes is not None
        expected_override_start = dt_util.as_utc(expected_local)
        expected_override_end = dt_util.as_utc(
            datetime.combine(
                local_now.date(),
                time(12, 0),
                tzinfo=local_now.tzinfo,
            )
        )
        expected_window = TimeRange(
            start=expected_override_start,
            end=expected_override_end,
        )
        expected_provider = _timerange_to_dict(zone_validity[0])
        expected_user = _timerange_to_dict(expected_window)
        assert attributes["Today provider"] == [expected_provider]
        assert attributes["Today user entered"] == [expected_user]
        assert attributes["Next provider"] == expected_provider
        assert attributes["Next user entered"] == expected_user
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
            permit_remaining_balance=0,
            permit_balance_unit=None,
            zone_validity=tuple(zone_validity),
            reservations=(),
            favorites=(),
            zone_availability=availability,
            active_reservations=(),
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


async def test_entity_async_update_respects_registry() -> None:
    """Entity updates should respect registry disabled state."""
    coordinator = MagicMock()
    coordinator.async_add_listener.return_value = lambda: None
    coordinator.async_request_refresh = AsyncMock()
    entry = _create_entry("provider:permit1:city")

    entity = CityVisitorParkingEntity(coordinator, entry, "base")
    entity.registry_entry = cast("er.RegistryEntry", SimpleNamespace(disabled=True))
    await entity.async_update()

    coordinator.async_request_refresh.assert_not_called()

    entity.registry_entry = None
    await entity.async_update()

    coordinator.async_request_refresh.assert_awaited_once()


async def test_sensors_handle_coordinator_update(
    monkeypatch: MonkeyPatch,
) -> None:
    """Sensors should refresh values when coordinator updates."""
    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    zone_window = TimeRange(
        start=now - timedelta(hours=1),
        end=now + timedelta(hours=1),
    )
    data = CoordinatorData(
        permit_id="permit",
        permit_remaining_balance=120,
        permit_balance_unit=None,
        zone_validity=(zone_window,),
        reservations=(
            Reservation(
                reservation_id="future",
                start_time=now + timedelta(hours=2),
                end_time=now + timedelta(hours=3),
            ),
        ),
        favorites=(Favorite(favorite_id="fav1"),),
        zone_availability=ZoneAvailability(
            is_chargeable_now=True,
            next_change_time=zone_window.end,
            windows_today=(zone_window,),
        ),
        active_reservations=(
            Reservation(
                reservation_id="active",
                start_time=now - timedelta(minutes=30),
                end_time=now + timedelta(minutes=30),
            ),
        ),
    )
    coordinator = _make_coordinator(data)
    coordinator.last_update_success = True
    entry = _create_entry("provider:permit1:city")

    with freeze_time(now):
        active_sensor = ActiveReservationsSensor(coordinator, entry)
        future_sensor = FutureReservationsSensor(coordinator, entry)
        remaining_sensor = RemainingTimeSensor(coordinator, entry)
        availability_sensor = PermitZoneAvailabilitySensor(coordinator, entry)
        provider_start = ProviderChargeableStartSensor(coordinator, entry)
        provider_end = ProviderChargeableEndSensor(coordinator, entry)
        next_start = NextChargeableStartSensor(coordinator, entry)
        next_end = NextChargeableEndSensor(coordinator, entry)
        favorites_sensor = FavoritesSensor(coordinator, entry)

        for sensor in (
            active_sensor,
            future_sensor,
            remaining_sensor,
            availability_sensor,
            provider_start,
            provider_end,
            next_start,
            next_end,
            favorites_sensor,
        ):
            monkeypatch.setattr(sensor, "async_write_ha_state", MagicMock())
            sensor._handle_coordinator_update()

    assert active_sensor.native_value == 1
    assert future_sensor.native_value == 1
    assert remaining_sensor.native_value == EXPECTED_REMAINING_HOURS
    assert remaining_sensor.device_class == SensorDeviceClass.DURATION
    assert availability_sensor.native_value == STATE_CHARGEABLE
    assert provider_start.native_value == zone_window.start
    assert provider_end.native_value == zone_window.end
    assert next_start.native_value == zone_window.start
    assert next_end.native_value == zone_window.end
    assert favorites_sensor.native_value == 1


async def test_remaining_balance_sensor_uses_count_presentation() -> None:
    """Count balances should not be converted to hours."""
    coordinator = _make_coordinator(
        CoordinatorData(
            permit_id="permit",
            permit_remaining_balance=EXPECTED_COUNT_BALANCE,
            permit_balance_unit="TIMES",
            zone_validity=(),
            reservations=(),
            favorites=(),
            zone_availability=ZoneAvailability(
                is_chargeable_now=True,
                next_change_time=None,
                windows_today=(),
            ),
            active_reservations=(),
        )
    )
    entry = _create_entry("provider:permit1:city")

    sensor = RemainingTimeSensor(coordinator, entry)

    assert sensor.native_value == EXPECTED_COUNT_BALANCE
    assert sensor.native_unit_of_measurement == "times"
    assert sensor.device_class is None
    assert sensor.extra_state_attributes is not None
    assert sensor.extra_state_attributes["remaining_balance"] == EXPECTED_COUNT_BALANCE


async def test_remaining_balance_sensor_uses_duration_presentation() -> None:
    """Minute balances should be presented as a duration."""
    coordinator = _make_coordinator(
        CoordinatorData(
            permit_id="permit",
            permit_remaining_balance=EXPECTED_DURATION_BALANCE,
            permit_balance_unit="MINUTE",
            zone_validity=(),
            reservations=(),
            favorites=(),
            zone_availability=ZoneAvailability(
                is_chargeable_now=True,
                next_change_time=None,
                windows_today=(),
            ),
            active_reservations=(),
        )
    )
    entry = _create_entry("provider:permit1:city")

    sensor = RemainingTimeSensor(coordinator, entry)

    assert sensor.native_value == EXPECTED_REMAINING_HOURS
    assert sensor.native_unit_of_measurement == UnitOfTime.HOURS
    assert sensor.device_class == SensorDeviceClass.DURATION
    assert sensor.extra_state_attributes is not None
    assert (
        sensor.extra_state_attributes["remaining_balance"] == EXPECTED_DURATION_BALANCE
    )


async def test_remaining_balance_sensor_uses_monetary_presentation() -> None:
    """Monetary balances should keep their provider currency unit."""
    coordinator = _make_coordinator(
        CoordinatorData(
            permit_id="permit",
            permit_remaining_balance=EXPECTED_MONETARY_BALANCE,
            permit_balance_unit="EUR",
            zone_validity=(),
            reservations=(),
            favorites=(),
            zone_availability=ZoneAvailability(
                is_chargeable_now=True,
                next_change_time=None,
                windows_today=(),
            ),
            active_reservations=(),
        )
    )
    entry = _create_entry("provider:permit1:city")

    sensor = RemainingTimeSensor(coordinator, entry)

    assert sensor.native_value == EXPECTED_MONETARY_BALANCE
    assert sensor.native_unit_of_measurement == "EUR"
    assert sensor.device_class == SensorDeviceClass.MONETARY
    assert sensor.extra_state_attributes is not None
    assert (
        sensor.extra_state_attributes["remaining_balance"] == EXPECTED_MONETARY_BALANCE
    )


async def test_remaining_balance_sensor_normalizes_euro_currency_code() -> None:
    """Provider EURO labels should be normalized to EUR for display."""
    coordinator = _make_coordinator(
        CoordinatorData(
            permit_id="permit",
            permit_remaining_balance=EXPECTED_EURO_BALANCE,
            permit_balance_unit="EURO",
            zone_validity=(),
            reservations=(),
            favorites=(),
            zone_availability=ZoneAvailability(
                is_chargeable_now=True,
                next_change_time=None,
                windows_today=(),
            ),
            active_reservations=(),
        )
    )
    entry = _create_entry("provider:permit1:city")

    sensor = RemainingTimeSensor(coordinator, entry)

    assert sensor.native_value == EXPECTED_EURO_BALANCE
    assert sensor.native_unit_of_measurement == "EUR"
    assert sensor.device_class == SensorDeviceClass.MONETARY


def _sample_data(zone_availability: ZoneAvailability | None = None) -> CoordinatorData:
    """Create coordinator data for tests."""
    availability = zone_availability or ZoneAvailability(
        is_chargeable_now=True,
        next_change_time=None,
        windows_today=(),
    )
    return CoordinatorData(
        permit_id="permit",
        permit_remaining_balance=90,
        permit_balance_unit=None,
        zone_validity=(),
        reservations=(
            Reservation(
                reservation_id="res1",
                start_time=datetime.now(UTC) - timedelta(hours=1),
                end_time=datetime.now(UTC) + timedelta(hours=1),
            ),
        ),
        favorites=(Favorite(favorite_id="fav1"),),
        zone_availability=availability,
        active_reservations=(),
    )


def _make_coordinator(data: CoordinatorData) -> MagicMock:
    """Return a minimal coordinator mock."""
    coordinator = MagicMock()
    coordinator.data = data
    coordinator.async_add_listener.return_value = lambda: None
    return coordinator


def _create_entry(
    unique_id: str, options: Mapping[str, object] | None = None
) -> MockConfigEntry:
    """Create a mock entry for entity tests."""
    return MockConfigEntry(
        domain=DOMAIN,
        data={},
        options=dict(options or {}),
        unique_id=unique_id,
        title="City",
    )


def test_sensor_helpers() -> None:
    """Sensor helper functions should normalize values."""
    data = _sample_data()
    data_no_active = CoordinatorData(
        permit_id=data.permit_id,
        permit_remaining_balance=data.permit_remaining_balance,
        permit_balance_unit=None,
        zone_validity=data.zone_validity,
        reservations=data.reservations,
        favorites=data.favorites,
        zone_availability=data.zone_availability,
        active_reservations=(),
    )
    data_with_active = CoordinatorData(
        permit_id=data.permit_id,
        permit_remaining_balance=data.permit_remaining_balance,
        permit_balance_unit=None,
        zone_validity=data.zone_validity,
        reservations=data.reservations,
        favorites=data.favorites,
        zone_availability=data.zone_availability,
        active_reservations=(
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
        ),
    )
    assert _remaining_balance(data) == EXPECTED_REMAINING_MINUTES
    assert _next_end_time(data_no_active) is None
    assert _next_end_time(data_with_active) == datetime(2025, 1, 1, 7, 30, tzinfo=UTC)
    assert _as_utc_iso(None) == ""

    window = TimeRange(
        start=datetime(2025, 1, 1, 8, 0, tzinfo=UTC),
        end=datetime(2025, 1, 1, 9, 0, tzinfo=UTC),
    )
    assert _timerange_to_dict(window)["start"].endswith("+00:00")
    assert current_or_next_window([window], datetime(2025, 1, 1, 7, 0, tzinfo=UTC))
    assert (
        current_or_next_window([window], datetime(2025, 1, 1, 9, 0, tzinfo=UTC)) is None
    )


async def test_entity_availability_follows_coordinator() -> None:
    """Entities must go unavailable when coordinator updates keep failing."""
    coordinator = MagicMock()
    coordinator.async_add_listener.return_value = lambda: None
    entry = _create_entry("provider:permit1:city")

    entity = CityVisitorParkingEntity(coordinator, entry, "base")

    coordinator.last_update_success = True
    assert entity.available is True

    coordinator.last_update_success = False
    assert entity.available is False


_ZONE_NOW = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
_ZONE_ENTRY_ID = "provider:permit1:city"


def _zone(zone_id: str, window: TimeRange | None) -> Zone:
    """Return a zone that is chargeable during ``window`` (free without one)."""
    validity = (window,) if window else ()
    chargeable = window is not None and window.start <= _ZONE_NOW < window.end
    return Zone(
        zone_id=zone_id,
        name=f"Z{zone_id}",
        zone_validity=validity,
        zone_availability=ZoneAvailability(
            is_chargeable_now=chargeable,
            next_change_time=window.end if chargeable and window else None,
            windows_today=validity,
        ),
    )


def _zone_data(zones: Iterable[Zone]) -> CoordinatorData:
    """Return coordinator data whose default zone is the first of ``zones``."""
    zones = tuple(zones)
    base = _sample_data()
    return CoordinatorData(
        permit_id=base.permit_id,
        permit_remaining_balance=base.permit_remaining_balance,
        permit_balance_unit=None,
        zone_validity=zones[0].zone_validity if zones else (),
        reservations=(),
        favorites=(),
        zone_availability=zones[0].zone_availability
        if zones
        else base.zone_availability,
        active_reservations=(),
        zones=zones,
    )


_CURRENT_WINDOW = TimeRange(
    start=_ZONE_NOW - timedelta(hours=1), end=_ZONE_NOW + timedelta(hours=13)
)
_NEXT_WINDOW = TimeRange(
    start=_ZONE_NOW + timedelta(hours=14), end=_ZONE_NOW + timedelta(hours=15)
)


async def _setup_sensors(
    hass: HomeAssistant, data: CoordinatorData
) -> tuple[MagicMock, list[SensorEntity], Callable[[], None]]:
    """Run the sensor platform setup and return coordinator, entities, listener."""
    coordinator = _make_coordinator(data)
    coordinator.last_update_success = True
    entry = _create_entry(_ZONE_ENTRY_ID)
    entry.runtime_data = SimpleNamespace(
        coordinator=coordinator, provider_config=SimpleNamespace(gui_url=None)
    )
    added: list[SensorEntity] = []

    def _add_entities(entities: Iterable[SensorEntity], *_args: object) -> None:
        added.extend(entities)

    await async_setup_entry(hass, cast("Any", entry), cast("Any", _add_entities))
    listener = coordinator.async_add_listener.call_args.args[0]
    return coordinator, added, listener


def _zone_sensors(entities: Iterable[SensorEntity]) -> dict[str, SensorEntity]:
    """Return per-zone entities keyed by unique ID."""
    prefix = f"{_ZONE_ENTRY_ID}:zone:"
    return {
        str(entity.unique_id): entity
        for entity in entities
        if str(entity.unique_id).startswith(prefix)
    }


async def test_zone_sensors_created_for_each_zone(hass: HomeAssistant) -> None:
    """A multi-zone permit gets availability and window sensors per zone."""
    zones = (
        _zone("10", None),
        _zone("630", _CURRENT_WINDOW),
        _zone("632", _NEXT_WINDOW),
    )
    with freeze_time(_ZONE_NOW):
        _coordinator, entities, _listener = await _setup_sensors(
            hass, _zone_data(zones)
        )

    zone_sensors = _zone_sensors(entities)
    assert len(entities) == PERMIT_SENSOR_COUNT + len(zones) * len(ZONE_SENSOR_SUFFIXES)
    assert set(zone_sensors) == {
        f"{_ZONE_ENTRY_ID}:zone:{zone.zone_id}:{suffix}"
        for zone in zones
        for suffix in ZONE_SENSOR_SUFFIXES
    }

    def _sensor(zone_id: str, suffix: str) -> SensorEntity:
        return zone_sensors[f"{_ZONE_ENTRY_ID}:zone:{zone_id}:{suffix}"]

    availability = _sensor("630", "availability")
    assert isinstance(availability, ZoneAvailabilitySensor)
    assert availability.translation_key == "zone_availability"
    assert availability.translation_placeholders == {"zone": "Z630"}
    assert availability.native_value == STATE_CHARGEABLE
    attributes = availability.extra_state_attributes
    assert attributes is not None
    assert attributes["Next provider"] == _timerange_to_dict(_CURRENT_WINDOW)
    assert attributes["Today user entered"] == [_timerange_to_dict(_CURRENT_WINDOW)]
    assert _sensor("10", "availability").native_value == "free"
    assert _sensor("632", "availability").native_value == "free"

    provider_start = _sensor("632", "provider_chargeable_start")
    assert isinstance(provider_start, ZoneProviderChargeableStartSensor)
    assert provider_start.entity_registry_enabled_default is False
    assert provider_start.native_value == _NEXT_WINDOW.start
    assert isinstance(
        _sensor("632", "provider_chargeable_end"), ZoneProviderChargeableEndSensor
    )
    assert _sensor("632", "provider_chargeable_end").native_value == _NEXT_WINDOW.end
    next_start = _sensor("630", "next_chargeable_start")
    assert isinstance(next_start, ZoneNextChargeableStartSensor)
    assert next_start.native_value == _CURRENT_WINDOW.start
    next_end = _sensor("630", "next_chargeable_end")
    assert isinstance(next_end, ZoneNextChargeableEndSensor)
    assert next_end.native_value == _CURRENT_WINDOW.end
    assert _sensor("10", "next_chargeable_start").native_value is None


async def test_zone_sensors_not_created_for_single_zone_permit(
    hass: HomeAssistant,
) -> None:
    """Permits with zero or one zone only get the permit-level sensors."""
    for zones in ((), (_zone("10", None),)):
        _coordinator, entities, _listener = await _setup_sensors(
            hass, _zone_data(zones)
        )
        assert len(entities) == PERMIT_SENSOR_COUNT
        assert not _zone_sensors(entities)


async def test_zone_sensors_added_when_zones_appear(hass: HomeAssistant) -> None:
    """Zones that show up after setup get entities once, without duplicates."""
    coordinator, entities, listener = await _setup_sensors(
        hass, _zone_data((_zone("10", None),))
    )
    assert not _zone_sensors(entities)

    coordinator.data = _zone_data((_zone("10", None), _zone("630", None)))
    listener()
    assert {unique_id.split(":")[-2] for unique_id in _zone_sensors(entities)} == {
        "10",
        "630",
    }

    coordinator.data = _zone_data(
        (_zone("10", None), _zone("630", None), _zone("632", None))
    )
    listener()
    listener()
    zone_sensors = _zone_sensors(entities)
    assert len(zone_sensors) == 3 * len(ZONE_SENSOR_SUFFIXES)
    assert len(entities) == PERMIT_SENSOR_COUNT + len(zone_sensors)


async def test_zone_sensors_unavailable_when_zone_disappears(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """A zone missing from coordinator data makes its entities unavailable."""
    with freeze_time(_ZONE_NOW):
        coordinator, entities, _listener = await _setup_sensors(
            hass, _zone_data((_zone("10", None), _zone("630", _CURRENT_WINDOW)))
        )
        zone_sensors = _zone_sensors(entities)
        availability = zone_sensors[f"{_ZONE_ENTRY_ID}:zone:630:availability"]
        assert isinstance(availability, ZoneAvailabilitySensor)
        monkeypatch.setattr(availability, "async_write_ha_state", MagicMock())
        assert availability.available is True

        coordinator.data = _zone_data((_zone("10", None), _zone("632", None)))
        availability._handle_coordinator_update()

    assert availability.available is False
    assert availability.native_value == STATE_CHARGEABLE
    assert zone_sensors[f"{_ZONE_ENTRY_ID}:zone:10:availability"].available is True
