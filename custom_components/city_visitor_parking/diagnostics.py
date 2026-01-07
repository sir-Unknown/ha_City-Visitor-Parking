"""Diagnostics support for City visitor parking."""

from __future__ import annotations

from typing import Any

from homeassistant.components.diagnostics import async_redact_data
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant

from .const import CONF_AUTO_END, CONF_OPERATING_TIME_OVERRIDES
from .models import CityVisitorParkingConfigEntry

TO_REDACT = [CONF_PASSWORD, CONF_USERNAME]


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant, entry: CityVisitorParkingConfigEntry
) -> dict[str, Any]:
    """Return diagnostics for a config entry."""

    coordinator = entry.runtime_data.coordinator
    data = coordinator.data

    return {
        "entry_data": async_redact_data(dict(entry.data), TO_REDACT),
        "options": async_redact_data(dict(entry.options), TO_REDACT),
        "runtime": {
            "permit_id": entry.runtime_data.permit_id,
            "update_interval": coordinator.update_interval.total_seconds()
            if coordinator.update_interval
            else None,
            "last_update_success": coordinator.last_update_success,
            "last_update_success_time": coordinator.last_update_success_time.isoformat()
            if coordinator.last_update_success_time
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
