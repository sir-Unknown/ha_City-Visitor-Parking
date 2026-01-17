"""Diagnostics support for City visitor parking."""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Final, Protocol, cast

from homeassistant.components import diagnostics as diagnostics_util
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant

from .const import CONF_AUTO_END, CONF_OPERATING_TIME_OVERRIDES
from .runtime_data import CityVisitorParkingConfigEntry

TO_REDACT: Final[list[str]] = [CONF_PASSWORD, CONF_USERNAME]


class _DiagnosticsModule(Protocol):
    """Protocol for diagnostics helpers."""

    def async_redact_data(
        self, data: Mapping[str, object], to_redact: Iterable[str]
    ) -> dict[str, object]:
        """Redact sensitive data."""
        ...


_async_redact_data = cast(_DiagnosticsModule, diagnostics_util).async_redact_data


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: CityVisitorParkingConfigEntry
) -> dict[str, object]:
    """Return diagnostics for a config entry."""

    coordinator = entry.runtime_data.coordinator
    data = coordinator.data

    last_update_success_time = getattr(coordinator, "last_update_success_time", None)

    return {
        "entry_data": _async_redact_data(dict(entry.data), TO_REDACT),
        "options": _async_redact_data(dict(entry.options), TO_REDACT),
        "runtime": {
            "permit_id": entry.runtime_data.permit_id,
            "update_interval": coordinator.update_interval.total_seconds()
            if coordinator.update_interval
            else None,
            "last_update_success": coordinator.last_update_success,
            "last_update_success_time": last_update_success_time.isoformat()
            if last_update_success_time
            else None,
            "active_reservations": len(data.active_reservations),
            "favorites": len(data.favorites),
            "zone_validity_blocks": len(data.zone_validity),
            "zone_is_chargeable_now": data.zone_availability.is_chargeable_now,
        },
        "options_summary": {
            CONF_AUTO_END: entry.options.get(CONF_AUTO_END, False),
            CONF_OPERATING_TIME_OVERRIDES: entry.options.get(
                CONF_OPERATING_TIME_OVERRIDES, {}
            ),
        },
    }
