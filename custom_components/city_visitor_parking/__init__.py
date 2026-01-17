"""City visitor parking integration."""

from __future__ import annotations

import inspect
import logging
import time
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import Final, Protocol, cast

from homeassistant.components.http import StaticPathConfig
from homeassistant.components.lovelace.const import CONF_RESOURCE_TYPE_WS, LOVELACE_DATA
from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.const import (
    CONF_ID,
    CONF_PASSWORD,
    CONF_TYPE,
    CONF_URL,
    CONF_USERNAME,
)
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
    CONF_OPERATING_TIME_OVERRIDES,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
    PLATFORMS,
    WEEKDAY_KEYS,
)
from .coordinator import CityVisitorParkingCoordinator
from .helpers import normalize_override_windows
from .models import AutoEndState, OperatingTimeOverrides, ProviderConfig
from .runtime_data import CityVisitorParkingConfigEntry, CityVisitorParkingRuntimeData
from .services import async_setup_services
from .websocket_api import async_setup_websocket

_LOGGER = logging.getLogger(__name__)


class _ConfigValidation(Protocol):
    """Protocol for config validation helpers we rely on."""

    def config_entry_only_config_schema(
        self, domain: str
    ) -> Callable[[ConfigType], ConfigType]:
        """Return a config schema for config entry only integrations."""
        raise NotImplementedError


class _ResourceStorage(Protocol):
    """Protocol for Lovelace resource storage helpers we rely on."""

    loaded: bool

    async def async_load(self) -> None:
        """Load stored resources."""
        raise NotImplementedError

    def async_items(self) -> list[dict[str, object]]:
        """Return stored resource items."""
        raise NotImplementedError

    async def async_update_item(
        self, item_id: str, updates: dict[str, object]
    ) -> dict[str, object]:
        """Update a stored resource item."""
        raise NotImplementedError

    async def async_create_item(self, data: dict[str, object]) -> dict[str, object]:
        """Create a stored resource item."""
        raise NotImplementedError


_config_entry_only_schema = cast(_ConfigValidation, cv).config_entry_only_config_schema
CONFIG_SCHEMA: Final[Callable[[ConfigType], ConfigType]] = _config_entry_only_schema(
    DOMAIN
)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the City visitor parking integration."""

    await _async_register_frontend(hass, "frontend")
    async_when_setup(hass, "lovelace", _async_register_lovelace_resources)
    _LOGGER.debug("Setting up services and websocket API")
    await async_setup_services(hass)
    await async_setup_websocket(hass)
    return True


async def async_setup_entry(
    hass: HomeAssistant, entry: CityVisitorParkingConfigEntry
) -> bool:
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
        operating_time_overrides=_normalize_operating_time_overrides(entry.options),
    )

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
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
            raw_list = cast(list[object], raw)
            return f"raw=list(count={len(raw_list)})"
        return f"raw={type(raw).__name__}"

    accepts_fallback = (
        "fallback_zone" in inspect.signature(map_zone_validity).parameters
    )

    def _wrap(raw: object, *, fallback_zone: object | None = None) -> object:
        if isinstance(fallback_zone, Mapping):
            fallback = cast(Mapping[str, object], fallback_zone)
            start_raw = fallback.get("start_time")
            end_raw = fallback.get("end_time")
            has_candidates = False
            if isinstance(raw, list):
                raw_list = cast(list[object], raw)
                for item in raw_list:
                    if not isinstance(item, Mapping):
                        continue
                    item_map = cast(Mapping[str, object], item)
                    if item_map.get("start_time") and item_map.get("end_time"):
                        has_candidates = True
                        break
            if not has_candidates and start_raw and end_raw:
                _LOGGER.debug(
                    "Provider %s zone validity fallback details %s "
                    "fallback_start=%s fallback_end=%s",
                    provider_id,
                    _summarize_raw(cast(object, raw)),
                    start_raw,
                    end_raw,
                )
        if accepts_fallback:
            return map_zone_validity(raw, fallback_zone=fallback_zone)
        return map_zone_validity(raw)

    attr_name = "_map_zone_validity"
    setattr(provider, attr_name, _wrap)


def _normalize_operating_time_overrides(
    options: Mapping[str, object],
) -> OperatingTimeOverrides:
    """Normalize operating time overrides for change detection."""

    raw_overrides = options.get(CONF_OPERATING_TIME_OVERRIDES)
    if not isinstance(raw_overrides, Mapping):
        return {}
    raw_overrides = cast(Mapping[str, object], raw_overrides)

    normalized: OperatingTimeOverrides = {}
    for day in WEEKDAY_KEYS:
        windows = normalize_override_windows(raw_overrides.get(day))
        if not windows:
            continue
        day_windows: list[tuple[str, str]] = []
        for window in windows:
            start = window.get("start")
            end = window.get("end")
            if not start or not end:
                continue
            day_windows.append((str(start), str(end)))
        if day_windows:
            normalized[day] = tuple(day_windows)
    return normalized


async def _async_update_listener(
    hass: HomeAssistant, entry: CityVisitorParkingConfigEntry
) -> None:
    """Handle config entry updates."""

    runtime: CityVisitorParkingRuntimeData = entry.runtime_data
    overrides = _normalize_operating_time_overrides(entry.options)
    if overrides != runtime.operating_time_overrides:
        # Reload so the coordinator recomputes availability with new windows.
        await hass.config_entries.async_reload(entry.entry_id)
        return
    runtime.operating_time_overrides = overrides


async def async_unload_entry(
    hass: HomeAssistant, entry: CityVisitorParkingConfigEntry
) -> bool:
    """Unload a City visitor parking config entry."""

    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)


async def _async_register_frontend(hass: HomeAssistant, _component: str) -> None:
    """Register the frontend assets once."""

    data: dict[str, object] = hass.data.setdefault(DOMAIN, {})
    if data.get("frontend_registered"):
        return
    http = getattr(hass, "http", None)
    if http is None:
        _LOGGER.debug("HTTP component is not available")
        return

    dist_path = Path(__file__).parent / "frontend" / "dist"
    if not dist_path.is_dir():
        _LOGGER.error("Frontend assets directory is missing: %s", dist_path)
        return

    translations_path = dist_path / "translations"
    static_paths: list[StaticPathConfig] = [
        StaticPathConfig(
            url_path="/city_visitor_parking",
            path=str(dist_path),
            cache_headers=False,
        )
    ]
    if translations_path.is_dir():
        static_paths.append(
            StaticPathConfig(
                url_path="/city_visitor_parking/translations",
                path=str(translations_path),
                cache_headers=False,
            )
        )
    else:
        _LOGGER.warning(
            "Frontend translations directory is missing: %s", translations_path
        )

    await http.async_register_static_paths(static_paths)
    data["frontend_registered"] = True


async def _async_register_lovelace_resources(
    hass: HomeAssistant, _component: str
) -> None:
    """Ensure the Lovelace resources exist for the cards."""

    data: dict[str, object] = hass.data.setdefault(DOMAIN, {})
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
    resources_store = cast(_ResourceStorage, resources)

    if not resources_store.loaded:
        await resources_store.async_load()
        resources_store.loaded = True

    dist_path = Path(__file__).parent / "frontend" / "dist"
    if not dist_path.is_dir():
        _LOGGER.error("Frontend assets directory is missing: %s", dist_path)
        return
    desired_files: list[str] = [
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

    items = resources_store.async_items()
    update_item = resources_store.async_update_item
    create_item = resources_store.async_create_item
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
        updates: dict[str, object] = {}
        if item_url != desired_url:
            updates[CONF_URL] = desired_url
        if item.get(CONF_TYPE) != "module":
            updates[CONF_RESOURCE_TYPE_WS] = "module"
        if updates:
            item_id = item.get(CONF_ID)
            if isinstance(item_id, str):
                await update_item(item_id, updates)

    for base_url, url in desired_urls.items():
        if base_url in seen:
            continue
        await create_item({CONF_RESOURCE_TYPE_WS: "module", CONF_URL: url})

    data["lovelace_resources_registered"] = True
