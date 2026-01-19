"""Runtime data definitions for the City visitor parking integration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from pycityvisitorparking import Client
    from pycityvisitorparking.provider.base import BaseProvider

    from .coordinator import CityVisitorParkingCoordinator
    from .models import AutoEndState, OperatingTimeOverrides, ProviderConfig

    type CityVisitorParkingConfigEntry = ConfigEntry["CityVisitorParkingRuntimeData"]
else:

    class BaseProvider:  # pragma: no cover - runtime typing fallback
        """Fallback provider type when typing is unavailable."""

        pass

    CityVisitorParkingConfigEntry = object


@dataclass
class CityVisitorParkingRuntimeData:
    """Runtime data stored on the config entry."""

    client: Client
    provider: BaseProvider
    provider_config: ProviderConfig
    coordinator: CityVisitorParkingCoordinator
    permit_id: str
    auto_end_state: AutoEndState
    operating_time_overrides: OperatingTimeOverrides
