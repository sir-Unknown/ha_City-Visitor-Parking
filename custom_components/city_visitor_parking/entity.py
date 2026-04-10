"""Base entity for City visitor parking."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.components.sensor import SensorEntity
from homeassistant.const import ATTR_ATTRIBUTION
from homeassistant.core import callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import BaseCoordinatorEntity

from .const import CONF_MUNICIPALITY, CONF_PERMIT_ID, DOMAIN
from .coordinator import CityVisitorParkingCoordinator

if TYPE_CHECKING:
    from .runtime_data import CityVisitorParkingConfigEntry


class CityVisitorParkingEntity(
    BaseCoordinatorEntity[CityVisitorParkingCoordinator], SensorEntity
):
    """Base entity for the integration."""

    _attr_has_entity_name: bool = True
    _entity_key: str

    def __init__(
        self,
        coordinator: CityVisitorParkingCoordinator,
        entry: CityVisitorParkingConfigEntry,
        key: str | None = None,
    ) -> None:
        """Initialize the entity."""
        super().__init__(coordinator)
        self._entry: CityVisitorParkingConfigEntry = entry
        if key is not None:
            self._entity_key = key
        municipality = entry.data.get(CONF_MUNICIPALITY)
        permit_id = entry.data.get(CONF_PERMIT_ID)
        device_name = (
            f"{municipality} - {permit_id}"
            if municipality and permit_id
            else entry.title
        )
        self._attr_unique_id = f"{entry.unique_id}:{self._entity_key}"
        configuration_url = None
        runtime_data = getattr(entry, "runtime_data", None)
        if runtime_data is not None:
            configuration_url = runtime_data.provider_config.gui_url
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=device_name,
            manufacturer="City visitor parking",
            model="Visitor parking permit",
            entry_type=DeviceEntryType.SERVICE,
            configuration_url=configuration_url,
        )
        self._attr_extra_state_attributes: dict[str, object] = {
            ATTR_ATTRIBUTION: "Data provided by your municipality",
        }
        self._update_from_coordinator()

    def _update_from_coordinator(self) -> None:
        """Update entity state from coordinator data. Override in subclasses."""

    @callback
    def _handle_coordinator_update(self) -> None:
        """Update entity state and availability."""
        self._update_from_coordinator()
        super()._handle_coordinator_update()

    async def async_update(self) -> None:
        """Update the entity via the coordinator."""
        if not self.enabled:
            return
        await self.coordinator.async_request_refresh()
