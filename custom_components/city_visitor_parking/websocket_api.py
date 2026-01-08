"""WebSocket API for City visitor parking."""

from __future__ import annotations

import time
from collections.abc import Iterable
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.components import websocket_api
from homeassistant.const import ATTR_CONFIG_ENTRY_ID
from homeassistant.core import HomeAssistant
from pycityvisitorparking.exceptions import PyCityVisitorParkingError

from .const import DOMAIN, LOGGER
from .models import CityVisitorParkingRuntimeData

WEBSOCKET_LIST_FAVORITES = "city_visitor_parking/favorites"


async def async_setup_websocket(hass: HomeAssistant) -> None:
    """Set up WebSocket commands."""

    websocket_api.async_register_command(hass, _ws_list_favorites)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WEBSOCKET_LIST_FAVORITES,
        vol.Required(ATTR_CONFIG_ENTRY_ID): str,
    }
)
@websocket_api.async_response
async def _ws_list_favorites(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]
) -> None:
    """Return favorites for a single config entry."""

    request_started = time.perf_counter()
    entry_id = msg[ATTR_CONFIG_ENTRY_ID]
    entry = hass.config_entries.async_get_entry(entry_id)
    if (
        entry is None
        or entry.domain != DOMAIN
        or entry.state is not config_entries.ConfigEntryState.LOADED
    ):
        connection.send_error(msg["id"], "invalid_target", "Invalid target")
        return

    runtime: CityVisitorParkingRuntimeData = entry.runtime_data
    try:
        favorites = await runtime.provider.list_favorites()
    except PyCityVisitorParkingError:
        connection.send_error(
            msg["id"], "favorites_failed", "Could not fetch favorites"
        )
        return

    connection.send_result(msg["id"], {"favorites": _normalize_favorites(favorites)})
    LOGGER.debug(
        "Favorites websocket response for entry %s: %s favorites (duration=%.3fs)",
        entry_id,
        len(favorites or []),
        time.perf_counter() - request_started,
    )


def _normalize_favorites(favorites: Iterable[Any]) -> list[dict[str, str]]:
    """Normalize favorites to a JSON-serializable structure."""

    normalized: list[dict[str, str]] = []
    for favorite in favorites or []:
        favorite_id = _get_attr(favorite, "id")
        license_plate = _get_attr(favorite, "license_plate")
        name = _get_attr(favorite, "name")
        if favorite_id is None and license_plate is None:
            continue

        payload: dict[str, str] = {}
        if favorite_id is not None:
            payload["id"] = str(favorite_id)
        if license_plate is not None:
            payload["license_plate"] = str(license_plate)
        if name is not None:
            payload["name"] = str(name)
        normalized.append(payload)

    return normalized


def _get_attr(obj: Any, name: str) -> Any:
    """Return attribute or mapping value for name."""

    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)
