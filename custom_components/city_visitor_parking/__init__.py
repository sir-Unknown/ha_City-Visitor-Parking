"""City visitor parking integration."""

from __future__ import annotations

import inspect
import time
from collections.abc import Callable
from pathlib import Path
from typing import Protocol, cast

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import (
    CONF_RESOURCE_TYPE_WS,
    CONF_URL,
    LOVELACE_DATA,
)
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_ID, CONF_PASSWORD, CONF_TYPE, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import (
    ConfigEntryAuthFailed,
    ConfigEntryError,
    ConfigEntryNotReady,
)
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType
from homeassistant.setup import async_when_setup
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

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the City visitor parking integration."""

    async_when_setup(hass, "frontend", _async_register_frontend)
    async_when_setup(hass, "lovelace", _async_register_lovelace_resources)
    _LOGGER.debug("Setting up services and websocket API")
    await async_setup_services(hass)
    await async_setup_websocket(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up City visitor parking from a config entry."""

    _LOGGER.debug(
        "Initializing config entry %s for provider=%s permit=%s",
        entry.title,
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
            "Provider login duration for %s (permit %s): %.3fs",
            entry.title,
            entry.data.get(CONF_PERMIT_ID),
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
        "Initial coordinator refresh duration for %s (permit %s): %.3fs",
        entry.title,
        entry.data.get(CONF_PERMIT_ID),
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


class _ZoneValidityMapper(Protocol):
    """Protocol for providers exposing zone validity mapping."""

    provider_id: str
    _map_zone_validity: Callable[..., object]


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

    cast(_ZoneValidityMapper, provider)._map_zone_validity = _wrap


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a City visitor parking config entry."""

    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_register_frontend(hass: HomeAssistant, _component: str) -> None:
    """Register the frontend assets once."""

    data = hass.data.setdefault(DOMAIN, {})
    if data.get("frontend_registered"):
        return

    if hass.http is None:
        _LOGGER.debug("HTTP is not available, skipping static assets")
        return

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path="/city_visitor_parking",
                path=str(Path(__file__).parent / "frontend" / "dist"),
                cache_headers=False,
            ),
            StaticPathConfig(
                url_path="/city_visitor_parking/translations",
                path=str(Path(__file__).parent / "frontend" / "dist" / "translations"),
                cache_headers=False,
            ),
        ]
    )
    data["frontend_registered"] = True


async def _async_register_lovelace_resources(
    hass: HomeAssistant, _component: str
) -> None:
    """Ensure the Lovelace resources exist for the cards."""

    data = hass.data.setdefault(DOMAIN, {})
    if data.get("lovelace_resources_registered") or hass.config.safe_mode:
        return

    lovelace_data = hass.data.get(LOVELACE_DATA)
    if lovelace_data is None:
        return

    resources = lovelace_data.resources
    if not isinstance(resources, ResourceStorageCollection):
        _LOGGER.debug("Lovelace resources are not storage-based, skipping")
        data["lovelace_resources_registered"] = True
        return

    if not resources.loaded:
        await resources.async_load()
        resources.loaded = True

    dist_path = Path(__file__).parent / "frontend" / "dist"
    desired_files = [
        "city-visitor-parking-card.js",
        "city-visitor-parking-active-card.js",
    ]
    desired_urls: dict[str, str] = {}
    for filename in desired_files:
        base_url = f"/city_visitor_parking/{filename}"
        try:
            version = int((dist_path / filename).stat().st_mtime)
            desired_urls[base_url] = f"{base_url}?v={version}"
        except FileNotFoundError:
            desired_urls[base_url] = base_url

    items = resources.async_items()
    seen: set[str] = set()
    for item in items:
        item_url = item.get(CONF_URL)
        if not isinstance(item_url, str):
            continue
        base_url = item_url.split("?", 1)[0]
        desired_url = desired_urls.get(base_url)
        if not desired_url:
            continue
        seen.add(base_url)
        updates: dict[str, str] = {}
        if item_url != desired_url:
            updates[CONF_URL] = desired_url
        if item.get(CONF_TYPE) != "module":
            updates[CONF_RESOURCE_TYPE_WS] = "module"
        if updates:
            await resources.async_update_item(item[CONF_ID], updates)

    for base_url, url in desired_urls.items():
        if base_url in seen:
            continue
        await resources.async_create_item(
            {CONF_RESOURCE_TYPE_WS: "module", CONF_URL: url}
        )

    data["lovelace_resources_registered"] = True
