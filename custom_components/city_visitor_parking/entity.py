"""Base entity for City visitor parking."""

from __future__ import annotations

from homeassistant.const import ATTR_ATTRIBUTION
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import CityVisitorParkingCoordinator
from .models import CityVisitorParkingConfigEntry


class CityVisitorParkingEntity(CoordinatorEntity[CityVisitorParkingCoordinator]):
    """Base entity for the integration."""

    _attr_has_entity_name = True

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
        key: str,
    ) -> None:
        """Initialize the entity."""

        super().__init__(coordinator)
        self._attr_unique_id = f"{entry.unique_id}:{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="City visitor parking",
            model="Visitor parking permit",
            entry_type=DeviceEntryType.SERVICE,
        )
        self._attr_extra_state_attributes = {
            ATTR_ATTRIBUTION: "Data provided by your municipality",
        }
