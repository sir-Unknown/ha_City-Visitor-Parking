"""Tests for City visitor parking setup."""

from __future__ import annotations

import logging
from pathlib import Path
from types import SimpleNamespace
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
from homeassistant import config_entries
from homeassistant.components.lovelace.const import (
    CONF_RESOURCE_TYPE_WS,
    CONF_URL,
    LOVELACE_DATA,
)
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.exceptions import (
    ConfigEntryAuthFailed,
    ConfigEntryError,
    ConfigEntryNotReady,
)
from homeassistant.helpers import aiohttp_client
from pycityvisitorparking.exceptions import ServiceUnavailableError
from pytest_homeassistant_custom_component.common import MockConfigEntry

import custom_components.city_visitor_parking as init_module
from custom_components.city_visitor_parking.config_flow import (
    CityVisitorParkingConfigFlow,
)
from custom_components.city_visitor_parking.const import (
    CONF_AUTO_END,
    CONF_MUNICIPALITY,
    CONF_OPERATING_TIME_OVERRIDES,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
)

if TYPE_CHECKING:
    from types import ModuleType

    from aiohttp import ClientSession
    from homeassistant.core import HomeAssistant
    from pytest import LogCaptureFixture, MonkeyPatch


async def test_async_setup_entry_auth_error(
    hass: HomeAssistant, monkeypatch: MonkeyPatch, pv_library: ModuleType
) -> None:
    """Auth errors should raise ConfigEntryAuthFailed."""
    entry = _create_entry()
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.login.side_effect = pv_library.AuthError
    client = AsyncMock()
    client.get_provider.return_value = provider

    monkeypatch.setattr(
        init_module, "async_create_client", AsyncMock(return_value=client)
    )

    with pytest.raises(ConfigEntryAuthFailed):
        await init_module.async_setup_entry(hass, entry)


async def test_async_setup_entry_network_error(
    hass: HomeAssistant, monkeypatch: MonkeyPatch, pv_library: ModuleType
) -> None:
    """Network errors should raise ConfigEntryNotReady."""
    entry = _create_entry()
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.login.side_effect = pv_library.NetworkError
    client = AsyncMock()
    client.get_provider.return_value = provider

    monkeypatch.setattr(
        init_module, "async_create_client", AsyncMock(return_value=client)
    )

    with pytest.raises(ConfigEntryNotReady):
        await init_module.async_setup_entry(hass, entry)


async def test_async_setup_entry_service_unavailable(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """A provider outage should raise ConfigEntryNotReady so HA retries."""
    entry = _create_entry()
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.login.side_effect = ServiceUnavailableError
    client = AsyncMock()
    client.get_provider.return_value = provider

    monkeypatch.setattr(
        init_module, "async_create_client", AsyncMock(return_value=client)
    )

    with pytest.raises(ConfigEntryNotReady):
        await init_module.async_setup_entry(hass, entry)


async def test_async_setup_entry_provider_error(
    hass: HomeAssistant, monkeypatch: MonkeyPatch, pv_library: ModuleType
) -> None:
    """Provider errors should raise ConfigEntryError."""
    entry = _create_entry()
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.login.side_effect = pv_library.ProviderError
    client = AsyncMock()
    client.get_provider.return_value = provider

    monkeypatch.setattr(
        init_module, "async_create_client", AsyncMock(return_value=client)
    )

    with pytest.raises(ConfigEntryError):
        await init_module.async_setup_entry(hass, entry)


async def test_update_listener_reloads_on_override_change(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Override changes should reload the entry."""
    entry = await _setup_entry(hass, monkeypatch)

    reload_mock = AsyncMock()
    monkeypatch.setattr(hass.config_entries, "async_reload", reload_mock)

    hass.config_entries.async_update_entry(
        entry,
        options={
            CONF_OPERATING_TIME_OVERRIDES: {"mon": [{"start": "09:00", "end": "11:00"}]}
        },
    )
    await hass.async_block_till_done()

    reload_mock.assert_awaited_once_with(entry.entry_id)


async def test_update_listener_skips_reload_without_override_change(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Non-override updates should not reload the entry."""
    entry = await _setup_entry(hass, monkeypatch)

    reload_mock = AsyncMock()
    monkeypatch.setattr(hass.config_entries, "async_reload", reload_mock)

    hass.config_entries.async_update_entry(
        entry,
        options={CONF_AUTO_END: True},
    )
    await hass.async_block_till_done()

    reload_mock.assert_not_awaited()


async def test_register_frontend_assets(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Frontend assets should register once when available."""
    hass.config.components.add("frontend")
    hass.http = AsyncMock()
    await init_module._async_register_frontend(hass, "frontend")
    await init_module._async_register_frontend(hass, "frontend")

    hass.http.async_register_static_paths.assert_awaited_once()
    assert hass.data[DOMAIN]["frontend_registered"] is True


async def test_register_frontend_assets_no_http(hass: HomeAssistant) -> None:
    """Frontend assets should skip when HTTP is unavailable."""
    hass.http = None
    await init_module._async_register_frontend(hass, "frontend")

    assert "frontend_registered" not in hass.data[DOMAIN]


async def test_register_frontend_assets_missing_dist(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Frontend assets should skip when dist path is missing."""
    hass.config.components.add("frontend")
    hass.http = AsyncMock()
    original_is_dir = Path.is_dir

    def _fake_is_dir(self: Path) -> bool:
        if str(self).endswith("frontend/dist"):
            return False
        return original_is_dir(self)

    monkeypatch.setattr(Path, "is_dir", _fake_is_dir)

    await init_module._async_register_frontend(hass, "frontend")

    hass.http.async_register_static_paths.assert_not_called()
    assert "frontend_registered" not in hass.data[DOMAIN]


async def test_register_frontend_assets_missing_translations(
    hass: HomeAssistant,
    monkeypatch: MonkeyPatch,
    caplog: LogCaptureFixture,
) -> None:
    """Frontend assets should warn when translations are missing."""
    hass.config.components.add("frontend")
    hass.http = AsyncMock()
    original_is_dir = Path.is_dir

    def _fake_is_dir(self: Path) -> bool:
        path = str(self)
        if path.endswith("frontend/dist/translations"):
            return False
        return original_is_dir(self)

    monkeypatch.setattr(Path, "is_dir", _fake_is_dir)
    monkeypatch.setattr(
        init_module, "async_get_versions", AsyncMock(return_value=("1.2.3", "4.5.6"))
    )

    with caplog.at_level(
        logging.WARNING, logger="custom_components.city_visitor_parking"
    ):
        await init_module._async_register_frontend(hass, "frontend")

    hass.http.async_register_static_paths.assert_awaited_once()
    assert hass.data[DOMAIN]["frontend_registered"] is True
    assert "hacvp" in caplog.text
    assert "1.2.3" in caplog.text


async def test_register_lovelace_resources_non_storage(
    hass: HomeAssistant,
) -> None:
    """Lovelace resources should skip when not storage based."""
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=SimpleNamespace())
    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert hass.data[DOMAIN]["lovelace_resources_registered"] is True


async def test_register_lovelace_resources_safe_mode(hass: HomeAssistant) -> None:
    """Lovelace resources should skip in safe mode."""
    hass.config.safe_mode = True
    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert "lovelace_resources_registered" not in hass.data[DOMAIN]


async def test_register_lovelace_resources_no_data(hass: HomeAssistant) -> None:
    """Lovelace resources should skip when data is missing."""
    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert "lovelace_resources_registered" not in hass.data[DOMAIN]


async def test_register_lovelace_resources_missing_dist(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Lovelace resources should skip when dist path is missing."""

    class FakeResourceCollection:
        """Minimal resources collection for tests."""

        def __init__(self) -> None:
            self.loaded = True

        def async_items(self) -> list[dict[str, str]]:
            """Return empty items."""
            return []

    monkeypatch.setattr(
        init_module, "ResourceStorageCollection", FakeResourceCollection
    )

    resources = FakeResourceCollection()
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)

    original_is_dir = Path.is_dir

    def _fake_is_dir(self: Path) -> bool:
        if str(self).endswith("frontend/dist"):
            return False
        return original_is_dir(self)

    monkeypatch.setattr(Path, "is_dir", _fake_is_dir)

    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert "lovelace_resources_registered" not in hass.data[DOMAIN]


async def test_register_lovelace_resources_updates_existing(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Lovelace resources should update existing matching entries."""

    class FakeResourceCollection:
        """Minimal resources collection for tests."""

        def __init__(self) -> None:
            self.loaded = False
            self.load_calls = 0
            self.updated: list[tuple[str, dict[str, object]]] = []
            self.created: list[dict[str, object]] = []
            self._items: list[dict[str, object]] = [
                {
                    "id": "1",
                    CONF_URL: "/city_visitor_parking/city-visitor-parking-card.js",
                    "type": "js",
                },
                {
                    "id": "2",
                    CONF_URL: None,
                    "type": "js",
                },
                {
                    "id": "3",
                    CONF_URL: "/other.js",
                    "type": "js",
                },
            ]

        async def async_load(self) -> None:
            """Track load calls."""
            self.load_calls += 1

        def async_items(self) -> list[dict[str, object]]:
            """Return the stored items."""
            return list(self._items)

        async def async_update_item(
            self, item_id: str, updates: dict[str, object]
        ) -> None:
            """Track updates."""
            self.updated.append((item_id, updates))
            for item in self._items:
                item_id_value = item.get("id")
                if isinstance(item_id_value, str) and item_id_value == item_id:
                    item.update(updates)

        async def async_create_item(self, item: dict[str, object]) -> None:
            """Track creates."""
            self.created.append(item)
            self._items.append(item)

    monkeypatch.setattr(
        init_module, "ResourceStorageCollection", FakeResourceCollection
    )

    resources = FakeResourceCollection()
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)

    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert resources.load_calls == 1
    assert resources.loaded is True
    assert resources.updated
    assert resources.created == []
    assert hass.data[DOMAIN]["lovelace_resources_registered"] is True
    update = resources.updated[0][1]
    assert CONF_URL in update
    assert CONF_RESOURCE_TYPE_WS in update


async def test_register_lovelace_resources_creates_missing(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Lovelace resources should create missing expected entries."""

    class FakeResourceCollection:
        """Minimal resources collection for tests."""

        def __init__(self) -> None:
            self.loaded = False
            self.load_calls = 0
            self.updated: list[tuple[str, dict[str, object]]] = []
            self.created: list[dict[str, object]] = []
            self._items: list[dict[str, object]] = [
                {"id": "1", CONF_URL: None, "type": "js"},
                {"id": "2", CONF_URL: "/other.js", "type": "js"},
            ]

        async def async_load(self) -> None:
            """Track load calls."""
            self.load_calls += 1

        def async_items(self) -> list[dict[str, object]]:
            """Return the stored items."""
            return list(self._items)

        async def async_update_item(
            self, item_id: str, updates: dict[str, object]
        ) -> None:
            """Track updates."""
            self.updated.append((item_id, updates))
            for item in self._items:
                item_id_value = item.get("id")
                if isinstance(item_id_value, str) and item_id_value == item_id:
                    item.update(updates)

        async def async_create_item(self, item: dict[str, object]) -> None:
            """Track creates."""
            self.created.append(item)
            self._items.append(item)

    monkeypatch.setattr(
        init_module, "ResourceStorageCollection", FakeResourceCollection
    )

    resources = FakeResourceCollection()
    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=resources)

    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert resources.load_calls == 1
    assert resources.loaded is True
    assert resources.updated == []
    assert resources.created
    created = resources.created[0]
    created_url = created.get(CONF_URL)
    assert isinstance(created_url, str)
    assert (
        created_url.split("?", 1)[0]
        == "/city_visitor_parking/city-visitor-parking-card.js"
    )


def test_normalize_operating_time_overrides_filters_invalid() -> None:
    """Operating time overrides should normalize valid windows only."""
    options = {
        CONF_OPERATING_TIME_OVERRIDES: {
            "mon": [
                {"start": "08:00", "end": "09:00"},
                {"start": "", "end": "10:00"},
            ],
            "tue": {"start": "10:00", "end": "11:00"},
            "fri": "bad",
            "extra": [{"start": "12:00", "end": "13:00"}],
        }
    }

    normalized = init_module._normalize_operating_time_overrides(options)

    assert normalized == {
        "mon": (("08:00", "09:00"),),
        "tue": (("10:00", "11:00"),),
    }


def _legacy_entry(version: int = 1, **overrides: str) -> MockConfigEntry:
    """Create a 1.1 entry as written before the catalog path correction."""
    data = {
        CONF_PROVIDER_ID: "dvsportal",
        CONF_MUNICIPALITY: "Venlo",
        "base_url": "https://parkeren.venlo.nl",
        "api_url": "/DVSWebAPI/api",
        CONF_PERMIT_ID: "permit",
        CONF_USERNAME: "user",
        CONF_PASSWORD: "pass",
    }
    data.update(overrides)
    return MockConfigEntry(
        domain=DOMAIN,
        data=data,
        unique_id="dvsportal:permit:venlo",
        title="Venlo - permit",
        version=version,
        minor_version=1,
    )


async def test_migrate_entry_replaces_retired_api_url(hass: HomeAssistant) -> None:
    """Entries still on the retired default path take the catalog path."""
    entry = _legacy_entry()
    entry.add_to_hass(hass)

    assert await init_module.async_migrate_entry(hass, entry)

    assert entry.data["api_url"] == "/DVSPortal/api"
    assert entry.minor_version == CityVisitorParkingConfigFlow.MINOR_VERSION


async def test_migrate_entry_keeps_custom_api_url(hass: HomeAssistant) -> None:
    """A manually chosen api_url must survive the migration."""
    entry = _legacy_entry(api_url="/custom/api")
    entry.add_to_hass(hass)

    assert await init_module.async_migrate_entry(hass, entry)

    assert entry.data["api_url"] == "/custom/api"
    assert entry.minor_version == CityVisitorParkingConfigFlow.MINOR_VERSION


async def test_migrate_entry_ignores_unknown_base_url(hass: HomeAssistant) -> None:
    """Manual ('Other') entries that are not in the catalog stay untouched."""
    entry = _legacy_entry(base_url="https://parkeren.example.org")
    entry.add_to_hass(hass)

    assert await init_module.async_migrate_entry(hass, entry)

    assert entry.data["api_url"] == "/DVSWebAPI/api"


async def test_migrate_entry_rejects_newer_major_version(hass: HomeAssistant) -> None:
    """Entries from a newer integration version must not be migrated."""
    entry = _legacy_entry(version=CityVisitorParkingConfigFlow.VERSION + 1)
    entry.add_to_hass(hass)

    assert not await init_module.async_migrate_entry(hass, entry)


def _create_entry() -> MockConfigEntry:
    """Create a mock entry for setup tests."""
    return MockConfigEntry(
        domain=DOMAIN,
        data={
            CONF_PROVIDER_ID: "dvsportal",
            CONF_MUNICIPALITY: "City",
            CONF_PERMIT_ID: "permit",
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
        unique_id="dvsportal:permit:city",
        title="City - permit",
    )


async def _setup_entry(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> MockConfigEntry:
    """Set up a config entry with a stub provider."""
    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.SETUP_IN_PROGRESS)

    provider = AsyncMock()
    provider.resolved_login_params = {}
    provider.fetch_all.return_value = ({"id": "permit", "zone_validity": []}, [], [])

    client = AsyncMock()
    client.get_provider.return_value = provider

    monkeypatch.setattr(
        init_module, "async_create_client", AsyncMock(return_value=client)
    )
    monkeypatch.setattr(
        hass.config_entries,
        "async_forward_entry_setups",
        AsyncMock(return_value=True),
    )

    await init_module.async_setup_entry(hass, entry)

    return entry


async def test_each_entry_gets_its_own_session_closed_on_unload(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Entries must not share a session (cookie jar) and must close their own."""
    sessions: list[ClientSession] = []

    async def _fake_create_client(
        _provider: object, session: ClientSession
    ) -> AsyncMock:
        sessions.append(session)
        provider = AsyncMock()
        provider.resolved_login_params = {}
        provider.fetch_all.return_value = (
            {"id": "permit", "zone_validity": []},
            [],
            [],
        )
        client = AsyncMock()
        client.get_provider.return_value = provider
        return client

    monkeypatch.setattr(init_module, "async_create_client", _fake_create_client)

    first_entry = _create_entry()
    second_entry = MockConfigEntry(
        domain=DOMAIN,
        data={**first_entry.data, CONF_PERMIT_ID: "permit2"},
        unique_id="dvsportal:permit2:city",
        title="City - permit2",
    )
    for entry in (first_entry, second_entry):
        entry.add_to_hass(hass)
        assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    first, second = sessions
    assert first is not second
    assert first.cookie_jar is not second.cookie_jar
    assert first is not aiohttp_client.async_get_clientsession(hass)

    # A reload replaces the session; the old one must not leak.
    assert await hass.config_entries.async_reload(first_entry.entry_id)
    await hass.async_block_till_done()
    reloaded = sessions[2]
    assert first.closed
    assert not reloaded.closed
    assert not second.closed

    assert await hass.config_entries.async_unload(first_entry.entry_id)
    assert reloaded.closed
    assert not second.closed
    assert not aiohttp_client.async_get_clientsession(hass).closed
