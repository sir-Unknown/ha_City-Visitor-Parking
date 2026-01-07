"""Tests for the City visitor parking coordinator."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

from freezegun import freeze_time
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import UpdateFailed
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.const import CONF_AUTO_END, DOMAIN
from custom_components.city_visitor_parking.coordinator import (
    CityVisitorParkingCoordinator,
)
from custom_components.city_visitor_parking.models import AutoEndState


async def test_auto_end_reservation_once(hass) -> None:
    """Auto-end should only happen once per reservation within cooldown."""

    entry = _create_entry(auto_end=True)
    entry.add_to_hass(hass)

    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    reservation = {
        "id": "res1",
        "start_time": (now - timedelta(hours=1)).isoformat(),
        "end_time": (now + timedelta(hours=1)).isoformat(),
    }

    provider = AsyncMock()
    provider.get_permit.return_value = {"zone_validity": []}
    provider.list_reservations.return_value = [reservation]
    provider.list_favorites.return_value = []

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    with freeze_time(now):
        await coordinator.async_refresh()
        await coordinator.async_refresh()

    provider.end_reservation.assert_awaited_once()


async def test_auth_failure_triggers_reauth(hass, pv_library) -> None:
    """Auth errors should raise ConfigEntryAuthFailed."""

    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.get_permit.side_effect = pv_library.AuthError

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    await coordinator.async_refresh()
    assert isinstance(coordinator.last_exception, ConfigEntryAuthFailed)


async def test_network_failure_raises_updatefailed(hass, pv_library) -> None:
    """Network failures should raise UpdateFailed."""

    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.get_permit.side_effect = pv_library.NetworkError

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    await coordinator.async_refresh()
    assert isinstance(coordinator.last_exception, UpdateFailed)


def _create_entry(auto_end: bool):
    """Create a mock entry with options."""

    return MockConfigEntry(
        domain=DOMAIN,
        data={"permit_id": "permit"},
        options={CONF_AUTO_END: auto_end},
    )
