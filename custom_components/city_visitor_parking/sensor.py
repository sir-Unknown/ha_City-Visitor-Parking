"""Sensor platform for City visitor parking."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime, timedelta

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity
from homeassistant.const import UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import CONF_OPERATING_TIME_OVERRIDES, STATE_CHARGEABLE, STATE_FREE
from .coordinator import CityVisitorParkingCoordinator, _windows_for_today
from .entity import CityVisitorParkingEntity
from .models import CityVisitorParkingConfigEntry, CoordinatorData, TimeRange


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


class ActiveReservationsSensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for active reservations count."""

    _attr_translation_key = "active_reservations"

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "active_reservations")

    @property
    def native_value(self) -> int:
        """Return the number of active reservations."""

        return len(self.coordinator.data.active_reservations)


class FutureReservationsSensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for future reservations count."""

    _attr_translation_key = "future_reservations"

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "future_reservations")

    @property
    def native_value(self) -> int:
        """Return the number of future reservations."""

        now = dt_util.utcnow()
        return sum(
            1
            for reservation in self.coordinator.data.reservations
            if reservation.start_time > now
        )


class RemainingTimeSensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for remaining balance time."""

    _attr_translation_key = "remaining_time"
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = UnitOfTime.HOURS
    _attr_suggested_display_precision = 2

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "remaining_time")

    @property
    def native_value(self) -> float:
        """Return remaining balance in hours."""

        remaining_minutes = _remaining_balance_minutes(self.coordinator.data)
        return round(remaining_minutes / 60, 2)

    @property
    def extra_state_attributes(self) -> dict[str, object]:
        """Return non-PII attributes for remaining balance."""

        next_end_time = _next_end_time(self.coordinator.data)
        active_count = len(self.coordinator.data.active_reservations)

        return {
            **(self._attr_extra_state_attributes or {}),
            "remaining_minutes": _remaining_balance_minutes(self.coordinator.data),
            "active_reservations": active_count,
            "next_end_time": _as_utc_iso(next_end_time) if next_end_time else None,
            "has_active_reservation": active_count > 0,
        }


class PermitZoneAvailabilitySensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for permit zone availability."""

    _attr_translation_key = "permit_zone_availability"

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "permit_zone_availability")

    @property
    def native_value(self) -> str:
        """Return whether the permit zone is chargeable."""

        return (
            STATE_CHARGEABLE
            if self.coordinator.data.zone_availability.is_chargeable_now
            else STATE_FREE
        )

    @property
    def extra_state_attributes(self) -> dict[str, object]:
        """Return availability attributes."""

        availability = self.coordinator.data.zone_availability
        provider_windows = _windows_for_today(
            self.coordinator.data.zone_validity,
            {},
            dt_util.utcnow(),
        )
        return {
            **(self._attr_extra_state_attributes or {}),
            "is_chargeable_now": availability.is_chargeable_now,
            "next_change_time": _as_utc_iso(availability.next_change_time)
            if availability.next_change_time
            else None,
            "windows_today": [
                _timerange_to_dict(window) for window in availability.windows_today
            ],
            "provider_windows_today": [
                _timerange_to_dict(window) for window in provider_windows
            ],
        }


class ProviderChargeableStartSensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for the start of the current or next provider chargeable window."""

    _attr_translation_key = "provider_chargeable_start"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default = False

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "provider_chargeable_start")

    @property
    def native_value(self) -> datetime | None:
        """Return the start of the current or next provider chargeable window."""

        window = _current_or_next_window(
            self.coordinator.data.zone_validity,
            dt_util.utcnow(),
        )
        return window.start if window else None


class ProviderChargeableEndSensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for the end of the current or next provider chargeable window."""

    _attr_translation_key = "provider_chargeable_end"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default = False

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "provider_chargeable_end")

    @property
    def native_value(self) -> datetime | None:
        """Return the end of the current or next provider chargeable window."""

        window = _current_or_next_window(
            self.coordinator.data.zone_validity,
            dt_util.utcnow(),
        )
        return window.end if window else None


class NextChargeableStartSensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for the start of the current or next chargeable window."""

    _attr_translation_key = "next_chargeable_start"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "next_chargeable_start")

    @property
    def native_value(self) -> datetime | None:
        """Return the start of the current or next chargeable window."""

        now = dt_util.utcnow()
        window = _current_or_next_window_with_overrides(
            self.coordinator.data.zone_validity,
            self._entry.options,
            now,
        )
        return window.start if window else None


class NextChargeableEndSensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for the end of the current or next chargeable window."""

    _attr_translation_key = "next_chargeable_end"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "next_chargeable_end")

    @property
    def native_value(self) -> datetime | None:
        """Return the end of the current or next chargeable window."""

        now = dt_util.utcnow()
        window = _current_or_next_window_with_overrides(
            self.coordinator.data.zone_validity,
            self._entry.options,
            now,
        )
        return window.end if window else None


class FavoritesSensor(CityVisitorParkingEntity, SensorEntity):
    """Sensor for favorites count."""

    _attr_translation_key = "favorites"

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
    ) -> None:
        """Initialize the sensor."""

        super().__init__(coordinator, entry, "favorites")

    @property
    def native_value(self) -> int:
        """Return number of favorites."""

        return len(self.coordinator.data.favorites)


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


def _current_or_next_window(
    windows: list[TimeRange], now: datetime
) -> TimeRange | None:
    """Return the current or next chargeable window."""

    for window in sorted(windows, key=lambda item: item.start):
        if window.end <= now:
            continue
        return window
    return None


def _current_or_next_window_with_overrides(
    zone_validity: list[TimeRange],
    options: Mapping[str, object],
    now: datetime,
) -> TimeRange | None:
    """Return the current or next chargeable window, honoring overrides."""

    overrides = options.get(CONF_OPERATING_TIME_OVERRIDES, {})
    if not isinstance(overrides, Mapping) or not overrides:
        return _current_or_next_window(zone_validity, now)

    windows: list[TimeRange] = []
    # Look ahead one week to apply weekday overrides for upcoming windows.
    for offset in range(7):
        windows.extend(
            _windows_for_today(zone_validity, options, now + timedelta(days=offset))
        )

    if not windows:
        return _current_or_next_window(zone_validity, now)

    return _current_or_next_window(windows, now)
