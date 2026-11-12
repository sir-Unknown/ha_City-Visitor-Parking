"""Sensor platform for City visitor parking."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.components.sensor import SensorDeviceClass, SensorStateClass
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import callback
from homeassistant.util import dt as dt_util

from .const import STATE_CHARGEABLE, STATE_FREE
from .entity import CityVisitorParkingEntity
from .time_windows import (
    current_or_next_window,
    current_or_next_window_with_overrides,
    windows_for_today,
)

if TYPE_CHECKING:
    from datetime import datetime

    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .coordinator import CityVisitorParkingCoordinator
    from .models import CoordinatorData, TimeRange, Zone, ZoneAvailability
    from .runtime_data import CityVisitorParkingConfigEntry

PARALLEL_UPDATES = 0
# Single-zone permits are fully covered by the permit-level sensors.
MIN_ZONES_FOR_ZONE_SENSORS = 2


async def async_setup_entry(
    hass: HomeAssistant,
    entry: CityVisitorParkingConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up City visitor parking sensors based on a config entry."""
    coordinator = entry.runtime_data.coordinator
    async_add_entities(
        [
            ActiveReservationsSensor(coordinator, entry),
            FutureReservationsSensor(coordinator, entry),
            RemainingTimeSensor(coordinator, entry),
            PermitZoneAvailabilitySensor(coordinator, entry),
            ProviderChargeableStartSensor(coordinator, entry),
            ProviderChargeableEndSensor(coordinator, entry),
            NextChargeableStartSensor(coordinator, entry),
            NextChargeableEndSensor(coordinator, entry),
            FavoritesSensor(coordinator, entry),
        ]
    )

    known_zone_ids: set[str] = set()

    @callback
    def _async_add_zone_sensors() -> None:
        """Add per-zone sensors for zones that have no entities yet.

        Zones are only known from coordinator data and may change between
        refreshes, so this also runs on every coordinator update. Zones that
        disappear keep their entities, which then report unavailable.
        """
        data = coordinator.data
        if len(data.zones) < MIN_ZONES_FOR_ZONE_SENSORS:
            return
        new_zones = [zone for zone in data.zones if zone.zone_id not in known_zone_ids]
        if not new_zones:
            return
        known_zone_ids.update(zone.zone_id for zone in new_zones)
        async_add_entities(
            [
                sensor_cls(coordinator, entry, zone)
                for zone in new_zones
                for sensor_cls in ZONE_SENSOR_CLASSES
            ]
        )

    _async_add_zone_sensors()
    entry.async_on_unload(coordinator.async_add_listener(_async_add_zone_sensors))


class ActiveReservationsSensor(CityVisitorParkingEntity):
    """Sensor for active reservations count."""

    _entity_key = "active_reservations"
    _attr_translation_key: str | None = "active_reservations"
    _attr_state_class: SensorStateClass | None = SensorStateClass.MEASUREMENT

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        self._attr_native_value = len(self.coordinator.data.active_reservations)


class FutureReservationsSensor(CityVisitorParkingEntity):
    """Sensor for future reservations count."""

    _entity_key = "future_reservations"
    _attr_translation_key: str | None = "future_reservations"
    _attr_state_class: SensorStateClass | None = SensorStateClass.MEASUREMENT

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        now = dt_util.utcnow()
        self._attr_native_value = sum(
            1
            for reservation in self.coordinator.data.reservations
            if reservation.start_time > now
        )


class RemainingTimeSensor(CityVisitorParkingEntity):
    """Sensor for remaining balance presented by balance unit."""

    _entity_key = "remaining_time"
    _attr_translation_key: str | None = "remaining_time"
    _attr_device_class: SensorDeviceClass | None = None
    _attr_native_unit_of_measurement: str | None = UnitOfTime.HOURS
    _attr_suggested_display_precision: int | None = 2

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        balance_unit = self.coordinator.data.permit_balance_unit
        remaining_balance = _remaining_balance(self.coordinator.data)
        next_end_time = _next_end_time(self.coordinator.data)
        active_count = len(self.coordinator.data.active_reservations)
        attributes: dict[str, object] = dict(self._attr_extra_state_attributes or {})  # type: ignore[has-type]
        attributes.update(
            {
                "active_reservations": active_count,
                "next_end_time": _as_utc_iso(next_end_time) if next_end_time else None,
                "has_active_reservation": active_count > 0,
            }
        )

        if balance_unit == "TIMES":
            self._attr_device_class = None
            self._attr_native_unit_of_measurement = "times"
            self._attr_suggested_display_precision = 0
            attributes["remaining_balance"] = remaining_balance
            self._attr_native_value = _as_count_value(remaining_balance)
        elif balance_unit is not None and balance_unit != "MINUTE":
            self._attr_device_class = SensorDeviceClass.MONETARY
            self._attr_native_unit_of_measurement = _normalize_currency_unit(
                balance_unit
            )
            self._attr_suggested_display_precision = 2
            attributes["remaining_balance"] = remaining_balance
            self._attr_native_value = float(remaining_balance)
        else:
            self._attr_device_class = SensorDeviceClass.DURATION
            self._attr_native_unit_of_measurement = UnitOfTime.HOURS
            self._attr_suggested_display_precision = 2
            attributes["remaining_balance"] = remaining_balance
            self._attr_native_value = round(remaining_balance / 60, 2)

        self._attr_extra_state_attributes = attributes


class _ChargeableWindowSensor(CityVisitorParkingEntity):
    """Base for sensors derived from one set of chargeable windows.

    Permit-level sensors read the default zone from the coordinator data;
    per-zone subclasses override ``_zone_source`` to read their own zone.
    """

    def _zone_source(self) -> tuple[tuple[TimeRange, ...], ZoneAvailability] | None:
        """Return the zone validity and availability, or None when unknown."""
        data = self.coordinator.data
        return data.zone_validity, data.zone_availability


class PermitZoneAvailabilitySensor(_ChargeableWindowSensor):
    """Sensor for permit zone availability."""

    _entity_key = "permit_zone_availability"
    _attr_translation_key: str | None = "permit_zone_availability"

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._zone_source()
        if source is None:
            return
        zone_validity, availability = source
        now = dt_util.utcnow()
        provider_windows = windows_for_today(zone_validity, {}, now)
        next_window = current_or_next_window_with_overrides(
            zone_validity,
            self._entry.options,
            now,
        )
        provider_next_window = current_or_next_window(zone_validity, now)
        attributes: dict[str, object] = dict(self._attr_extra_state_attributes or {})  # type: ignore[has-type]
        attributes.update(
            {
                "is_chargeable_now": availability.is_chargeable_now,
                "Today provider": [
                    _timerange_to_dict(window) for window in provider_windows
                ],
                "Today user entered": [
                    _timerange_to_dict(window) for window in availability.windows_today
                ],
                "Next provider": _timerange_to_dict(provider_next_window)
                if provider_next_window
                else None,
                "Next user entered": _timerange_to_dict(next_window)
                if next_window
                else None,
            }
        )
        self._attr_native_value = (
            STATE_CHARGEABLE if availability.is_chargeable_now else STATE_FREE
        )
        self._attr_extra_state_attributes = attributes


class ProviderChargeableStartSensor(_ChargeableWindowSensor):
    """Sensor for the start of the current or next provider chargeable window."""

    _entity_key = "provider_chargeable_start"
    _attr_translation_key: str | None = "provider_chargeable_start"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP
    _attr_entity_category: EntityCategory | None = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default: bool = False

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._zone_source()
        if source is None:
            return
        window = current_or_next_window(source[0], dt_util.utcnow())
        self._attr_native_value = window.start if window else None


class ProviderChargeableEndSensor(_ChargeableWindowSensor):
    """Sensor for the end of the current or next provider chargeable window."""

    _entity_key = "provider_chargeable_end"
    _attr_translation_key: str | None = "provider_chargeable_end"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP
    _attr_entity_category: EntityCategory | None = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default: bool = False

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._zone_source()
        if source is None:
            return
        window = current_or_next_window(source[0], dt_util.utcnow())
        self._attr_native_value = window.end if window else None


class NextChargeableStartSensor(_ChargeableWindowSensor):
    """Sensor for the start of the current or next chargeable window."""

    _entity_key = "next_chargeable_start"
    _attr_translation_key: str | None = "next_chargeable_start"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._zone_source()
        if source is None:
            return
        window = current_or_next_window_with_overrides(
            source[0],
            self._entry.options,
            dt_util.utcnow(),
        )
        self._attr_native_value = window.start if window else None


class NextChargeableEndSensor(_ChargeableWindowSensor):
    """Sensor for the end of the current or next chargeable window."""

    _entity_key = "next_chargeable_end"
    _attr_translation_key: str | None = "next_chargeable_end"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._zone_source()
        if source is None:
            return
        window = current_or_next_window_with_overrides(
            source[0],
            self._entry.options,
            dt_util.utcnow(),
        )
        self._attr_native_value = window.end if window else None


class _ZoneSensor(_ChargeableWindowSensor):
    """Base for sensors of one selectable zone of a multi-zone permit.

    The unique ID combines the entry unique ID, the zone ID and a fixed
    suffix. The entity is unavailable while its zone is missing from the
    coordinator data.
    """

    _zone_entity_suffix: str

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
        zone: Zone,
    ) -> None:
        """Initialize the zone sensor."""
        self._zone_id = zone.zone_id
        self._attr_translation_placeholders = {"zone": zone.name}
        super().__init__(
            coordinator, entry, f"zone:{zone.zone_id}:{self._zone_entity_suffix}"
        )

    @property
    def available(self) -> bool:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return if the coordinator is healthy and the zone still exists."""
        return super().available and self._zone() is not None

    def _zone(self) -> Zone | None:
        """Return this sensor's zone from the coordinator data."""
        return self.coordinator.data.zone(self._zone_id)

    def _zone_source(self) -> tuple[tuple[TimeRange, ...], ZoneAvailability] | None:
        """Return the zone's validity and availability, or None when gone."""
        zone = self._zone()
        if zone is None:
            return None
        return zone.zone_validity, zone.zone_availability


class ZoneAvailabilitySensor(_ZoneSensor, PermitZoneAvailabilitySensor):
    """Sensor for the availability of one zone."""

    _zone_entity_suffix = "availability"
    _attr_translation_key: str | None = "zone_availability"


class ZoneProviderChargeableStartSensor(_ZoneSensor, ProviderChargeableStartSensor):
    """Sensor for the start of a zone's current or next provider window."""

    _zone_entity_suffix = "provider_chargeable_start"
    _attr_translation_key: str | None = "zone_provider_chargeable_start"


class ZoneProviderChargeableEndSensor(_ZoneSensor, ProviderChargeableEndSensor):
    """Sensor for the end of a zone's current or next provider window."""

    _zone_entity_suffix = "provider_chargeable_end"
    _attr_translation_key: str | None = "zone_provider_chargeable_end"


class ZoneNextChargeableStartSensor(_ZoneSensor, NextChargeableStartSensor):
    """Sensor for the start of a zone's current or next chargeable window."""

    _zone_entity_suffix = "next_chargeable_start"
    _attr_translation_key: str | None = "zone_next_chargeable_start"


class ZoneNextChargeableEndSensor(_ZoneSensor, NextChargeableEndSensor):
    """Sensor for the end of a zone's current or next chargeable window."""

    _zone_entity_suffix = "next_chargeable_end"
    _attr_translation_key: str | None = "zone_next_chargeable_end"


ZONE_SENSOR_CLASSES: tuple[type[_ZoneSensor], ...] = (
    ZoneAvailabilitySensor,
    ZoneProviderChargeableStartSensor,
    ZoneProviderChargeableEndSensor,
    ZoneNextChargeableStartSensor,
    ZoneNextChargeableEndSensor,
)


class FavoritesSensor(CityVisitorParkingEntity):
    """Sensor for favorites count."""

    _entity_key = "favorites"
    _attr_translation_key: str | None = "favorites"
    _attr_state_class: SensorStateClass | None = SensorStateClass.MEASUREMENT

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        self._attr_native_value = len(self.coordinator.data.favorites)


def _remaining_balance(data: CoordinatorData) -> float:
    """Return the remaining balance (minutes, times, or monetary amount)."""
    return max(0.0, data.permit_remaining_balance)


def _as_count_value(value: float) -> int | float:
    """Return an integer count when the balance is a whole number."""
    if value.is_integer():
        return int(value)
    return value


def _normalize_currency_unit(unit: str) -> str:
    """Normalize provider currency labels to Home Assistant-friendly codes."""
    if unit == "EURO":
        return "EUR"
    return unit


def _next_end_time(data: CoordinatorData) -> datetime | None:
    """Return the next end time for active reservations."""
    if not data.active_reservations:
        return None

    return min(reservation.end_time for reservation in data.active_reservations)


def _timerange_to_dict(window: TimeRange) -> dict[str, str]:
    """Convert a TimeRange to a dict with UTC ISO8601 strings."""
    return {
        "start": _as_utc_iso(window.start),
        "end": _as_utc_iso(window.end),
    }


def _as_utc_iso(value: datetime | None) -> str:
    """Return a UTC ISO8601 timestamp string."""
    if value is None:
        return ""
    return dt_util.as_utc(value).isoformat()
