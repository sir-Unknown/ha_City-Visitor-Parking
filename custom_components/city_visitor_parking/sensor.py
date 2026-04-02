"""Sensor platform for City visitor parking."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.const import EntityCategory, UnitOfTime
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

    from .models import CoordinatorData, TimeRange
    from .runtime_data import CityVisitorParkingConfigEntry

PARALLEL_UPDATES = 0


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


class ActiveReservationsSensor(CityVisitorParkingEntity):
    """Sensor for active reservations count."""

    _entity_key = "active_reservations"
    _attr_translation_key: str | None = "active_reservations"

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        self._attr_native_value = len(self.coordinator.data.active_reservations)


class FutureReservationsSensor(CityVisitorParkingEntity):
    """Sensor for future reservations count."""

    _entity_key = "future_reservations"
    _attr_translation_key: str | None = "future_reservations"

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        now = dt_util.utcnow()
        self._attr_native_value = sum(
            1
            for reservation in self.coordinator.data.reservations
            if reservation.start_time > now
        )


class RemainingTimeSensor(CityVisitorParkingEntity):
    """Sensor for remaining balance (time or monetary)."""

    _entity_key = "remaining_time"
    _attr_translation_key: str | None = "remaining_time"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement: str | None = UnitOfTime.HOURS
    _attr_suggested_display_precision: int | None = 2

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        balance_unit = self.coordinator.data.permit_balance_unit
        remaining_minutes = _remaining_balance_minutes(self.coordinator.data)
        next_end_time = _next_end_time(self.coordinator.data)
        active_count = len(self.coordinator.data.active_reservations)
        attributes = dict(self._attr_extra_state_attributes or {})
        attributes.update(
            {
                "active_reservations": active_count,
                "next_end_time": _as_utc_iso(next_end_time) if next_end_time else None,
                "has_active_reservation": active_count > 0,
            }
        )

        if balance_unit is not None and balance_unit != "TIMES":
            self._attr_device_class = SensorDeviceClass.MONETARY
            self._attr_native_unit_of_measurement = balance_unit
            self._attr_suggested_display_precision = 2
            self._attr_native_value = remaining_minutes
        else:
            self._attr_device_class = SensorDeviceClass.DURATION
            self._attr_native_unit_of_measurement = UnitOfTime.HOURS
            self._attr_suggested_display_precision = 2
            attributes["remaining_minutes"] = remaining_minutes
            self._attr_native_value = round(remaining_minutes / 60, 2)

        self._attr_extra_state_attributes = attributes


class PermitZoneAvailabilitySensor(CityVisitorParkingEntity):
    """Sensor for permit zone availability."""

    _entity_key = "permit_zone_availability"
    _attr_translation_key: str | None = "permit_zone_availability"

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        availability = self.coordinator.data.zone_availability
        now = dt_util.utcnow()
        provider_windows = windows_for_today(
            self.coordinator.data.zone_validity,
            {},
            now,
        )
        next_window = current_or_next_window_with_overrides(
            self.coordinator.data.zone_validity,
            self._entry.options,
            now,
        )
        provider_next_window = current_or_next_window(
            self.coordinator.data.zone_validity,
            now,
        )
        attributes = dict(self._attr_extra_state_attributes or {})
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


class ProviderChargeableStartSensor(CityVisitorParkingEntity):
    """Sensor for the start of the current or next provider chargeable window."""

    _entity_key = "provider_chargeable_start"
    _attr_translation_key: str | None = "provider_chargeable_start"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP
    _attr_entity_category: EntityCategory | None = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default: bool = False

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        window = current_or_next_window(
            self.coordinator.data.zone_validity,
            dt_util.utcnow(),
        )
        self._attr_native_value = window.start if window else None


class ProviderChargeableEndSensor(CityVisitorParkingEntity):
    """Sensor for the end of the current or next provider chargeable window."""

    _entity_key = "provider_chargeable_end"
    _attr_translation_key: str | None = "provider_chargeable_end"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP
    _attr_entity_category: EntityCategory | None = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default: bool = False

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        window = current_or_next_window(
            self.coordinator.data.zone_validity,
            dt_util.utcnow(),
        )
        self._attr_native_value = window.end if window else None


class NextChargeableStartSensor(CityVisitorParkingEntity):
    """Sensor for the start of the current or next chargeable window."""

    _entity_key = "next_chargeable_start"
    _attr_translation_key: str | None = "next_chargeable_start"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        now = dt_util.utcnow()
        window = current_or_next_window_with_overrides(
            self.coordinator.data.zone_validity,
            self._entry.options,
            now,
        )
        self._attr_native_value = window.start if window else None


class NextChargeableEndSensor(CityVisitorParkingEntity):
    """Sensor for the end of the current or next chargeable window."""

    _entity_key = "next_chargeable_end"
    _attr_translation_key: str | None = "next_chargeable_end"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        now = dt_util.utcnow()
        window = current_or_next_window_with_overrides(
            self.coordinator.data.zone_validity,
            self._entry.options,
            now,
        )
        self._attr_native_value = window.end if window else None


class FavoritesSensor(CityVisitorParkingEntity):
    """Sensor for favorites count."""

    _entity_key = "favorites"
    _attr_translation_key: str | None = "favorites"

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        self._attr_native_value = len(self.coordinator.data.favorites)


def _remaining_balance_minutes(data: CoordinatorData) -> int:
    """Return the remaining balance in minutes."""
    return max(0, data.permit_remaining_minutes)


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
