"""Tests for City visitor parking services."""

from __future__ import annotations

import logging
from dataclasses import replace
from datetime import UTC, datetime, time, timedelta
from types import SimpleNamespace
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest
from freezegun import freeze_time
from homeassistant import config_entries
from homeassistant.const import ATTR_DEVICE_ID
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import device_registry as dr
from homeassistant.util import dt as dt_util
from pycityvisitorparking import AuthError, NetworkError, ProviderError, ValidationError
from pycityvisitorparking.exceptions import (
    ErrorCode,
    NotFoundError,
    PyCityVisitorParkingError,
    RateLimitError,
    ServiceUnavailableError,
)
from pycityvisitorparking.exceptions import TimeoutError as LibraryTimeoutError
from pytest_homeassistant_custom_component.common import (  # type: ignore[import-untyped]
    MockConfigEntry,
)

from custom_components.city_visitor_parking.const import (
    ATTR_END_TIME,
    ATTR_FAVORITE_ID,
    ATTR_LICENSE_PLATE,
    ATTR_NAME,
    ATTR_PARKING_AREA_ID,
    ATTR_RESERVATION_ID,
    ATTR_START_TIME,
    CONF_AUTO_END,
    DOMAIN,
)
from custom_components.city_visitor_parking.models import (
    AutoEndState,
    Balance,
    CoordinatorData,
    Favorite,
    PaidParkingStatus,
    ParkingArea,
    ProviderConfig,
    Reservation,
    TimeRange,
)
from custom_components.city_visitor_parking.payloads import reservation_update_fields
from custom_components.city_visitor_parking.runtime_data import (
    CityVisitorParkingRuntimeData,
)
from custom_components.city_visitor_parking.services import (
    SERVICE_ADD_FAVORITE,
    SERVICE_END_RESERVATION,
    SERVICE_GET_ENTRY_INFO,
    SERVICE_GET_STATUS,
    SERVICE_LIST_FAVORITES,
    SERVICE_LIST_RESERVATIONS,
    SERVICE_REMOVE_FAVORITE,
    SERVICE_START_RESERVATION,
    SERVICE_UPDATE_FAVORITE,
    SERVICE_UPDATE_RESERVATION,
    _error_base_key,
    _error_detail,
    _fallback_update_favorite,
    _favorite_error_key,
    _is_not_supported,
    _raise_favorite_error,
    _raise_reservation_error,
    _reservation_error_key,
    async_setup_services,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable
    from types import ModuleType

    from homeassistant.core import HomeAssistant
    from pytest import LogCaptureFixture, MonkeyPatch

EXPECTED_COUNT = 2
EXPECTED_REMAINING_MINUTES = 90
# Attempts of a reservation start: the first one plus two retries.
MAX_START_ATTEMPTS = 3
SECOND_ATTEMPT = 2


@pytest.fixture(autouse=True)
def _no_start_retry_delay(monkeypatch: MonkeyPatch) -> None:
    """Retry reservation starts without waiting."""
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.services.START_RESERVATION_RETRY_DELAYS",
        (0.0, 0.0),
    )


def _provider_reservation(
    reservation_id: str,
    start: datetime,
    end: datetime,
    license_plate: str = "AB1234",
) -> dict[str, object]:
    """Return a reservation as the library returns it."""
    return {
        "id": reservation_id,
        "license_plate": license_plate,
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
    }


async def _start_reservation(
    hass: HomeAssistant, device_id: str, start: datetime, end: datetime
) -> dict[str, object]:
    """Call start_reservation and return its response."""
    response = await hass.services.async_call(
        DOMAIN,
        SERVICE_START_RESERVATION,
        {
            ATTR_DEVICE_ID: device_id,
            ATTR_START_TIME: start,
            ATTR_END_TIME: end,
            ATTR_LICENSE_PLATE: "AB-12-34",
        },
        blocking=True,
        return_response=True,
    )
    assert response is not None
    return dict(response)


@pytest.mark.parametrize(
    ("start_offset", "status"),
    [(timedelta(seconds=-30), "active"), (timedelta(hours=2), "planned")],
)
async def test_start_reservation_returns_the_confirmed_reservation(
    hass: HomeAssistant, start_offset: timedelta, status: str
) -> None:
    """The response holds the provider's times and whether it runs already."""
    await async_setup_services(hass)
    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    now = dt_util.utcnow().replace(microsecond=0)
    start = now + start_offset
    end = start + timedelta(hours=1)
    provider.start_reservation.return_value = _provider_reservation(
        "res-new", start, end
    )

    response = await _start_reservation(hass, device.id, start, end)

    assert response == {
        "reservation_id": "res-new",
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "status": status,
        "attempts": 1,
    }


async def test_start_reservation_rejection_is_not_retried(
    hass: HomeAssistant,
) -> None:
    """A provider refusal proves nothing was booked: no check, no retry."""
    await async_setup_services(hass)
    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.start_reservation.side_effect = ProviderError(
        "refused", error_code=ErrorCode.PROVIDER_REJECTED, detail="No balance left"
    )
    start = dt_util.utcnow()

    with pytest.raises(HomeAssistantError) as err:
        await _start_reservation(hass, device.id, start, start + timedelta(hours=1))

    assert err.value.translation_key == "reservation_start_rejected_detail"
    assert err.value.translation_placeholders == {"detail": "No balance left"}
    provider.start_reservation.assert_awaited_once()
    provider.list_reservations.assert_not_awaited()


async def test_start_reservation_booked_despite_error_is_not_retried(
    hass: HomeAssistant,
) -> None:
    """A time-out after which the reservation exists counts as started."""
    await async_setup_services(hass)
    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    start = dt_util.utcnow().replace(microsecond=0)
    end = start + timedelta(hours=1)
    provider.start_reservation.side_effect = LibraryTimeoutError("time-out")
    # The provider rounded the start down to the minute and stored the plate
    # without dashes.
    provider.list_reservations.return_value = [
        _provider_reservation("res-booked", start.replace(second=0), end)
    ]

    response = await _start_reservation(hass, device.id, start, end)

    assert response["reservation_id"] == "res-booked"
    assert response["attempts"] == 1
    provider.start_reservation.assert_awaited_once()


async def test_start_reservation_retried_when_nothing_was_booked(
    hass: HomeAssistant,
) -> None:
    """An unknown failure is retried after the check finds no reservation.

    Reservations known before the start, and those for another plate or other
    times, do not count as booked.
    """
    await async_setup_services(hass)
    entry, device, provider = _create_entry_with_device(hass, "permit1")
    start = dt_util.utcnow().replace(microsecond=0)
    end = start + timedelta(hours=1)
    coordinator = entry.runtime_data.coordinator
    coordinator.data = replace(
        coordinator.data,
        reservations=(
            Reservation(
                reservation_id="res-known",
                start_time=start,
                end_time=end,
                license_plate="AB1234",
            ),
        ),
    )
    provider.list_reservations.return_value = [
        _provider_reservation("res-known", start, end),
        _provider_reservation("res-other-plate", start, end, "XY9876"),
        _provider_reservation("res-other-end", start, end + timedelta(hours=1)),
    ]
    provider.start_reservation.side_effect = [
        NetworkError("connection reset"),
        _provider_reservation("res-new", start, end),
    ]

    response = await _start_reservation(hass, device.id, start, end)

    assert response["reservation_id"] == "res-new"
    assert response["attempts"] == SECOND_ATTEMPT
    assert provider.start_reservation.await_count == SECOND_ATTEMPT


async def test_start_reservation_fails_after_three_attempts(
    hass: HomeAssistant, caplog: LogCaptureFixture
) -> None:
    """Three unknown failures without a booked reservation end in a clear error."""
    await async_setup_services(hass)
    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.start_reservation.side_effect = NetworkError("connection reset")
    provider.list_reservations.return_value = []
    start = dt_util.utcnow()

    with pytest.raises(HomeAssistantError) as err:
        await _start_reservation(hass, device.id, start, start + timedelta(hours=1))

    assert err.value.translation_key == "reservation_start_failed"
    assert err.value.translation_placeholders == {"attempts": "3"}
    assert provider.start_reservation.await_count == MAX_START_ATTEMPTS
    assert "failed after 3 attempts" in caplog.text
    # The plate never reaches the log.
    assert "AB-12-34" not in caplog.text
    assert "AB1234" not in caplog.text


async def test_start_reservation_unknown_when_the_check_fails(
    hass: HomeAssistant,
) -> None:
    """Without a working check the start is never repeated."""
    await async_setup_services(hass)
    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.start_reservation.side_effect = NetworkError("connection reset")
    provider.list_reservations.side_effect = NetworkError("still down")
    start = dt_util.utcnow()

    with pytest.raises(HomeAssistantError) as err:
        await _start_reservation(hass, device.id, start, start + timedelta(hours=1))

    assert err.value.translation_key == "reservation_start_unknown"
    provider.start_reservation.assert_awaited_once()


def _override_range_for_day(now: datetime, start: time, end: time) -> TimeRange:
    """Build the UTC range produced by a local-time override on the current day."""
    local_now = dt_util.as_local(now)
    start_local = datetime.combine(local_now.date(), start, tzinfo=local_now.tzinfo)
    end_local = datetime.combine(local_now.date(), end, tzinfo=local_now.tzinfo)
    return TimeRange(
        start=dt_util.as_utc(start_local),
        end=dt_util.as_utc(end_local),
    )


async def test_service_routing_targets_single_entry(hass: HomeAssistant) -> None:
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


async def test_service_validation_errors(hass: HomeAssistant) -> None:
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


async def test_update_reservation_fallback(hass: HomeAssistant) -> None:
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


def _with_current_reservation(
    entry: MockConfigEntry, start: datetime, end: datetime
) -> Reservation:
    """Put a known reservation with a parking area in the coordinator data."""
    current = Reservation(
        reservation_id="res1",
        start_time=start,
        end_time=end,
        license_plate="AB1234",
        parking_area_id="630",
    )
    entry.runtime_data.coordinator.data = replace(
        _coordinator_data("permit1", (_parking_area("10"), _parking_area("630"))),
        reservations=(current,),
    )
    return current


async def test_update_reservation_new_plate_replaces_start_first(
    hass: HomeAssistant,
) -> None:
    """A new plate starts the replacement in the same area, then ends the old one.

    Times that are not given come from the current reservation.
    """
    await async_setup_services(hass)
    entry, device, provider = _create_entry_with_device(hass, "permit1")
    start = datetime.now(UTC) - timedelta(minutes=10)
    current = _with_current_reservation(entry, start, start + timedelta(hours=1))
    calls: list[str] = []
    started = provider.start_reservation.return_value

    def record_start(**_: object) -> object:
        calls.append("start")
        return started

    def record_end(*_: object) -> None:
        calls.append("end")

    provider.start_reservation.side_effect = record_start
    provider.end_reservation.side_effect = record_end
    new_end = current.end_time + timedelta(hours=1)

    response = await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_RESERVATION,
        {
            ATTR_DEVICE_ID: device.id,
            ATTR_RESERVATION_ID: "res1",
            ATTR_END_TIME: new_end,
            ATTR_LICENSE_PLATE: "XY-99-ZZ",
        },
        blocking=True,
        return_response=True,
    )

    assert calls == ["start", "end"]
    provider.start_reservation.assert_awaited_once_with(
        license_plate="XY-99-ZZ",
        start_time=current.start_time,
        end_time=new_end,
        reservation_target_id="630",
    )
    assert provider.end_reservation.await_args.args[0] == "res1"
    assert response is not None
    assert response["reservation_id"] == "res-new"


async def test_update_reservation_refused_replacement_keeps_the_reservation(
    hass: HomeAssistant,
) -> None:
    """A refused start for a new plate leaves the current reservation alone."""
    await async_setup_services(hass)
    entry, device, provider = _create_entry_with_device(hass, "permit1")
    start = datetime.now(UTC) + timedelta(hours=1)
    _with_current_reservation(entry, start, start + timedelta(hours=1))
    provider.start_reservation.side_effect = ProviderError(
        "Time slot is overbooked.", error_code=ErrorCode.PROVIDER_REJECTED
    )

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_LICENSE_PLATE: "XY-99-ZZ",
            },
            blocking=True,
        )

    provider.end_reservation.assert_not_awaited()


async def test_update_reservation_with_the_current_plate_updates_in_place(
    hass: HomeAssistant,
) -> None:
    """Repeating the current plate with a new end time is no replacement."""
    await async_setup_services(hass)
    entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_END_TIME]
    start = datetime.now(UTC)
    current = _with_current_reservation(entry, start, start + timedelta(hours=1))
    new_end = current.end_time + timedelta(hours=1)

    await hass.services.async_call(
        DOMAIN,
        SERVICE_UPDATE_RESERVATION,
        {
            ATTR_DEVICE_ID: device.id,
            ATTR_RESERVATION_ID: "res1",
            ATTR_END_TIME: new_end,
            ATTR_LICENSE_PLATE: "ab-12-34",
        },
        blocking=True,
    )

    provider.update_reservation.assert_awaited_once_with(
        reservation_id="res1", start_time=None, end_time=new_end
    )
    provider.start_reservation.assert_not_awaited()
    provider.end_reservation.assert_not_awaited()


async def test_update_reservation_success(hass: HomeAssistant) -> None:
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


async def test_update_favorite_fallback(hass: HomeAssistant) -> None:
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


async def test_update_reservation_provider_error(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
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


async def test_update_reservation_validation_error(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
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


async def test_service_end_reservation_calls_provider(hass: HomeAssistant) -> None:
    """End reservation should call the provider once."""
    await async_setup_services(hass)

    entry, device, provider = _create_entry_with_device(hass, "permit1")
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
    entry.runtime_data.coordinator.async_refresh.assert_awaited_once()


async def test_service_add_and_remove_favorite(hass: HomeAssistant) -> None:
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


async def test_service_start_reservation_passes_past_start(
    hass: HomeAssistant,
) -> None:
    """A start in the past means "start now" and is left to the library."""
    await async_setup_services(hass)

    entry, device, provider = _create_entry_with_device(hass, "permit1")
    now = datetime(2025, 1, 1, 12, 0, 30, tzinfo=UTC)
    # The card sends the current minute, which is already in the past.
    start = now.replace(second=0)
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

    provider.start_reservation.assert_awaited_once_with(
        license_plate="AB1234",
        start_time=start,
        end_time=end,
    )
    entry.runtime_data.coordinator.async_refresh.assert_awaited_once()


async def test_service_start_reservation_rejects_end_in_past(
    hass: HomeAssistant,
) -> None:
    """An end that is not after the effective start is rejected up front."""
    await async_setup_services(hass)

    _entry, device, provider = _create_entry_with_device(hass, "permit1")
    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)

    with freeze_time(now), pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_START_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_START_TIME: now - timedelta(minutes=30),
                ATTR_END_TIME: now - timedelta(minutes=10),
                ATTR_LICENSE_PLATE: "AB1234",
            },
            blocking=True,
        )

    provider.start_reservation.assert_not_awaited()


async def test_service_start_reservation_error(
    hass: HomeAssistant,
    pv_library: ModuleType,
    monkeypatch: MonkeyPatch,
    caplog: LogCaptureFixture,
) -> None:
    """A start failure that is not retried logs the versions for support."""
    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.start_reservation.side_effect = pv_library.AuthError("boom")
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.services.async_get_versions",
        AsyncMock(return_value=("1.2.3", "4.5.6")),
    )

    start = datetime.now(UTC)
    end = start + timedelta(hours=1)

    with (
        caplog.at_level(
            logging.DEBUG, logger="custom_components.city_visitor_parking.services"
        ),
        pytest.raises(HomeAssistantError),
    ):
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
    assert "hacvp" in caplog.text
    assert "1.2.3" in caplog.text


async def test_update_reservation_requires_full_details(
    hass: HomeAssistant,
) -> None:
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


async def test_update_reservation_unsupported_fields(hass: HomeAssistant) -> None:
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


async def test_update_reservation_unsupported_end_time(
    hass: HomeAssistant,
) -> None:
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


async def test_update_reservation_not_supported_falls_back(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
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


async def test_service_list_reservations_failure(
    hass: HomeAssistant,
) -> None:
    """List reservations should fail when refresh has no data."""
    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    entry.runtime_data.coordinator.async_refresh = AsyncMock(
        side_effect=RuntimeError("boom")
    )
    entry.runtime_data.coordinator.data = None

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_RESERVATIONS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )


async def test_service_list_favorites_error(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
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


async def test_service_end_reservation_error(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
    """End reservation errors should raise HomeAssistantError."""
    await async_setup_services(hass)

    entry, device, provider = _create_entry_with_device(hass, "permit1")
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
    # A failed write must not trigger a refresh.
    entry.runtime_data.coordinator.async_refresh.assert_not_awaited()


async def test_service_add_favorite_error(
    hass: HomeAssistant,
    monkeypatch: MonkeyPatch,
    caplog: LogCaptureFixture,
) -> None:
    """Add favorite errors should raise HomeAssistantError."""
    await async_setup_services(hass)

    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.add_favorite.side_effect = TypeError("boom")
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.services.async_get_versions",
        AsyncMock(return_value=("1.2.3", "4.5.6")),
    )

    with (
        caplog.at_level(
            logging.DEBUG, logger="custom_components.city_visitor_parking.services"
        ),
        pytest.raises(HomeAssistantError),
    ):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_ADD_FAVORITE,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_LICENSE_PLATE: "AB1234",
            },
            blocking=True,
        )
    assert "hacvp" in caplog.text
    assert "1.2.3" in caplog.text


async def test_service_update_favorite_requires_changes(
    hass: HomeAssistant,
) -> None:
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


async def test_service_update_favorite_provider_error(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
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


async def test_service_update_favorite_type_error(hass: HomeAssistant) -> None:
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


async def test_service_remove_favorite_error(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
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


async def test_service_list_reservations_last_update_failure(
    hass: HomeAssistant,
) -> None:
    """List reservations should fail when last update failed."""
    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    entry.runtime_data.coordinator.last_update_success = False
    entry.runtime_data.coordinator.last_exception = RuntimeError("boom")
    entry.runtime_data.coordinator.data = None

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_RESERVATIONS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )


async def test_service_invalid_entry_domain(hass: HomeAssistant) -> None:
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


async def test_service_invalid_entry_state(hass: HomeAssistant) -> None:
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


async def test_fallback_update_reservation_error(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
    """A replacement whose old reservation cannot be ended reports that clearly.

    The coordinator is refreshed first, so the new reservation is shown.
    """
    await async_setup_services(hass)
    entry, device, provider = _create_entry_with_device(hass, "permit1")
    start = datetime.now(UTC)
    _with_current_reservation(entry, start, start + timedelta(hours=1))
    provider.end_reservation.side_effect = pv_library.ProviderError("boom")

    with pytest.raises(HomeAssistantError) as exc_info:
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_LICENSE_PLATE: "XY-99-ZZ",
            },
            blocking=True,
        )

    assert exc_info.value.translation_key == "reservation_replace_end_failed"
    provider.start_reservation.assert_awaited_once()
    entry.runtime_data.coordinator.async_refresh.assert_awaited_once()


async def test_update_reservation_unknown_id_ends_before_starting(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
    """A reservation missing from the data is ended first, so nothing is booked."""
    await async_setup_services(hass)
    _, device, provider = _create_entry_with_device(hass, "permit1")
    provider.end_reservation.side_effect = pv_library.ProviderError("not found")
    start = datetime.now(UTC)

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "typo",
                ATTR_START_TIME: start,
                ATTR_END_TIME: start + timedelta(hours=1),
                ATTR_LICENSE_PLATE: "XY-99-ZZ",
            },
            blocking=True,
        )

    provider.start_reservation.assert_not_awaited()


async def test_update_reservation_failed_start_after_end_reports_it(
    hass: HomeAssistant,
) -> None:
    """A start that fails after the old reservation ended says the old one is gone.

    The coordinator is refreshed first, so the ended reservation disappears.
    """
    await async_setup_services(hass)
    entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_END_TIME]
    provider.update_reservation.side_effect = NotImplementedError
    start = datetime.now(UTC)
    current = _with_current_reservation(entry, start, start + timedelta(hours=1))
    provider.start_reservation.side_effect = ProviderError(
        "Time slot is overbooked.", error_code=ErrorCode.PROVIDER_REJECTED
    )

    with pytest.raises(HomeAssistantError) as exc_info:
        await hass.services.async_call(
            DOMAIN,
            SERVICE_UPDATE_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_RESERVATION_ID: "res1",
                ATTR_END_TIME: current.end_time + timedelta(hours=1),
            },
            blocking=True,
        )

    assert exc_info.value.translation_key == "reservation_replace_start_failed"
    provider.end_reservation.assert_awaited_once()
    entry.runtime_data.coordinator.async_refresh.assert_awaited_once()


async def test_fallback_update_favorite_validation_error(
    hass: HomeAssistant,
) -> None:
    """Fallback update favorite should require a license plate."""
    entry, _device, _provider = _create_entry_with_device(hass, "permit1")

    with pytest.raises(ServiceValidationError):
        await _fallback_update_favorite(entry.runtime_data, "fav1", None, None)


async def test_fallback_update_favorite_error(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Fallback update favorite errors should raise HomeAssistantError."""
    entry, _device, provider = _create_entry_with_device(hass, "permit1")
    provider.add_favorite.side_effect = TypeError("boom")
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.services.async_get_versions",
        AsyncMock(return_value=("1.2.3", "4.5.6")),
    )

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
    err.detail = "Detail"
    assert _error_detail(err) == "Detail"

    assert _error_detail(PyCityVisitorParkingError()) is None


@pytest.mark.parametrize(
    ("error_code", "expected"),
    [
        (ErrorCode.AUTH_ERROR, "reservation_auth_failed"),
        (ErrorCode.NETWORK_ERROR, "reservation_network_failed"),
        (ErrorCode.VALIDATION_ERROR, "reservation_validation_failed"),
        (ErrorCode.PROVIDER_ERROR, "reservation_provider_failed"),
    ],
)
def test_error_base_key_with_error_code(error_code: ErrorCode, expected: str) -> None:
    """Error codes should map to reservation keys."""
    err = PyCityVisitorParkingError()
    err.error_code = error_code
    assert _error_base_key(err, "reservation") == expected


@pytest.mark.parametrize(
    ("err", "expected"),
    [
        (LibraryTimeoutError(), "reservation_network_failed"),
        (RateLimitError(), "reservation_provider_failed"),
        (ServiceUnavailableError(), "reservation_provider_failed"),
        (NotFoundError(), "reservation_provider_failed"),
    ],
)
def test_error_base_key_with_specific_error_codes(
    err: PyCityVisitorParkingError, expected: str
) -> None:
    """Specific library errors fall back to their base exception key."""
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
    with pytest.raises(HomeAssistantError):
        _raise_favorite_error(err)


def test_is_not_supported_and_update_fields(hass: HomeAssistant) -> None:
    """Support helpers should normalize provider data."""
    assert _is_not_supported(ProviderError("not supported"))
    assert not _is_not_supported(ProviderError("boom"))

    _entry, _device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = None
    assert reservation_update_fields(provider) == []


async def test_service_list_reservations_response(
    hass: HomeAssistant,
) -> None:
    """List reservations should return normalized data."""
    await async_setup_services(hass)

    entry, device, provider = _create_entry_with_device(hass, "permit1")
    provider.reservation_update_fields = [ATTR_START_TIME, ATTR_END_TIME]

    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)
    active_reservation = Reservation(
        reservation_id="res1",
        start_time=now - timedelta(hours=1),
        end_time=now + timedelta(hours=1),
        license_plate="AB-1234",
        parking_area_id="630",
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
        balances=(),
        paid_hours=(),
        reservations=(active_reservation, future_reservation, past_reservation),
        favorites=(Favorite(favorite_id="fav1", license_plate="AB1234", name="Ada"),),
        paid_parking_status=PaidParkingStatus(
            is_paid_now=True,
            next_change_time=None,
            windows_today=(),
        ),
        active_reservations=(active_reservation,),
        parking_areas=(
            _parking_area("10"),
            ParkingArea(
                parking_area_id="630",
                name="Centrum",
                paid_hours=(),
                paid_parking_status=_FREE,
            ),
        ),
    )
    entry.runtime_data.coordinator.data = data
    entry.runtime_data.coordinator.last_update_success = True
    entry.runtime_data.coordinator.config_entry = entry

    with freeze_time(now):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_RESERVATIONS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )

    assert response["count"] == EXPECTED_COUNT
    assert response["active_count"] == 1
    assert response["future_count"] == 1
    assert response["stale"] is False
    assert set(response["reservation_update_fields"]) == {
        ATTR_START_TIME,
        ATTR_END_TIME,
    }
    reservations = response["reservations"]
    assert response["active_reservations"] == reservations
    assert len(reservations) == EXPECTED_COUNT
    active_payload = next(
        item for item in reservations if item[ATTR_RESERVATION_ID] == "res1"
    )
    assert active_payload[ATTR_LICENSE_PLATE] == "AB-1234"
    assert active_payload[ATTR_FAVORITE_ID] == "fav1"
    assert active_payload["favorite_name"] == "Ada"
    assert active_payload["parking_area_id"] == "630"
    assert active_payload["parking_area_name"] == "Centrum"
    future_payload = next(
        item for item in reservations if item[ATTR_RESERVATION_ID] == "res2"
    )
    assert "parking_area_id" not in future_payload
    assert "parking_area_name" not in future_payload


async def test_service_list_reservations_stale(hass: HomeAssistant) -> None:
    """List reservations should mark stale on failed refresh."""
    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)
    data = CoordinatorData(
        permit_id="permit1",
        balances=(),
        paid_hours=(),
        reservations=(
            Reservation(
                reservation_id="res1",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=1),
            ),
        ),
        favorites=(),
        paid_parking_status=PaidParkingStatus(
            is_paid_now=True,
            next_change_time=None,
            windows_today=(),
        ),
        active_reservations=(),
    )
    entry.runtime_data.coordinator.data = data
    entry.runtime_data.coordinator.last_update_success = False
    entry.runtime_data.coordinator.last_exception = RuntimeError("refresh failed")
    entry.runtime_data.coordinator.config_entry = entry

    with freeze_time(now):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_LIST_RESERVATIONS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )

    assert response["stale"] is True


async def test_service_get_status_response(hass: HomeAssistant) -> None:
    """Get status should return effective and provider windows."""
    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(
        hass,
        "permit1",
        options={
            "operating_time_overrides": {
                "mon": [{"start": "11:00", "end": "12:00"}],
            },
            CONF_AUTO_END: True,
        },
    )
    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)

    provider_range = TimeRange(
        start=datetime(2025, 1, 6, 9, 0, tzinfo=UTC),
        end=datetime(2025, 1, 6, 17, 0, tzinfo=UTC),
    )
    effective_range = _override_range_for_day(now, time(11, 0), time(12, 0))
    entry.runtime_data.coordinator.data = CoordinatorData(
        permit_id="permit1",
        balances=(Balance(kind="time", amount=90, unit=None),),
        paid_hours=(provider_range,),
        reservations=(),
        favorites=(),
        paid_parking_status=PaidParkingStatus(
            is_paid_now=False,
            next_change_time=effective_range.start,
            windows_today=(effective_range,),
        ),
        active_reservations=(),
    )
    entry.runtime_data.coordinator.last_update_success = True
    entry.runtime_data.coordinator.config_entry = entry

    with freeze_time(now):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_GET_STATUS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )

    assert response["state"] == "free"
    assert response["is_paid_now"] is False
    assert response["window_kind"] == "next"
    assert response["permit_id"] == "permit1"
    assert response["balances"] == [
        {"amount": EXPECTED_REMAINING_MINUTES, "unit": None, "kind": "time"}
    ]
    assert response["stale"] is False
    assert response["provider_windows_today"] == [
        {
            "start": "2025-01-06T09:00:00+00:00",
            "end": "2025-01-06T17:00:00+00:00",
        }
    ]
    assert response["effective_windows_today"] == [
        {
            "start": effective_range.start.isoformat(),
            "end": effective_range.end.isoformat(),
        }
    ]


async def test_service_get_status_stale(hass: HomeAssistant) -> None:
    """Get status should mark stale on failed refresh with cached data."""
    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)

    window = TimeRange(
        start=now - timedelta(hours=1),
        end=now + timedelta(hours=1),
    )
    entry.runtime_data.coordinator.data = CoordinatorData(
        permit_id="permit1",
        balances=(Balance(kind="time", amount=30, unit=None),),
        paid_hours=(window,),
        reservations=(),
        favorites=(),
        paid_parking_status=PaidParkingStatus(
            is_paid_now=True,
            next_change_time=window.end,
            windows_today=(window,),
        ),
        active_reservations=(),
    )
    entry.runtime_data.coordinator.last_update_success = False
    entry.runtime_data.coordinator.last_exception = RuntimeError("boom")
    entry.runtime_data.coordinator.config_entry = entry

    with freeze_time(now):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_GET_STATUS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )

    assert response["stale"] is True


async def test_service_get_status_stale_recomputes_consistent_windows(
    hass: HomeAssistant,
) -> None:
    """Get status should recompute stale availability from the cached snapshot."""
    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(
        hass,
        "permit1",
        options={
            "operating_time_overrides": {
                "mon": [{"start": "11:00", "end": "12:00"}],
            }
        },
    )
    now = datetime(2025, 1, 6, 10, 30, tzinfo=UTC)
    effective_range = _override_range_for_day(now, time(11, 0), time(12, 0))

    provider_range = TimeRange(
        start=datetime(2025, 1, 6, 9, 0, tzinfo=UTC),
        end=datetime(2025, 1, 6, 17, 0, tzinfo=UTC),
    )
    stale_effective_range = TimeRange(
        start=datetime(2025, 1, 6, 8, 0, tzinfo=UTC),
        end=datetime(2025, 1, 6, 9, 0, tzinfo=UTC),
    )
    entry.runtime_data.coordinator.data = CoordinatorData(
        permit_id="permit1",
        balances=(Balance(kind="time", amount=45, unit=None),),
        paid_hours=(provider_range,),
        reservations=(),
        favorites=(),
        paid_parking_status=PaidParkingStatus(
            is_paid_now=True,
            next_change_time=stale_effective_range.end,
            windows_today=(stale_effective_range,),
        ),
        active_reservations=(),
    )
    entry.runtime_data.coordinator.last_update_success = False
    entry.runtime_data.coordinator.last_exception = RuntimeError("boom")
    entry.runtime_data.coordinator.config_entry = entry

    with freeze_time(now):
        response = await hass.services.async_call(
            DOMAIN,
            SERVICE_GET_STATUS,
            {ATTR_DEVICE_ID: device.id},
            blocking=True,
            return_response=True,
        )

    assert response["stale"] is True
    assert response["state"] == "free"
    assert response["is_paid_now"] is False
    assert response["window_kind"] == "next"
    assert response["next_change_time"] == effective_range.start.isoformat()
    assert response["effective_windows_today"] == [
        {
            "start": effective_range.start.isoformat(),
            "end": effective_range.end.isoformat(),
        }
    ]


async def test_service_get_entry_info_response(hass: HomeAssistant) -> None:
    """Get entry info should return non-sensitive metadata."""
    await async_setup_services(hass)

    _entry, device, provider = _create_entry_with_device(
        hass,
        "permit1",
        options={CONF_AUTO_END: True},
    )
    provider.reservation_update_fields = [ATTR_START_TIME, ATTR_END_TIME]

    response = await hass.services.async_call(
        DOMAIN,
        SERVICE_GET_ENTRY_INFO,
        {ATTR_DEVICE_ID: device.id},
        blocking=True,
        return_response=True,
    )

    assert response == {
        "permit_id": "permit1",
        "provider_id": "dvsportal",
        "municipality_name": "City",
        "auto_end_reservation_when_free": True,
        "reservation_update_fields": [ATTR_START_TIME, ATTR_END_TIME],
    }


async def test_service_list_favorites_response(hass: HomeAssistant) -> None:
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

    assert response["count"] == EXPECTED_COUNT
    favorites = response["favorites"]
    assert favorites[0][ATTR_FAVORITE_ID] == "fav1"
    assert favorites[0][ATTR_LICENSE_PLATE] == "AA1234"
    assert favorites[0][ATTR_NAME] == "Car"
    assert favorites[1][ATTR_FAVORITE_ID] == ""
    assert favorites[1][ATTR_LICENSE_PLATE] == "BB9999"


async def test_service_invalid_device_target(hass: HomeAssistant) -> None:
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


async def _call_through[T](operation: Callable[[], Awaitable[T]]) -> T:
    """Run a provider call without session recovery, like a healthy coordinator."""
    return await operation()


async def test_service_write_error_renews_session_without_retry(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
    """A failed write is reported once and only the next attempt gets a new session."""
    await async_setup_services(hass)

    entry, device, provider = _create_entry_with_device(hass, "permit1")
    error = pv_library.ProviderError("boom")
    provider.end_reservation.side_effect = error

    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_END_RESERVATION,
            {ATTR_DEVICE_ID: device.id, ATTR_RESERVATION_ID: "res1"},
            blocking=True,
        )

    # A retried write could be applied twice, so the provider is called once.
    provider.end_reservation.assert_awaited_once()
    entry.runtime_data.coordinator.async_renew_session.assert_awaited_once_with(error)


async def test_service_input_error_does_not_renew_session(
    hass: HomeAssistant,
) -> None:
    """Rejected input says nothing about the session."""
    await async_setup_services(hass)

    entry, device, _provider = _create_entry_with_device(hass, "permit1")
    start = dt_util.utcnow() + timedelta(hours=2)

    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN,
            SERVICE_START_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_LICENSE_PLATE: "AB1234",
                ATTR_START_TIME: start,
                ATTR_END_TIME: start - timedelta(hours=1),
            },
            blocking=True,
        )

    entry.runtime_data.coordinator.async_renew_session.assert_not_awaited()


def _coordinator_data(
    permit_id: str, parking_areas: tuple[ParkingArea, ...] = ()
) -> CoordinatorData:
    """Return empty coordinator data, optionally with selectable parking areas."""
    return CoordinatorData(
        permit_id=permit_id,
        balances=(),
        paid_hours=parking_areas[0].paid_hours if parking_areas else (),
        reservations=(),
        favorites=(),
        paid_parking_status=_FREE,
        active_reservations=(),
        parking_areas=parking_areas,
    )


_FREE = PaidParkingStatus(is_paid_now=False, next_change_time=None, windows_today=())


def _parking_area(parking_area_id: str) -> ParkingArea:
    """Return a selectable parking area without windows."""
    return ParkingArea(
        parking_area_id=parking_area_id,
        name=parking_area_id,
        paid_hours=(),
        paid_parking_status=_FREE,
    )


async def test_service_start_reservation_books_in_the_default_or_requested_parking_area(
    hass: HomeAssistant,
) -> None:
    """Without a parking area ID the default is booked; a known ID is passed on."""
    await async_setup_services(hass)
    entry, device, provider = _create_entry_with_device(hass, "permit1")
    entry.runtime_data.coordinator.data = _coordinator_data(
        "permit1", (_parking_area("630"), _parking_area("10"))
    )
    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)
    call = {
        ATTR_DEVICE_ID: device.id,
        ATTR_START_TIME: now + timedelta(hours=1),
        ATTR_END_TIME: now + timedelta(hours=2),
        ATTR_LICENSE_PLATE: "AB1234",
    }

    with freeze_time(now):
        await hass.services.async_call(
            DOMAIN, SERVICE_START_RESERVATION, call, blocking=True
        )
        await hass.services.async_call(
            DOMAIN,
            SERVICE_START_RESERVATION,
            {**call, ATTR_PARKING_AREA_ID: "10"},
            blocking=True,
        )

    parking_areas = [
        c.kwargs["reservation_target_id"]
        for c in provider.start_reservation.await_args_list
    ]
    assert parking_areas == ["630", "10"]


async def test_service_start_reservation_rejects_unknown_parking_area(
    hass: HomeAssistant,
) -> None:
    """A parking area outside the permit fails before the provider is called."""
    await async_setup_services(hass)
    entry, device, provider = _create_entry_with_device(hass, "permit1")
    entry.runtime_data.coordinator.data = _coordinator_data(
        "permit1", (_parking_area("10"),)
    )
    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)

    with freeze_time(now), pytest.raises(ServiceValidationError) as excinfo:
        await hass.services.async_call(
            DOMAIN,
            SERVICE_START_RESERVATION,
            {
                ATTR_DEVICE_ID: device.id,
                ATTR_START_TIME: now + timedelta(hours=1),
                ATTR_END_TIME: now + timedelta(hours=2),
                ATTR_LICENSE_PLATE: "AB1234",
                ATTR_PARKING_AREA_ID: "999",
            },
            blocking=True,
        )

    assert excinfo.value.translation_key == "invalid_parking_area"
    provider.start_reservation.assert_not_awaited()


def _create_entry_with_device(
    hass: HomeAssistant, permit_id: str, options: dict[str, object] | None = None
) -> tuple[MockConfigEntry, dr.DeviceEntry, AsyncMock]:
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
        options=options or {},
    )
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    provider = AsyncMock()
    # A started reservation as the library confirms it.
    provider.start_reservation.return_value = _provider_reservation(
        "res-new",
        datetime(2030, 1, 1, 10, 0, tzinfo=UTC),
        datetime(2030, 1, 1, 11, 0, tzinfo=UTC),
    )
    coordinator = AsyncMock()
    coordinator.async_refresh = AsyncMock()
    coordinator.async_call_with_relogin = AsyncMock(side_effect=_call_through)
    coordinator.last_update_success = True
    coordinator.config_entry = entry
    coordinator.data = _coordinator_data(permit_id)

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
        free_dates="",
        free_weekdays=[],
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
