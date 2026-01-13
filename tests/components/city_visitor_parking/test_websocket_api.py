"""Tests for City visitor parking websocket API."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from homeassistant import config_entries
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from pycityvisitorparking.exceptions import PyCityVisitorParkingError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.const import (
    CONF_MUNICIPALITY,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
)
from custom_components.city_visitor_parking.models import (
    AutoEndState,
    CityVisitorParkingRuntimeData,
    ProviderConfig,
)
from custom_components.city_visitor_parking.websocket_api import _ws_list_favorites


class _FakeConnection:
    """Capture websocket responses for tests."""

    def __init__(self) -> None:
        """Initialize the fake connection."""

        self.errors: list[dict[str, object]] = []
        self.results: list[dict[str, object]] = []

    def send_error(self, msg_id: int, code: str, message: str) -> None:
        """Capture an error response."""

        self.errors.append({"id": msg_id, "code": code, "message": message})

    def send_result(self, msg_id: int, result: dict[str, object]) -> None:
        """Capture a success response."""

        self.results.append({"id": msg_id, "result": result})


async def test_ws_list_favorites_success(hass) -> None:
    """Websocket should return favorites for a loaded entry."""

    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    provider = AsyncMock()
    provider.list_favorites.return_value = [
        {"id": "fav1", "license_plate": "AB-1234", "name": "Car"},
        {"license_plate": "CD-5678"},
        SimpleNamespace(name="Ignored"),
    ]
    entry.runtime_data = _runtime(provider)

    connection = _FakeConnection()
    result = _ws_list_favorites(
        hass,
        connection,
        {"id": 1, "config_entry_id": entry.entry_id},
    )
    if asyncio.iscoroutine(result):
        await result

    assert connection.results[0]["result"]["favorites"][0]["id"] == "fav1"
    assert connection.results[0]["result"]["favorites"][0]["license_plate"] == "AB-1234"
    assert connection.results[0]["result"]["favorites"][1]["license_plate"] == "CD-5678"


async def test_ws_list_favorites_invalid_target(hass) -> None:
    """Websocket should reject invalid targets."""

    connection = _FakeConnection()
    result = _ws_list_favorites(
        hass,
        connection,
        {"id": 1, "config_entry_id": "missing"},
    )
    if asyncio.iscoroutine(result):
        await result

    assert connection.errors[0]["code"] == "invalid_target"


async def test_ws_list_favorites_provider_error(hass) -> None:
    """Websocket should surface provider failures."""

    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    provider = AsyncMock()
    provider.list_favorites.side_effect = PyCityVisitorParkingError
    entry.runtime_data = _runtime(provider)

    connection = _FakeConnection()
    result = _ws_list_favorites(
        hass,
        connection,
        {"id": 1, "config_entry_id": entry.entry_id},
    )
    if asyncio.iscoroutine(result):
        await result

    assert connection.errors[0]["code"] == "favorites_failed"


def _create_entry() -> MockConfigEntry:
    """Create a mock entry for websocket tests."""

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


def _runtime(provider: AsyncMock) -> CityVisitorParkingRuntimeData:
    """Build runtime data for websocket tests."""

    return CityVisitorParkingRuntimeData(
        client=AsyncMock(),
        provider=provider,
        provider_config=ProviderConfig(
            provider_id="dvsportal",
            municipality_name="City",
            base_url=None,
            api_url=None,
        ),
        coordinator=AsyncMock(),
        permit_id="permit",
        auto_end_state=AutoEndState(),
        operating_time_overrides={},
    )
