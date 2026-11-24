"""Sensor platform for City visitor parking."""

from __future__ import annotations

from typing import TYPE_CHECKING, Final

from homeassistant.components.sensor import DOMAIN as SENSOR_DOMAIN
from homeassistant.components.sensor import SensorDeviceClass, SensorStateClass
from homeassistant.const import CURRENCY_EURO, EntityCategory, UnitOfTime
from homeassistant.core import callback
from homeassistant.helpers import entity_registry as er
from homeassistant.util import dt as dt_util

from .const import (
    BALANCE_KIND_MONEY,
    BALANCE_KIND_TIME,
    BALANCE_KIND_TIMES,
    DOMAIN,
    STATE_FREE,
    STATE_PAID,
)
from .entity import CityVisitorParkingEntity
from .payloads import reservation_parking_area_payload, utc_iso
from .time_windows import (
    current_or_next_window,
    current_or_next_window_with_overrides,
    windows_for_today,
)

if TYPE_CHECKING:
    from collections.abc import Mapping
    from datetime import datetime

    from homeassistant.core import HomeAssistant
    from homeassistant.helpers.entity_platform import AddEntitiesCallback

    from .coordinator import CityVisitorParkingCoordinator
    from .models import (
        BalanceKind,
        CoordinatorData,
        PaidParkingStatus,
        ParkingArea,
        TimeRange,
    )
    from .runtime_data import CityVisitorParkingConfigEntry

PARALLEL_UPDATES = 0
# Single parking area permits are fully covered by the permit-level sensors.
MIN_PARKING_AREAS_FOR_PARKING_AREA_SENSORS = 2
# Unique ID suffix of the single remaining balance sensor from before a permit
# could have several balances; see ``_async_migrate_legacy_balance_sensor``.
LEGACY_BALANCE_SENSOR_KEY: Final = "remaining_time"
# Unique ID suffix of the balance sensor of each kind.
BALANCE_SENSOR_KEYS: Final[Mapping[BalanceKind, str]] = {
    BALANCE_KIND_TIME: "remaining_time_balance",
    BALANCE_KIND_MONEY: "remaining_money_balance",
    BALANCE_KIND_TIMES: "remaining_uses",
}


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

    known_balance_kinds: set[BalanceKind] = set()

    @callback
    def _async_add_balance_sensors() -> None:
        """Add a balance sensor for every balance kind that has no entity yet.

        Balances are only known from coordinator data and a provider may report a
        kind later (for example a money balance next to the time balance), so this
        also runs on every coordinator update. A kind that disappears keeps its
        entity, which then reports unavailable.
        """
        balances = coordinator.data.balances
        new_kinds: list[BalanceKind] = [
            balance.kind
            for balance in balances
            if balance.kind not in known_balance_kinds
        ]
        if not new_kinds:
            return
        if not known_balance_kinds:
            # The first balance sensors of this setup: hand the legacy sensor to
            # the primary balance before its new entity is registered.
            _async_migrate_legacy_balance_sensor(hass, entry, balances[0].kind)
        known_balance_kinds.update(new_kinds)
        async_add_entities(
            [BALANCE_SENSOR_CLASSES[kind](coordinator, entry) for kind in new_kinds]
        )

    _async_add_balance_sensors()
    entry.async_on_unload(coordinator.async_add_listener(_async_add_balance_sensors))


@callback
def _async_migrate_legacy_balance_sensor(
    hass: HomeAssistant,
    entry: CityVisitorParkingConfigEntry,
    kind: BalanceKind,
) -> None:
    """Move the legacy remaining balance sensor to the balance sensor of ``kind``.

    Before a permit could have several balances, one sensor showed whatever
    balance the permit had. Which kind that was is only known from provider data,
    so this cannot run in ``async_migrate_entry``; it runs before the first
    balance sensor is added, with the permit's primary balance, which is the one
    the legacy sensor showed. Changing only the unique ID keeps the entity ID,
    history and automations. While the permit reports no balance the legacy
    entity is left untouched, and so is it when the new unique ID is taken.
    """
    registry = er.async_get(hass)
    legacy_entity_id = registry.async_get_entity_id(
        SENSOR_DOMAIN, DOMAIN, f"{entry.unique_id}:{LEGACY_BALANCE_SENSOR_KEY}"
    )
    if legacy_entity_id is None:
        return
    new_unique_id = f"{entry.unique_id}:{BALANCE_SENSOR_KEYS[kind]}"
    if registry.async_get_entity_id(SENSOR_DOMAIN, DOMAIN, new_unique_id):
        return
    registry.async_update_entity(legacy_entity_id, new_unique_id=new_unique_id)


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


class _BalanceSensor(CityVisitorParkingEntity):
    """Base for the remaining balance sensor of one balance kind.

    Created once the permit reports a balance of the kind and unavailable while it
    reports none, so its history stays.
    """

    _balance_kind: BalanceKind

    @property
    def available(self) -> bool:  # pyright: ignore[reportIncompatibleVariableOverride]
        """Return if the coordinator is healthy and the permit has this balance."""
        return (
            super().available
            and self.coordinator.data.balance(self._balance_kind) is not None
        )

    def _update_from_coordinator(self) -> None:
        """Update the sensor from coordinator data."""
        data = self.coordinator.data
        balance = data.balance(self._balance_kind)
        if balance is None:
            return
        next_end_time = _next_end_time(data)
        active_count = len(data.active_reservations)
        attributes: dict[str, object] = dict(self._attr_extra_state_attributes or {})  # type: ignore[has-type]
        attributes.update(
            {
                "active_reservations": active_count,
                "next_end_time": _as_utc_iso(next_end_time) if next_end_time else None,
                "has_active_reservation": active_count > 0,
                # The amount in the balance's own unit: minutes, euros or uses.
                "remaining_balance": balance.amount,
            }
        )
        self._attr_native_value = self._native_balance_value(balance.amount)
        self._attr_extra_state_attributes = attributes

    def _native_balance_value(self, amount: float) -> float:
        """Return the sensor state for a balance amount."""
        return amount


class RemainingTimeBalanceSensor(_BalanceSensor):
    """Sensor for the remaining time balance, in hours."""

    _balance_kind: BalanceKind = BALANCE_KIND_TIME
    _entity_key = BALANCE_SENSOR_KEYS[BALANCE_KIND_TIME]
    _attr_translation_key: str | None = "remaining_time_balance"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement: str | None = UnitOfTime.HOURS
    _attr_suggested_display_precision: int | None = 2
    _attr_state_class: SensorStateClass | None = SensorStateClass.MEASUREMENT

    def _native_balance_value(self, amount: float) -> float:
        """Return the balance minutes as hours."""
        return round(amount / 60, 2)


class RemainingMoneyBalanceSensor(_BalanceSensor):
    """Sensor for the remaining money balance, in euros."""

    _balance_kind: BalanceKind = BALANCE_KIND_MONEY
    _entity_key = BALANCE_SENSOR_KEYS[BALANCE_KIND_MONEY]
    _attr_translation_key: str | None = "remaining_money_balance"
    _attr_device_class: SensorDeviceClass | None = SensorDeviceClass.MONETARY
    _attr_native_unit_of_measurement: str | None = CURRENCY_EURO
    _attr_suggested_display_precision: int | None = 2
    # Home Assistant allows only TOTAL as state class for monetary sensors.
    _attr_state_class: SensorStateClass | None = SensorStateClass.TOTAL


class RemainingUsesSensor(_BalanceSensor):
    """Sensor for the remaining number of uses."""

    _balance_kind: BalanceKind = BALANCE_KIND_TIMES
    _entity_key = BALANCE_SENSOR_KEYS[BALANCE_KIND_TIMES]
    _attr_translation_key: str | None = "remaining_uses"
    _attr_native_unit_of_measurement: str | None = "times"
    _attr_suggested_display_precision: int | None = 0
    _attr_state_class: SensorStateClass | None = SensorStateClass.MEASUREMENT

    def _native_balance_value(self, amount: float) -> float:
        """Return the number of uses, as an integer when it is whole."""
        return _as_count_value(amount)


BALANCE_SENSOR_CLASSES: Final[Mapping[BalanceKind, type[_BalanceSensor]]] = {
    BALANCE_KIND_TIME: RemainingTimeBalanceSensor,
    BALANCE_KIND_MONEY: RemainingMoneyBalanceSensor,
    BALANCE_KIND_TIMES: RemainingUsesSensor,
}


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


def _as_count_value(value: float) -> int | float:
    """Return an integer count when the balance is a whole number."""
    if value.is_integer():
        return int(value)
    return value


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
