"""City visitor parking integration."""

from __future__ import annotations

import inspect
import time
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import (
    ConfigEntryAuthFailed,
    ConfigEntryError,
    ConfigEntryNotReady,
)
from homeassistant.helpers.typing import ConfigType
from pycityvisitorparking import AuthError, NetworkError
from pycityvisitorparking.exceptions import PyCityVisitorParkingError

from .client import async_create_client
from .const import (
    CONF_API_URL,
    CONF_BASE_URL,
    CONF_MUNICIPALITY,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
    PLATFORMS,
)
from .const import (
    LOGGER as _LOGGER,
)
from .coordinator import CityVisitorParkingCoordinator
from .models import AutoEndState, CityVisitorParkingRuntimeData, ProviderConfig
from .services import async_setup_services
from .websocket_api import async_setup_websocket


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the City visitor parking integration."""

    await _async_register_frontend(hass)
    _LOGGER.debug("Setting up services and websocket API")
    await async_setup_services(hass)
    await async_setup_websocket(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up City visitor parking from a config entry."""

    await _async_register_frontend(hass)
    _LOGGER.debug(
        "Initializing config entry %s for provider=%s permit=%s",
        entry.entry_id,
        entry.data.get(CONF_PROVIDER_ID),
        entry.data.get(CONF_PERMIT_ID),
    )

    provider_config = ProviderConfig(
        provider_id=entry.data[CONF_PROVIDER_ID],
        municipality_name=entry.data[CONF_MUNICIPALITY],
        base_url=entry.data.get(CONF_BASE_URL),
        api_url=entry.data.get(CONF_API_URL),
    )
    client = await async_create_client(hass, provider_config)
    provider = await client.get_provider(
        provider_config.provider_id,
        base_url=provider_config.base_url,
        api_uri=provider_config.api_url,
    )
    _install_zone_validity_logging(provider)

    login_started = time.perf_counter()
    try:
        await provider.login(
            username=entry.data[CONF_USERNAME],
            password=entry.data[CONF_PASSWORD],
        )
    except AuthError as err:
        raise ConfigEntryAuthFailed from err
    except NetworkError as err:
        raise ConfigEntryNotReady from err
    except PyCityVisitorParkingError as err:
        raise ConfigEntryError from err
    finally:
        _LOGGER.debug(
            "Provider login duration for %s: %.3fs",
            entry.entry_id,
            time.perf_counter() - login_started,
        )

    auto_end_state = AutoEndState()
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id=entry.data[CONF_PERMIT_ID],
        auto_end_state=auto_end_state,
    )
    refresh_started = time.perf_counter()
    await coordinator.async_config_entry_first_refresh()
    _LOGGER.debug(
        "Initial coordinator refresh duration for %s: %.3fs",
        entry.entry_id,
        time.perf_counter() - refresh_started,
    )

    entry.runtime_data = CityVisitorParkingRuntimeData(
        client=client,
        provider=provider,
        provider_config=provider_config,
        coordinator=coordinator,
        permit_id=entry.data[CONF_PERMIT_ID],
        auto_end_state=auto_end_state,
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


def _install_zone_validity_logging(provider: object) -> None:
    """Add extra debug logging when zone validity falls back to the zone block."""

    map_zone_validity = getattr(provider, "_map_zone_validity", None)
    provider_id = getattr(provider, "provider_id", "unknown")
    if not callable(map_zone_validity):
        return

    def _summarize_raw(raw: object) -> str:
        if raw is None:
            return "raw=None"
        if isinstance(raw, list):
            return f"raw=list(count={len(raw)})"
        return f"raw={type(raw).__name__}"

    accepts_fallback = (
        "fallback_zone" in inspect.signature(map_zone_validity).parameters
    )

    def _wrap(raw: object, *, fallback_zone: object | None = None) -> object:
        if isinstance(fallback_zone, dict):
            start_raw = fallback_zone.get("start_time")
            end_raw = fallback_zone.get("end_time")
            has_candidates = False
            if isinstance(raw, list):
                has_candidates = any(
                    isinstance(item, dict)
                    and item.get("start_time")
                    and item.get("end_time")
                    for item in raw
                )
            if not has_candidates and start_raw and end_raw:
                _LOGGER.debug(
                    "Provider %s zone validity fallback details %s "
                    "fallback_start=%s fallback_end=%s",
                    provider_id,
                    _summarize_raw(raw),
                    start_raw,
                    end_raw,
                )
        if accepts_fallback:
            return map_zone_validity(raw, fallback_zone=fallback_zone)
        return map_zone_validity(raw)

    provider._map_zone_validity = _wrap


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a City visitor parking config entry."""

    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_register_frontend(hass: HomeAssistant) -> None:
    """Register the frontend assets once."""

    data = hass.data.setdefault(DOMAIN, {})
    if data.get("frontend_registered"):
        return

    if hass.http is None or "frontend" not in hass.config.components:
        _LOGGER.debug("Frontend is not available, skipping static assets")
        return

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path="/city_visitor_parking",
                path=str(Path(__file__).parent / "frontend" / "dist"),
                cache_headers=False,
            )
        ]
    )
    add_extra_js_url(
        hass,
        "/city_visitor_parking/city-visitor-parking-card.js",
    )
    add_extra_js_url(
        hass,
        "/city_visitor_parking/city-visitor-parking-active-card.js",
    )
    data["frontend_registered"] = True
