"""Tests for City visitor parking setup."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from homeassistant import config_entries
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

    assert result["fallback_zone"] is not None
    assert calls


def test_install_zone_validity_logging_without_fallback_param() -> None:
    """Zone validity mapping should wrap providers without fallback support."""

    calls: list[object] = []

    class Provider:
        provider_id = "test"

        def _map_zone_validity(self, raw: object) -> object:
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
