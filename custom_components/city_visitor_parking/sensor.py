"""Sensor platform for City visitor parking."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.components.sensor import SensorDeviceClass, SensorStateClass
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import callback
from homeassistant.util import dt as dt_util

from .const import STATE_FREE, STATE_PAID
from .entity import CityVisitorParkingEntity
from .payloads import reservation_parking_area_payload, utc_iso
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
    from .models import CoordinatorData, PaidParkingStatus, ParkingArea, TimeRange
    from .runtime_data import CityVisitorParkingConfigEntry

PARALLEL_UPDATES = 0
# Single parking area permits are fully covered by the permit-level sensors.
MIN_PARKING_AREAS_FOR_PARKING_AREA_SENSORS = 2


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
            PaidParkingSensor(coordinator, entry),
            ProviderPaidParkingStartSensor(coordinator, entry),
            ProviderPaidParkingEndSensor(coordinator, entry),
            PaidParkingStartSensor(coordinator, entry),
            PaidParkingEndSensor(coordinator, entry),
            FavoritesSensor(coordinator, entry),
        ]
    )

    known_parking_area_ids: set[str] = set()

    @callback
    def _async_add_parking_area_sensors() -> None:
        """Add per-parking-area sensors for parking areas that have no entities yet.

        Parking areas are only known from coordinator data and may change between
        refreshes, so this also runs on every coordinator update. ParkingAreas that
        disappear keep their entities, which then report unavailable.
        """
        data = coordinator.data
        if len(data.parking_areas) < MIN_PARKING_AREAS_FOR_PARKING_AREA_SENSORS:
            return
        new_parking_areas = [
            parking_area
            for parking_area in data.parking_areas
            if parking_area.parking_area_id not in known_parking_area_ids
        ]
        if not new_parking_areas:
            return
        known_parking_area_ids.update(
            parking_area.parking_area_id for parking_area in new_parking_areas
        )
        async_add_entities(
            [
                sensor_cls(coordinator, entry, parking_area)
                for parking_area in new_parking_areas
                for sensor_cls in PARKING_AREA_SENSOR_CLASSES
            ]
        )

    _async_add_parking_area_sensors()
    entry.async_on_unload(
        coordinator.async_add_listener(_async_add_parking_area_sensors)
    )


class ActiveReservationsSensor(CityVisitorParkingEntity):
    """Sensor for active reservations count."""

    _entity_key = "active_reservations"
    _attr_translation_key: str | None = "active_reservations"
    _attr_state_class: SensorStateClass | None = SensorStateClass.MEASUREMENT

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        data = self.coordinator.data
        self._attr_native_value = len(data.active_reservations)
        now = dt_util.utcnow()
        # License plates stay out of entity attributes (privacy); the parking area and
        # its paid window per reservation let automations act on the right parking area.
        self._attr_extra_state_attributes = {
            "reservations": [
                {
                    "reservation_id": reservation.reservation_id,
                    "start_time": utc_iso(reservation.start_time),
                    "end_time": utc_iso(reservation.end_time),
                    **reservation_parking_area_payload(
                        reservation, data.parking_areas, self._entry.options, now
                    ),
                }
                for reservation in data.active_reservations
            ]
        }


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


class _PaidParkingWindowSensor(CityVisitorParkingEntity):
    """Base for sensors derived from one set of paid windows.

    Permit-level sensors read the default parking area from the coordinator data; per-
    parking area subclasses override ``_parking_area_source`` to read their own parking
    area.
    """

    def _parking_area_source(
        self,
    ) -> tuple[tuple[TimeRange, ...], PaidParkingStatus] | None:
        """Return the parking area validity and availability, or None when unknown."""
        data = self.coordinator.data
        return data.paid_hours, data.paid_parking_status


class PaidParkingSensor(_PaidParkingWindowSensor):
    """Sensor for whether paid parking is active for the permit."""

    _entity_key = "paid_parking"
    _attr_translation_key: str | None = "paid_parking"

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._parking_area_source()
        if source is None:
            return
        paid_hours, availability = source
        now = dt_util.utcnow()
        provider_windows = windows_for_today(paid_hours, {}, now)
        next_window = current_or_next_window_with_overrides(
            paid_hours,
            self._entry.options,
            now,
        )
        provider_next_window = current_or_next_window(paid_hours, now)
        attributes: dict[str, object] = dict(self._attr_extra_state_attributes or {})  # type: ignore[has-type]
        attributes.update(
            {
                "is_paid_now": availability.is_paid_now,
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
        self._attr_native_value = STATE_PAID if availability.is_paid_now else STATE_FREE
        self._attr_extra_state_attributes = attributes


class ProviderPaidParkingStartSensor(_PaidParkingWindowSensor):
    """Sensor for the start of the current or next provider paid window."""

    _entity_key = "provider_paid_parking_start"
    _attr_translation_key: str | None = "provider_paid_parking_start"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP
    _attr_entity_category: EntityCategory | None = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default: bool = False

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._parking_area_source()
        if source is None:
            return
        window = current_or_next_window(source[0], dt_util.utcnow())
        self._attr_native_value = window.start if window else None


class ProviderPaidParkingEndSensor(_PaidParkingWindowSensor):
    """Sensor for the end of the current or next provider paid window."""

    _entity_key = "provider_paid_parking_end"
    _attr_translation_key: str | None = "provider_paid_parking_end"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP
    _attr_entity_category: EntityCategory | None = EntityCategory.DIAGNOSTIC
    _attr_entity_registry_enabled_default: bool = False

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._parking_area_source()
        if source is None:
            return
        window = current_or_next_window(source[0], dt_util.utcnow())
        self._attr_native_value = window.end if window else None


class PaidParkingStartSensor(_PaidParkingWindowSensor):
    """Sensor for the start of the current or next paid window."""

    _entity_key = "paid_parking_start"
    _attr_translation_key: str | None = "paid_parking_start"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._parking_area_source()
        if source is None:
            return
        window = current_or_next_window_with_overrides(
            source[0],
            self._entry.options,
            dt_util.utcnow(),
        )
        self._attr_native_value = window.start if window else None


class PaidParkingEndSensor(_PaidParkingWindowSensor):
    """Sensor for the end of the current or next paid window."""

    _entity_key = "paid_parking_end"
    _attr_translation_key: str | None = "paid_parking_end"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.TIMESTAMP

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        source = self._parking_area_source()
        if source is None:
            return
        window = current_or_next_window_with_overrides(
            source[0],
            self._entry.options,
            dt_util.utcnow(),
        )
        self._attr_native_value = window.end if window else None


class _ParkingAreaSensor(_PaidParkingWindowSensor):
    """Base for sensors of one selectable parking area of a multi-parking-area permit.

    The unique ID combines the entry unique ID, the parking area ID and a fixed
    suffix. The entity is unavailable while its parking area is missing from the
    coordinator data.
    """

    _parking_area_entity_suffix: str

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
        parking_area: ParkingArea,
    ) -> None:
        """Initialize the parking area sensor."""
        self._parking_area_id = parking_area.parking_area_id
        self._attr_translation_placeholders = {"parking_area": parking_area.name}
        super().__init__(
            coordinator,
            entry,
            f"parking_area:{parking_area.parking_area_id}:{self._parking_area_entity_suffix}",
        )

    @property
    def available(self) -> bool:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return if the coordinator is healthy and the parking area still exists."""
        return super().available and self._parking_area() is not None

    def _parking_area(self) -> ParkingArea | None:
        """Return this sensor's parking area from the coordinator data."""
        return self.coordinator.data.parking_area(self._parking_area_id)

    def _parking_area_source(
        self,
    ) -> tuple[tuple[TimeRange, ...], PaidParkingStatus] | None:
        """Return the parking area's validity and availability, or None when gone."""
        parking_area = self._parking_area()
        if parking_area is None:
            return None
        return parking_area.paid_hours, parking_area.paid_parking_status


class ParkingAreaPaidParkingSensor(_ParkingAreaSensor, PaidParkingSensor):
    """Sensor for whether paid parking is active in one parking area."""

    _parking_area_entity_suffix = "paid_parking"
    _attr_translation_key: str | None = "parking_area_paid_parking"


class ParkingAreaProviderPaidParkingStartSensor(
    _ParkingAreaSensor, ProviderPaidParkingStartSensor
):
    """Sensor for the start of a parking area's current or next provider window."""

    _parking_area_entity_suffix = "provider_paid_parking_start"
    _attr_translation_key: str | None = "parking_area_provider_paid_parking_start"


class ParkingAreaProviderPaidParkingEndSensor(
    _ParkingAreaSensor, ProviderPaidParkingEndSensor
):
    """Sensor for the end of a parking area's current or next provider window."""

    _parking_area_entity_suffix = "provider_paid_parking_end"
    _attr_translation_key: str | None = "parking_area_provider_paid_parking_end"


class ParkingAreaPaidParkingStartSensor(_ParkingAreaSensor, PaidParkingStartSensor):
    """Sensor for the start of a parking area's current or next paid window."""

    _parking_area_entity_suffix = "paid_parking_start"
    _attr_translation_key: str | None = "parking_area_paid_parking_start"


class ParkingAreaPaidParkingEndSensor(_ParkingAreaSensor, PaidParkingEndSensor):
    """Sensor for the end of a parking area's current or next paid window."""

    _parking_area_entity_suffix = "paid_parking_end"
    _attr_translation_key: str | None = "parking_area_paid_parking_end"


PARKING_AREA_SENSOR_CLASSES: tuple[type[_ParkingAreaSensor], ...] = (
    ParkingAreaPaidParkingSensor,
    ParkingAreaProviderPaidParkingStartSensor,
    ParkingAreaProviderPaidParkingEndSensor,
    ParkingAreaPaidParkingStartSensor,
    ParkingAreaPaidParkingEndSensor,
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
