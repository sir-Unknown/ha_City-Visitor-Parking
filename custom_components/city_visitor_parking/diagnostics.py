"""Diagnostics support for City visitor parking."""

from __future__ import annotations

from typing import TYPE_CHECKING, Final, Protocol, cast

from homeassistant.components import diagnostics as diagnostics_util
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME

from .const import CONF_AUTO_END, CONF_OPERATING_TIME_OVERRIDES

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from homeassistant.core import HomeAssistant

    from .runtime_data import CityVisitorParkingConfigEntry

TO_REDACT: Final[list[str]] = [CONF_PASSWORD, CONF_USERNAME]


class _DiagnosticsModule(Protocol):
    """Protocol for diagnostics helpers."""

    def async_redact_data(
        self, data: Mapping[str, object], to_redact: Iterable[str]
    ) -> dict[str, object]:
        """Redact sensitive data."""
        raise NotImplementedError


_async_redact_data = cast("_DiagnosticsModule", diagnostics_util).async_redact_data


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
            "paid_hours_blocks": len(data.paid_hours),
            "is_paid_now": data.paid_parking_status.is_paid_now,
            # Parking area ids and names are public area names, not personal data.
            "parking_areas": [
                {
                    "parking_area_id": parking_area.parking_area_id,
                    "name": parking_area.name,
                    "paid_hours_blocks": len(parking_area.paid_hours),
                    "is_paid_now": parking_area.paid_parking_status.is_paid_now,
                }
                for parking_area in data.parking_areas
            ],
            "reservation_parking_area_ids": [
                reservation.parking_area_id for reservation in data.active_reservations
            ],
        },
        "options_summary": {
            CONF_AUTO_END: entry.options.get(CONF_AUTO_END, False),
            CONF_OPERATING_TIME_OVERRIDES: entry.options.get(
                CONF_OPERATING_TIME_OVERRIDES, {}
            ),
        },
    }
