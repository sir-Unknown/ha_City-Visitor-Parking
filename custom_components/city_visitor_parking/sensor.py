"""Sensor platform for City visitor parking."""

from __future__ import annotations

from datetime import datetime

from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import STATE_CHARGEABLE, STATE_FREE
from .coordinator import CityVisitorParkingCoordinator
from .entity import CityVisitorParkingEntity
from .models import CityVisitorParkingConfigEntry, CoordinatorData, TimeRange
from .time_windows import (
    current_or_next_window,
    current_or_next_window_with_overrides,
    windows_for_today,
)


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

    _attr_translation_key: str | None = "active_reservations"

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "active_reservations")
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""

        self._attr_native_value = len(self.coordinator.data.active_reservations)

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


class FutureReservationsSensor(CityVisitorParkingEntity):
    """Sensor for future reservations count."""

    _attr_translation_key: str | None = "future_reservations"

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "future_reservations")
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""

        now = dt_util.utcnow()
        self._attr_native_value = sum(
            1
            for reservation in self.coordinator.data.reservations
            if reservation.start_time > now
        )

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


class RemainingTimeSensor(CityVisitorParkingEntity):
    """Sensor for remaining balance time."""

    _attr_translation_key: str | None = "remaining_time"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement: str | None = UnitOfTime.HOURS
    _attr_suggested_display_precision: int | None = 2

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "remaining_time")
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""

        remaining_minutes = _remaining_balance_minutes(self.coordinator.data)
        next_end_time = _next_end_time(self.coordinator.data)
        active_count = len(self.coordinator.data.active_reservations)
        attributes = dict(self._attr_extra_state_attributes or {})
        attributes.update(
            {
                "remaining_minutes": remaining_minutes,
                "active_reservations": active_count,
                "next_end_time": _as_utc_iso(next_end_time) if next_end_time else None,
                "has_active_reservation": active_count > 0,
            }
        )
        self._attr_native_value = round(remaining_minutes / 60, 2)
        self._attr_extra_state_attributes = attributes

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


class PermitZoneAvailabilitySensor(CityVisitorParkingEntity):
    """Sensor for permit zone availability."""

    _attr_translation_key: str | None = "permit_zone_availability"

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "permit_zone_availability")
        self._update_from_coordinator()

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

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


class ProviderChargeableStartSensor(CityVisitorParkingEntity):
    """Sensor for the start of the current or next provider chargeable window."""

    _attr_translation_key: str | None = "provider_chargeable_start"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP
    _attr_entity_category: EntityCategory | None = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default: bool = False

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "provider_chargeable_start")
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""

        window = current_or_next_window(
            self.coordinator.data.zone_validity,
            dt_util.utcnow(),
        )
        self._attr_native_value = window.start if window else None

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


class ProviderChargeableEndSensor(CityVisitorParkingEntity):
    """Sensor for the end of the current or next provider chargeable window."""

    _attr_translation_key: str | None = "provider_chargeable_end"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP
    _attr_entity_category: EntityCategory | None = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default: bool = False

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "provider_chargeable_end")
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""

        window = current_or_next_window(
            self.coordinator.data.zone_validity,
            dt_util.utcnow(),
        )
        self._attr_native_value = window.end if window else None

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


class NextChargeableStartSensor(CityVisitorParkingEntity):
    """Sensor for the start of the current or next chargeable window."""

    _attr_translation_key: str | None = "next_chargeable_start"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "next_chargeable_start")
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""

        now = dt_util.utcnow()
        window = current_or_next_window_with_overrides(
            self.coordinator.data.zone_validity,
            self._entry.options,
            now,
        )
        self._attr_native_value = window.start if window else None

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


class NextChargeableEndSensor(CityVisitorParkingEntity):
    """Sensor for the end of the current or next chargeable window."""

    _attr_translation_key: str | None = "next_chargeable_end"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "next_chargeable_end")
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""

        now = dt_util.utcnow()
        window = current_or_next_window_with_overrides(
            self.coordinator.data.zone_validity,
            self._entry.options,
            now,
        )
        self._attr_native_value = window.end if window else None

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


class FavoritesSensor(CityVisitorParkingEntity):
    """Sensor for favorites count."""

    _attr_translation_key: str | None = "favorites"

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "favorites")
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""

        self._attr_native_value = len(self.coordinator.data.favorites)

    def _handle_coordinator_update(self) -> None:
        """Update the sensor from coordinator data."""

        self._update_from_coordinator()
        super()._handle_coordinator_update()


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
