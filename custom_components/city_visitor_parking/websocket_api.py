"""WebSocket API for City visitor parking."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterable
from datetime import datetime
from typing import TYPE_CHECKING, Final, cast

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.components import websocket_api
from homeassistant.const import ATTR_CONFIG_ENTRY_ID
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from pycityvisitorparking.exceptions import PyCityVisitorParkingError

if TYPE_CHECKING:
    from pycityvisitorparking import Favorite as ProviderFavorite
else:
    ProviderFavorite = object

from .const import DOMAIN, STATE_CHARGEABLE, STATE_FREE
from .helpers import get_attr
from .models import CityVisitorParkingRuntimeData
from .time_windows import current_or_next_window_with_overrides

WEBSOCKET_LIST_FAVORITES: Final[str] = "city_visitor_parking/favorites"
WEBSOCKET_GET_STATUS: Final[str] = "city_visitor_parking/status"

_LOGGER = logging.getLogger(__name__)


async def async_setup_websocket(hass: HomeAssistant) -> None:
    """Set up WebSocket commands."""

    websocket_api.async_register_command(hass, _ws_list_favorites)
    websocket_api.async_register_command(hass, _ws_get_status)


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
    entry_id = cast(str, msg[ATTR_CONFIG_ENTRY_ID])
    msg_id = cast(int, msg["id"])
    entry = hass.config_entries.async_get_entry(entry_id)
    if (
        entry is None
        or entry.domain != DOMAIN
        or entry.state is not config_entries.ConfigEntryState.LOADED
    ):
        connection.send_error(msg_id, "invalid_target", "Invalid target")
        return

    runtime: CityVisitorParkingRuntimeData = entry.runtime_data
    try:
        favorites = await runtime.provider.list_favorites()
    except PyCityVisitorParkingError:
        connection.send_error(msg_id, "favorites_failed", "Could not fetch favorites")
        return

    connection.send_result(msg_id, {"favorites": _normalize_favorites(favorites)})
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
    entry_id = cast(str, msg[ATTR_CONFIG_ENTRY_ID])
    msg_id = cast(int, msg["id"])
    entry = hass.config_entries.async_get_entry(entry_id)
    if (
        entry is None
        or entry.domain != DOMAIN
        or entry.state is not config_entries.ConfigEntryState.LOADED
    ):
        connection.send_error(msg_id, "invalid_target", "Invalid target")
        return

    runtime: CityVisitorParkingRuntimeData = entry.runtime_data
    state: str | None = None
    window_kind: str | None = None
    window_start: str | None = None
    window_end: str | None = None
    try:
        data = runtime.coordinator.data
        now = dt_util.utcnow()
        state = (
            STATE_CHARGEABLE if data.zone_availability.is_chargeable_now else STATE_FREE
        )
        window = current_or_next_window_with_overrides(
            data.zone_validity,
            entry.options,
            now,
        )
        if window:
            is_current = window.start <= now < window.end
            is_next = window.start > now
            if state == STATE_CHARGEABLE and is_current:
                window_kind = "current"
            elif state == STATE_FREE and is_next:
                window_kind = "next"
            if window_kind:
                window_start = _as_utc_iso(window.start)
                window_end = _as_utc_iso(window.end)
    except Exception:  # Websocket boundary needs a consistent error response.
        connection.send_error(msg_id, "status_failed", "Could not fetch status")
        return

    connection.send_result(
        msg_id,
        {
            "state": state,
            "window_kind": window_kind,
            "window_start": window_start,
            "window_end": window_end,
        },
    )
    _LOGGER.debug(
        "Status websocket response for %s (permit %s): state=%s window_kind=%s "
        "(duration=%.3fs)",
        entry.title,
        runtime.permit_id,
        state,
        window_kind,
        time.perf_counter() - request_started,
    )


def _normalize_favorites(
    favorites: Iterable[ProviderFavorite],
) -> list[dict[str, str]]:
    """Normalize favorites to a JSON-serializable structure."""

    normalized: list[dict[str, str]] = []
    for favorite in favorites or []:
        favorite_id = get_attr(favorite, "id")
        license_plate = get_attr(favorite, "license_plate")
        name = get_attr(favorite, "name")
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


def _as_utc_iso(value: datetime | None) -> str | None:
    """Return a UTC ISO8601 timestamp string."""

    if value is None:
        return None
    return dt_util.as_utc(value).isoformat()
