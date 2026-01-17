"""Tests for City visitor parking setup."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import cast
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
from pytest_homeassistant_custom_component.common import MockConfigEntry

import custom_components.city_visitor_parking as init_module
from custom_components.city_visitor_parking.const import (
    CONF_AUTO_END,
    CONF_MUNICIPALITY,
    CONF_OPERATING_TIME_OVERRIDES,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
)


async def test_async_setup_entry_auth_error(hass, monkeypatch, pv_library) -> None:
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


async def test_async_setup_entry_network_error(hass, monkeypatch, pv_library) -> None:
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


async def test_async_setup_entry_provider_error(hass, monkeypatch, pv_library) -> None:
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


async def test_update_listener_reloads_on_override_change(hass, monkeypatch) -> None:
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
    hass, monkeypatch
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


async def test_register_frontend_assets(hass, monkeypatch) -> None:
    """Frontend assets should register once when available."""

    hass.config.components.add("frontend")
    hass.http = AsyncMock()
    await init_module._async_register_frontend(hass, "frontend")
    await init_module._async_register_frontend(hass, "frontend")

    hass.http.async_register_static_paths.assert_awaited_once()
    assert hass.data[DOMAIN]["frontend_registered"] is True


async def test_register_frontend_assets_no_http(hass) -> None:
    """Frontend assets should skip when HTTP is unavailable."""

    hass.http = None
    await init_module._async_register_frontend(hass, "frontend")

    assert "frontend_registered" not in hass.data[DOMAIN]


async def test_register_frontend_assets_missing_dist(hass, monkeypatch) -> None:
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


async def test_register_frontend_assets_missing_translations(hass, monkeypatch) -> None:
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

    await init_module._async_register_frontend(hass, "frontend")

    hass.http.async_register_static_paths.assert_awaited_once()
    assert hass.data[DOMAIN]["frontend_registered"] is True


async def test_register_lovelace_resources_non_storage(hass) -> None:
    """Lovelace resources should skip when not storage based."""

    hass.data[LOVELACE_DATA] = SimpleNamespace(resources=SimpleNamespace())
    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert hass.data[DOMAIN]["lovelace_resources_registered"] is True


async def test_register_lovelace_resources_safe_mode(hass) -> None:
    """Lovelace resources should skip in safe mode."""

    hass.config.safe_mode = True
    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert "lovelace_resources_registered" not in hass.data[DOMAIN]


async def test_register_lovelace_resources_no_data(hass) -> None:
    """Lovelace resources should skip when data is missing."""

    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert "lovelace_resources_registered" not in hass.data[DOMAIN]


async def test_register_lovelace_resources_missing_dist(hass, monkeypatch) -> None:
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


async def test_register_lovelace_resources_updates_and_creates(
    hass, monkeypatch
) -> None:
    """Lovelace resources should update and create entries."""

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

    original_stat = Path.stat

    def _fake_stat(self: Path, *args, **kwargs):
        if self.name == "city-visitor-parking-active-card.js":
            raise FileNotFoundError
        return original_stat(self, *args, **kwargs)

    monkeypatch.setattr(Path, "stat", _fake_stat)

    await init_module._async_register_lovelace_resources(hass, "lovelace")

    assert resources.load_calls == 1
    assert resources.loaded is True
    assert resources.updated
    assert resources.created
    assert hass.data[DOMAIN]["lovelace_resources_registered"] is True
    update = resources.updated[0][1]
    assert CONF_URL in update
    assert CONF_RESOURCE_TYPE_WS in update


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


def test_install_zone_validity_logging_wraps_provider() -> None:
    """Zone validity mapping should be wrapped when available."""

    calls: list[tuple[object, object | None]] = []

    class Provider:
        provider_id = "test"

        def _map_zone_validity(
            self, raw: object, *, fallback_zone: object | None = None
        ) -> object:
            calls.append((raw, fallback_zone))
            return {"raw": raw, "fallback_zone": fallback_zone}

    provider = Provider()
    init_module._install_zone_validity_logging(provider)

    result = provider._map_zone_validity(
        [],
        fallback_zone={"start_time": "2025-01-01T00:00:00", "end_time": "2025-01-02"},
    )

    result_map = cast(dict[str, object], result)
    assert result_map["fallback_zone"] is not None
    assert calls


def test_install_zone_validity_logging_detects_candidates() -> None:
    """Zone validity logging should detect candidate windows."""

    class Provider:
        provider_id = "test"

        def _map_zone_validity(
            self, raw: object, *, fallback_zone: object | None = None
        ) -> object:
            return {"raw": raw, "fallback_zone": fallback_zone}

    provider = Provider()
    init_module._install_zone_validity_logging(provider)

    raw = [
        "not-a-mapping",
        {"start_time": "2025-01-01T00:00:00", "end_time": "2025-01-01T01:00:00"},
    ]
    result = provider._map_zone_validity(
        raw,
        fallback_zone={"start_time": "2025-01-02T00:00:00", "end_time": "2025-01-02"},
    )

    result_map = cast(dict[str, object], result)
    assert result_map["raw"] == raw


def test_install_zone_validity_logging_without_fallback_param() -> None:
    """Zone validity mapping should wrap providers without fallback support."""

    calls: list[object] = []

    class Provider:
        provider_id = "test"

        def _map_zone_validity(self, raw: object, **_: object) -> object:
            calls.append(raw)
            return raw

    provider = Provider()
    init_module._install_zone_validity_logging(provider)

    fallback = {"start_time": "2025-01-01T00:00:00", "end_time": "2025-01-02"}
    assert provider._map_zone_validity(None, fallback_zone=fallback) is None
    assert provider._map_zone_validity({"zone": "A"}, fallback_zone=fallback) == {
        "zone": "A"
    }
    assert calls == [None, {"zone": "A"}]


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


async def _setup_entry(hass, monkeypatch) -> MockConfigEntry:
    """Set up a config entry with a stub provider."""

    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.SETUP_IN_PROGRESS)

    provider = AsyncMock()
    provider.get_permit.return_value = {"id": "permit", "zone_validity": []}
    provider.list_reservations.return_value = []
    provider.list_favorites.return_value = []

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
