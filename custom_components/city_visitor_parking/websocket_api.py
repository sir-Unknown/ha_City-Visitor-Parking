"""WebSocket API for City visitor parking."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING, Final, cast

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.components import websocket_api
from homeassistant.const import ATTR_CONFIG_ENTRY_ID
from homeassistant.util import dt as dt_util
from pycityvisitorparking.exceptions import PyCityVisitorParkingError

from .const import DOMAIN
from .payloads import build_status_payload, normalize_favorites

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from pycityvisitorparking import Favorite as ProviderFavorite
    from pycityvisitorparking.provider.base import BaseProvider

    from .models import CoordinatorData
    from .runtime_data import (
        CityVisitorParkingConfigEntry,
        CityVisitorParkingRuntimeData,
    )
else:
    BaseProvider = object

WEBSOCKET_LIST_FAVORITES: Final[str] = "city_visitor_parking/favorites"
WEBSOCKET_GET_STATUS: Final[str] = "city_visitor_parking/status"

_LOGGER = logging.getLogger(__name__)


async def async_setup_websocket(hass: HomeAssistant) -> None:
    """Set up WebSocket commands."""
    websocket_api.async_register_command(hass, _ws_list_favorites)
    websocket_api.async_register_command(hass, _ws_get_status)


def _get_loaded_entry(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, object],
) -> CityVisitorParkingConfigEntry | None:
    """Return a loaded config entry or send an error and return None."""
    entry_id = cast("str", msg[ATTR_CONFIG_ENTRY_ID])
    msg_id = cast("int", msg["id"])
    entry = hass.config_entries.async_get_entry(entry_id)
    if (
        entry is None
        or entry.domain != DOMAIN
        or entry.state is not config_entries.ConfigEntryState.LOADED
    ):
        connection.send_error(msg_id, "invalid_target", "Invalid target")
        return None
    return cast("CityVisitorParkingConfigEntry", entry)


@websocket_api.websocket_command(
    {
        vol.Required("type"): WEBSOCKET_LIST_FAVORITES,
        vol.Required(ATTR_CONFIG_ENTRY_ID): str,
    }
)
@websocket_api.async_response
async def _ws_list_favorites(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, object],
) -> None:
    """Return favorites for a single config entry."""
    request_started = time.perf_counter()
    msg_id = cast("int", msg["id"])
    entry = _get_loaded_entry(hass, connection, msg)
    if entry is None:
        return

    runtime: CityVisitorParkingRuntimeData = entry.runtime_data
    provider: BaseProvider = runtime.provider
    try:
        favorites: list[ProviderFavorite] = await provider.list_favorites()
    except PyCityVisitorParkingError:
        _LOGGER.debug(
            "Favorites websocket fetch failed for %s (permit %s)",
            entry.title,
            runtime.permit_id,
            exc_info=True,
        )
        connection.send_error(msg_id, "favorites_failed", "Could not fetch favorites")
        return

    connection.send_result(msg_id, {"favorites": normalize_favorites(favorites)})
    _LOGGER.debug(
        "Favorites websocket response for %s (permit %s): %s favorites "
        "(duration=%.3fs)",
        entry.title,
        runtime.permit_id,
        len(favorites or []),
        time.perf_counter() - request_started,
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): WEBSOCKET_GET_STATUS,
        vol.Required(ATTR_CONFIG_ENTRY_ID): str,
    }
)
@websocket_api.async_response
async def _ws_get_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, object],
) -> None:
    """Return status and window details for a single config entry."""
    request_started = time.perf_counter()
    msg_id = cast("int", msg["id"])
    entry = _get_loaded_entry(hass, connection, msg)
    if entry is None:
        return

    runtime: CityVisitorParkingRuntimeData = entry.runtime_data
    try:
        data = cast("CoordinatorData | None", runtime.coordinator.data)
        if data is None:
            connection.send_error(msg_id, "status_failed", "No data available")
            return
        stale = not runtime.coordinator.last_update_success
        now = dt_util.utcnow()
        payload = build_status_payload(data, entry.options, now, stale=stale)
    except Exception:  # Websocket boundary needs a consistent error response.
        _LOGGER.debug(
            "Status websocket fetch failed for %s (permit %s)",
            entry.title,
            runtime.permit_id,
            exc_info=True,
        )
        connection.send_error(msg_id, "status_failed", "Could not fetch status")
        return

    connection.send_result(
        msg_id,
        payload,
    )
    _LOGGER.debug(
        "Status websocket response for %s (permit %s): state=%s window_kind=%s "
        "(duration=%.3fs)",
        entry.title,
        runtime.permit_id,
        payload["state"],
        payload["window_kind"],
        time.perf_counter() - request_started,
    )
