"""Tests for City visitor parking services."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from homeassistant import config_entries
from homeassistant.const import ATTR_DEVICE_ID
from homeassistant.exceptions import ServiceValidationError
from homeassistant.helpers import device_registry as dr
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.const import (
    ATTR_END_TIME,
    ATTR_FAVORITE_ID,
    ATTR_LICENSE_PLATE,
    ATTR_RESERVATION_ID,
    ATTR_START_TIME,
    DOMAIN,
)
from custom_components.city_visitor_parking.models import (
    AutoEndState,
    CityVisitorParkingRuntimeData,
    Favorite,
    ProviderConfig,
    Reservation,
)
from custom_components.city_visitor_parking.services import (
    SERVICE_END_RESERVATION,
    SERVICE_LIST_ACTIVE_RESERVATIONS,
    SERVICE_LIST_FAVORITES,
    SERVICE_START_RESERVATION,
    SERVICE_UPDATE_FAVORITE,
    SERVICE_UPDATE_RESERVATION,
    async_setup_services,
)


async def test_service_routing_targets_single_entry(hass) -> None:
    """Services should target a single entry via device_id."""

    await async_setup_services(hass)

    entry_one, device_one, provider_one = _create_entry_with_device(hass, "permit1")
    _entry_two, _device_two, provider_two = _create_entry_with_device(hass, "permit2")

    start = datetime.now(UTC)
    end = start + timedelta(hours=1)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_START_RESERVATION,
        {
            ATTR_DEVICE_ID: device_one.id,
            ATTR_START_TIME: start,
            ATTR_END_TIME: end,
            ATTR_LICENSE_PLATE: "AB1234",
        },
        blocking=True,
    )

    provider_one.start_reservation.assert_awaited_once()
    provider_two.start_reservation.assert_not_called()
    assert entry_one.runtime_data.permit_id == "permit1"


async def test_service_validation_errors(hass) -> None:
    """Invalid input should raise ServiceValidationError."""

    await async_setup_services(hass)

    _, device, _ = _create_entry_with_device(hass, "permit1")
    start = datetime.now(UTC)

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_START_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_START_TIME: start,
                ATTR_END_TIME: start,
                ATTR_LICENSE_PLATE: "AB1234",
            },
            blocking=True,
        )

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
            },
            blocking=True,
        )


async def test_update_reservation_fallback(hass) -> None:
    """Fallback update should cancel and recreate when required."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.update_reservation.side_effect = NotImplementedError

    start = datetime.now(UTC)
    end = start + timedelta(hours=1)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_RESERVATION,
        {
            ATTR_DEVICE_ID: device.id,
            ATTR_RESERVATION_ID: "res1",
            ATTR_START_TIME: start,
            ATTR_END_TIME: end,
            ATTR_LICENSE_PLATE: "AB1234",
        },
        blocking=True,
    )

    provider.end_reservation.assert_awaited_once()
    provider.start_reservation.assert_awaited_once()


async def test_update_favorite_fallback(hass) -> None:
    """Fallback update should remove and add favorites."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.update_favorite.side_effect = NotImplementedError

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_FAVORITE,
        {
            ATTR_DEVICE_ID: device.id,
            ATTR_FAVORITE_ID: "fav1",
            ATTR_LICENSE_PLATE: "AB1234",
        },
        blocking=True,
    )

    provider.remove_favorite.assert_awaited_once_with("fav1")
    provider.add_favorite.assert_awaited_once()


async def test_service_invalid_target(hass) -> None:
    """Invalid device_id should raise ServiceValidationError."""

    await async_setup_services(hass)

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_END_RESERVATION,
            {ATTR_DEVICE_ID: "missing", ATTR_RESERVATION_ID: "res1"},
            blocking=True,
        )


async def test_list_active_reservations(hass) -> None:
    """List service should return active reservations."""

    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    now = datetime.now(UTC)
    entry.runtime_data.coordinator.data = SimpleNamespace(
        reservations=[
            Reservation(
                reservation_id="active",
                start_time=now - timedelta(minutes=10),
                end_time=now + timedelta(minutes=10),
                license_plate="AA11BBCC",
            ),
            Reservation(
                reservation_id="expired",
                start_time=now - timedelta(hours=2),
                end_time=now - timedelta(hours=1),
            ),
        ],
        favorites=[
            Favorite(
                favorite_id="fav1",
                license_plate="AA11BBCC",
                name="My car",
            )
        ],
    )

    response = await hass.services.async_call(
        DOMAIN,
        SERVICE_LIST_ACTIVE_RESERVATIONS,
        {ATTR_DEVICE_ID: device.id},
        blocking=True,
        return_response=True,
    )

    assert response is not None
    assert response["count"] == 1
    assert response["active_reservations"][0]["reservation_id"] == "active"
    assert response["active_reservations"][0]["license_plate"] == "AA11BBCC"
    assert response["active_reservations"][0]["favorite_id"] == "fav1"
    assert response["active_reservations"][0]["favorite_name"] == "My car"


async def test_list_favorites_returns_license_plate(hass) -> None:
    """List favorites service should return license plates."""

    await async_setup_services(hass)

    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.list_favorites.return_value = [
        {"id": "fav1", "license_plate": "AB-1234", "name": "Car"},
    ]

    response = await hass.services.async_call(
        DOMAIN,
        SERVICE_LIST_FAVORITES,
        {ATTR_DEVICE_ID: device.id},
        blocking=True,
        return_response=True,
    )

    assert response is not None
    assert response["count"] == 1
    assert response["favorites"][0]["favorite_id"] == "fav1"
    assert response["favorites"][0]["license_plate"] == "AB-1234"


def _create_entry_with_device(hass, permit_id: str):
    """Create a mock entry with device registry entry."""

    entry = MockConfigEntry(
        domain=DOMAIN,
        data={
            "provider_id": "dvsportal",
            "municipality_name": "City",
            "permit_id": permit_id,
            "username": "user",
            "password": "pass",
        },
        unique_id=f"dvsportal:{permit_id}:city",
        title=f"City - {permit_id}",
    )
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    provider = AsyncMock()
    coordinator = AsyncMock()
    coordinator.async_refresh = AsyncMock()
    coordinator.last_update_success = True

    runtime = CityVisitorParkingRuntimeData(
        client=AsyncMock(),
        provider=provider,
        provider_config=ProviderConfig(
            provider_id="dvsportal",
            municipality_name="City",
            base_url=None,
            api_url=None,
        ),
        coordinator=coordinator,
        permit_id=permit_id,
        auto_end_state=AutoEndState(),
    )
    entry.runtime_data = runtime

    device_registry = dr.async_get(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, entry.entry_id)},
        manufacturer="City visitor parking",
        name=entry.title,
    )

    return entry, device, provider
