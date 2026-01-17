"""Tests for City visitor parking services."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from freezegun import freeze_time
from homeassistant import config_entries
from homeassistant.const import ATTR_DEVICE_ID
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import device_registry as dr
from pycityvisitorparking import AuthError, NetworkError, ProviderError, ValidationError
from pycityvisitorparking.exceptions import PyCityVisitorParkingError
from pytest_homeassistant_custom_component.common import (  # type: ignore[import-untyped]
    MockConfigEntry,
)

from custom_components.city_visitor_parking.const import (
    ATTR_END_TIME,
    ATTR_FAVORITE_ID,
    ATTR_LICENSE_PLATE,
    ATTR_NAME,
    ATTR_RESERVATION_ID,
    ATTR_START_TIME,
    DOMAIN,
)
from custom_components.city_visitor_parking.models import (
    AutoEndState,
    CityVisitorParkingRuntimeData,
    CoordinatorData,
    Favorite,
    ProviderConfig,
    Reservation,
    ZoneAvailability,
)
from custom_components.city_visitor_parking.services import (
    SERVICE_ADD_FAVORITE,
    SERVICE_END_RESERVATION,
    SERVICE_LIST_ACTIVE_RESERVATIONS,
    SERVICE_LIST_FAVORITES,
    SERVICE_REMOVE_FAVORITE,
    SERVICE_START_RESERVATION,
    SERVICE_UPDATE_FAVORITE,
    SERVICE_UPDATE_RESERVATION,
    _error_base_key,
    _error_detail,
    _fallback_update_favorite,
    _fallback_update_reservation,
    _favorite_error_key,
    _is_not_supported,
    _raise_favorite_error,
    _raise_reservation_error,
    _reservation_error_key,
    _reservation_update_fields,
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

    end = start - timedelta(minutes=5)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_START_TIME: start,
                ATTR_END_TIME: end,
            },
            blocking=True,
        )


async def test_update_reservation_fallback(hass) -> None:
    """Fallback update should cancel and recreate when required."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_START_TIME, ATTR_END_TIME]
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


async def test_update_reservation_success(hass) -> None:
    """Update reservation should call provider update when supported."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_START_TIME, ATTR_END_TIME]

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
        },
        blocking=True,
    )

    provider.update_reservation.assert_awaited_once()
    provider.end_reservation.assert_not_awaited()
    provider.start_reservation.assert_not_awaited()


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


async def test_update_reservation_provider_error(hass, pv_library) -> None:
    """Provider errors should raise HomeAssistantError."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_START_TIME, ATTR_END_TIME]
    provider.update_reservation.side_effect = pv_library.ProviderError("boom")

    start = datetime.now(UTC)
    end = start + timedelta(hours=1)

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_START_TIME: start,
                ATTR_END_TIME: end,
            },
            blocking=True,
        )


async def test_update_reservation_validation_error(hass, pv_library) -> None:
    """Validation errors should raise HomeAssistantError."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_START_TIME, ATTR_END_TIME]
    provider.update_reservation.side_effect = pv_library.ValidationError("boom")

    start = datetime.now(UTC)
    end = start + timedelta(hours=1)

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_START_TIME: start,
                ATTR_END_TIME: end,
            },
            blocking=True,
        )


async def test_service_end_reservation_calls_provider(hass) -> None:
    """End reservation should call the provider once."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)

    with freeze_time(now):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_END_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
            },
            blocking=True,
        )

    provider.end_reservation.assert_awaited_once_with("res1", now)


async def test_service_add_and_remove_favorite(hass) -> None:
    """Add and remove favorite services should call the provider."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")

    await hass.services.async_call(
        DOMAIN,
        SERVICE_ADD_FAVORITE,
        {
            ATTR_DEVICE_ID: device.id,
            ATTR_LICENSE_PLATE: "AB1234",
            ATTR_NAME: "My car",
        },
        blocking=True,
    )

    await hass.services.async_call(
        DOMAIN,
        SERVICE_REMOVE_FAVORITE,
        {
            ATTR_DEVICE_ID: device.id,
            ATTR_FAVORITE_ID: "fav1",
        },
        blocking=True,
    )

    provider.add_favorite.assert_awaited_once_with(
        license_plate="AB1234",
        name="My car",
    )
    provider.remove_favorite.assert_awaited_once_with("fav1")


async def test_service_start_reservation_adjusts_start(hass) -> None:
    """Start reservation should enforce a minimum start time."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)
    start = now
    end = now + timedelta(minutes=30)

    with freeze_time(now):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_START_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_START_TIME: start,
                ATTR_END_TIME: end,
                ATTR_LICENSE_PLATE: "AB1234",
            },
            blocking=True,
        )

    expected_start = now + timedelta(minutes=1)
    provider.start_reservation.assert_awaited_once_with(
        license_plate="AB1234",
        start_time=expected_start,
        end_time=end,
    )


async def test_service_start_reservation_error(hass, pv_library) -> None:
    """Start reservation errors should raise HomeAssistantError."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.start_reservation.side_effect = pv_library.ProviderError("boom")

    start = datetime.now(UTC)
    end = start + timedelta(hours=1)

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_START_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_START_TIME: start,
                ATTR_END_TIME: end,
                ATTR_LICENSE_PLATE: "AB1234",
            },
            blocking=True,
        )


async def test_update_reservation_requires_full_details(hass) -> None:
    """Update reservation should require full details for fallback."""

    await async_setup_services(hass)

    _, device, _provider = _create_entry_with_device(hass, "permit1")
    start = datetime.now(UTC)

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_START_TIME: start,
                ATTR_LICENSE_PLATE: "AB1234",
            },
            blocking=True,
        )


async def test_update_reservation_unsupported_fields(hass) -> None:
    """Update reservation should reject unsupported changes."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = []
    start = datetime.now(UTC)

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_START_TIME: start,
            },
            blocking=True,
        )


async def test_update_reservation_unsupported_end_time(hass) -> None:
    """Update reservation should ignore unsupported end_time."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_START_TIME]

    end = datetime.now(UTC) + timedelta(hours=1)

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_END_TIME: end,
            },
            blocking=True,
        )


async def test_update_reservation_not_supported_falls_back(hass, pv_library) -> None:
    """Update reservation should fall back when provider reports not supported."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_START_TIME, ATTR_END_TIME]
    provider.update_reservation.side_effect = pv_library.ProviderError("Not supported")

    start = datetime.now(UTC)
    end = start + timedelta(hours=1)

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_START_TIME: start,
                ATTR_END_TIME: end,
            },
            blocking=True,
        )


async def test_service_list_active_reservations_failure(hass) -> None:
    """List active reservations should fail when refresh has no data."""

    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    entry.runtime_data.coordinator.async_refresh = AsyncMock(
        side_effect=RuntimeError("boom")
    )
    entry.runtime_data.coordinator.data = None

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_ACTIVE_RESERVATIONS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )


async def test_service_list_favorites_error(hass, pv_library) -> None:
    """List favorites should surface provider errors."""

    await async_setup_services(hass)

    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.list_favorites.side_effect = pv_library.ProviderError("boom")

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_FAVORITES,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )


async def test_service_end_reservation_error(hass, pv_library) -> None:
    """End reservation errors should raise HomeAssistantError."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.end_reservation.side_effect = pv_library.ProviderError("boom")

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_END_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
            },
            blocking=True,
        )


async def test_service_add_favorite_error(hass) -> None:
    """Add favorite errors should raise HomeAssistantError."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.add_favorite.side_effect = TypeError("boom")

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_ADD_FAVORITE,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_LICENSE_PLATE: "AB1234",
            },
            blocking=True,
        )


async def test_service_update_favorite_requires_changes(hass) -> None:
    """Update favorite should require at least one change."""

    await async_setup_services(hass)

    _, device, _provider = _create_entry_with_device(hass, "permit1")

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_FAVORITE,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_FAVORITE_ID: "fav1",
            },
            blocking=True,
        )


async def test_service_update_favorite_provider_error(hass, pv_library) -> None:
    """Update favorite provider errors should raise HomeAssistantError."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.update_favorite.side_effect = pv_library.ProviderError("boom")

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_FAVORITE,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_FAVORITE_ID: "fav1",
                ATTR_LICENSE_PLATE: "AB1234",
                ATTR_NAME: "Car",
            },
            blocking=True,
        )


async def test_service_update_favorite_type_error(hass) -> None:
    """Update favorite type errors should raise HomeAssistantError."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.update_favorite.side_effect = TypeError("boom")

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_FAVORITE,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_FAVORITE_ID: "fav1",
                ATTR_NAME: "Car",
            },
            blocking=True,
        )


async def test_service_remove_favorite_error(hass, pv_library) -> None:
    """Remove favorite errors should raise HomeAssistantError."""

    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.remove_favorite.side_effect = pv_library.ProviderError("boom")

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_REMOVE_FAVORITE,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_FAVORITE_ID: "fav1",
            },
            blocking=True,
        )


async def test_service_list_active_reservations_last_update_failure(hass) -> None:
    """List active reservations should fail when last update failed."""

    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    entry.runtime_data.coordinator.last_update_success = False
    entry.runtime_data.coordinator.last_exception = RuntimeError("boom")
    entry.runtime_data.coordinator.data = None

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_ACTIVE_RESERVATIONS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )


async def test_service_invalid_entry_domain(hass) -> None:
    """Service calls should reject entries from other domains."""

    await async_setup_services(hass)

    entry = MockConfigEntry(domain="other", data={}, title="Other")
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    device_registry = dr.async_get(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={("other", entry.entry_id)},
        manufacturer="Other",
        name="Other",
    )

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_END_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
            },
            blocking=True,
        )


async def test_service_invalid_entry_state(hass) -> None:
    """Service calls should reject entries that are not loaded."""

    await async_setup_services(hass)

    entry = MockConfigEntry(domain=DOMAIN, data={}, title="City")
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.NOT_LOADED)

    device_registry = dr.async_get(hass)
    device = device_registry.async_get_or_create(
        config_entry_id=entry.entry_id,
        identifiers={(DOMAIN, entry.entry_id)},
        manufacturer="City visitor parking",
        name="City",
    )

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_END_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
            },
            blocking=True,
        )


async def test_fallback_update_reservation_error(hass, pv_library) -> None:
    """Fallback update reservation errors should raise HomeAssistantError."""

    entry, _device, provider = _create_entry_with_device(hass, "permit1")
    provider.end_reservation.side_effect = pv_library.ProviderError("boom")

    start = datetime.now(UTC)
    end = start + timedelta(hours=1)

    with pytest.raises(HomeAssistantError):
        await _fallback_update_reservation(
            entry.runtime_data,
            "res1",
            start,
            end,
            "AB1234",
        )


async def test_fallback_update_favorite_validation_error(hass) -> None:
    """Fallback update favorite should require a license plate."""

    entry, _device, _provider = _create_entry_with_device(hass, "permit1")

    with pytest.raises(ServiceValidationError):
        await _fallback_update_favorite(entry.runtime_data, "fav1", None, None)


async def test_fallback_update_favorite_error(hass) -> None:
    """Fallback update favorite errors should raise HomeAssistantError."""

    entry, _device, provider = _create_entry_with_device(hass, "permit1")
    provider.add_favorite.side_effect = TypeError("boom")

    with pytest.raises(HomeAssistantError):
        await _fallback_update_favorite(
            entry.runtime_data,
            "fav1",
            "AB1234",
            "Car",
        )


def test_error_helpers() -> None:
    """Error helper functions should map and format details."""

    err = PyCityVisitorParkingError()
    err.user_message = "User message"
    err.detail = "Detail"
    assert _error_detail(err) == "User message"

    err = PyCityVisitorParkingError()
    err.detail = "Detail"
    assert _error_detail(err) == "Detail"

    assert _error_detail(PyCityVisitorParkingError()) is None


@pytest.mark.parametrize(
    ("error_code", "expected"),
    [
        ("auth_error", "reservation_auth_failed"),
        ("network_error", "reservation_network_failed"),
        ("validation_error", "reservation_validation_failed"),
        ("provider_error", "reservation_provider_failed"),
    ],
)
def test_error_base_key_with_error_code(error_code: str, expected: str) -> None:
    """Error codes should map to reservation keys."""

    err = PyCityVisitorParkingError()
    err.error_code = error_code
    assert _error_base_key(err, "reservation") == expected


def test_error_base_key_with_instances() -> None:
    """Error instances should map to fallback keys."""

    assert _error_base_key(AuthError(), "reservation") == "reservation_auth_failed"
    assert (
        _error_base_key(NetworkError(), "reservation") == "reservation_network_failed"
    )
    assert (
        _error_base_key(ValidationError(), "reservation")
        == "reservation_validation_failed"
    )
    assert (
        _error_base_key(ProviderError(), "reservation") == "reservation_provider_failed"
    )
    assert (
        _error_base_key(PyCityVisitorParkingError(), "reservation")
        == "reservation_operation_failed"
    )


def test_error_key_helpers() -> None:
    """Error key helpers should add detail suffixes."""

    err = PyCityVisitorParkingError()
    assert _reservation_error_key(err, True).endswith("_detail")
    assert not _reservation_error_key(err, False).endswith("_detail")
    assert _favorite_error_key(err, True).endswith("_detail")
    assert not _favorite_error_key(err, False).endswith("_detail")


def test_raise_error_helpers() -> None:
    """Raise helpers should produce HomeAssistantError."""

    err = PyCityVisitorParkingError()
    err.detail = "Detail"
    with pytest.raises(HomeAssistantError):
        _raise_reservation_error(err)

    err = PyCityVisitorParkingError()
    err.user_message = "Message"
    with pytest.raises(HomeAssistantError):
        _raise_favorite_error(err)


def test_is_not_supported_and_update_fields(hass) -> None:
    """Support helpers should normalize provider data."""

    assert _is_not_supported(ProviderError("not supported"))
    assert not _is_not_supported(ProviderError("boom"))

    entry, _device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = None
    assert _reservation_update_fields(entry.runtime_data) == []


async def test_service_list_active_reservations_response(hass) -> None:
    """List active reservations should return normalized data."""

    await async_setup_services(hass)

    entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_START_TIME, ATTR_END_TIME]

    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)
    active_reservation = Reservation(
        reservation_id="res1",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        license_plate="AB-1234",
    )
    future_reservation = Reservation(
        reservation_id="res2",
        start_time=now + timedelta(hours=2),
        end_time=now + timedelta(hours=3),
        license_plate="CD5678",
    )
    past_reservation = Reservation(
        reservation_id="res3",
        start_time=now - timedelta(hours=3),
        end_time=now - timedelta(hours=2),
        license_plate="EF9999",
    )
    data = CoordinatorData(
        permit_id="permit1",
        permit_remaining_minutes=0,
        zone_validity=[],
        reservations=[active_reservation, future_reservation, past_reservation],
        favorites=[
            Favorite(favorite_id="fav1", license_plate="AB1234", name="Ada"),
        ],
        zone_availability=ZoneAvailability(
            is_chargeable_now=True,
            next_change_time=None,
            windows_today=[],
        ),
        active_reservations=[active_reservation],
    )
    entry.runtime_data.coordinator.data = data
    entry.runtime_data.coordinator.last_update_success = True
    entry.runtime_data.coordinator.config_entry = entry

    with freeze_time(now):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_ACTIVE_RESERVATIONS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )

    assert response["count"] == 2
    assert response["active_count"] == 1
    assert response["future_count"] == 1
    assert response["stale"] is False
    assert set(response["reservation_update_fields"]) == {
        ATTR_START_TIME,
        ATTR_END_TIME,
    }
    reservations = response["active_reservations"]
    assert len(reservations) == 2
    active_payload = next(
        item for item in reservations if item[ATTR_RESERVATION_ID] == "res1"
    )
    assert active_payload[ATTR_LICENSE_PLATE] == "AB-1234"
    assert active_payload[ATTR_FAVORITE_ID] == "fav1"
    assert active_payload["favorite_name"] == "Ada"


async def test_service_list_active_reservations_stale(hass) -> None:
    """List active reservations should mark stale on failed refresh."""

    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)
    data = CoordinatorData(
        permit_id="permit1",
        permit_remaining_minutes=0,
        zone_validity=[],
        reservations=[
            Reservation(
                reservation_id="res1",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=1),
            )
        ],
        favorites=[],
        zone_availability=ZoneAvailability(
            is_chargeable_now=True,
            next_change_time=None,
            windows_today=[],
        ),
        active_reservations=[],
    )
    entry.runtime_data.coordinator.data = data
    entry.runtime_data.coordinator.last_update_success = False
    entry.runtime_data.coordinator.last_exception = RuntimeError("refresh failed")
    entry.runtime_data.coordinator.config_entry = entry

    with freeze_time(now):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_ACTIVE_RESERVATIONS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )

    assert response["stale"] is True


async def test_service_list_favorites_response(hass) -> None:
    """List favorites should return normalized favorites."""

    await async_setup_services(hass)

    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.list_favorites.return_value = [
        {"id": "fav1", "license_plate": "AA1234", "name": "Car"},
        {"license_plate": "BB9999"},
        SimpleNamespace(name="Ignored"),
    ]

    response = await hass.services.async_call(
        DOMAIN,
        SERVICE_LIST_FAVORITES,
        {ATTR_DEVICE_ID: device.id},
        blocking=True,
        return_response=True,
    )

    assert response["count"] == 2
    favorites = response["favorites"]
    assert favorites[0][ATTR_FAVORITE_ID] == "fav1"
    assert favorites[0][ATTR_LICENSE_PLATE] == "AA1234"
    assert favorites[0][ATTR_NAME] == "Car"
    assert favorites[1][ATTR_FAVORITE_ID] == ""
    assert favorites[1][ATTR_LICENSE_PLATE] == "BB9999"


async def test_service_invalid_device_target(hass) -> None:
    """Service calls should reject unknown devices."""

    await async_setup_services(hass)

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_END_RESERVATION,
            {
                ATTR_DEVICE_ID: "missing",
                ATTR_RESERVATION_ID: "res1",
            },
            blocking=True,
        )


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
        operating_time_overrides={},
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
