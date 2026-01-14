"""Service handlers for City visitor parking."""

from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Final

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import ATTR_DEVICE_ID
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import selector
from homeassistant.util import dt as dt_util
from homeassistant.util.json import JsonValueType
from pycityvisitorparking import ProviderError
from pycityvisitorparking.exceptions import (
    AuthError,
    NetworkError,
    PyCityVisitorParkingError,
    ValidationError,
)

from .const import (
    ATTR_END_TIME,
    ATTR_FAVORITE_ID,
    ATTR_LICENSE_PLATE,
    ATTR_NAME,
    ATTR_RESERVATION_ID,
    ATTR_START_TIME,
    CONF_PERMIT_ID,
    DOMAIN,
    LOGGER,
)
from .helpers import get_attr
from .models import CityVisitorParkingRuntimeData, Favorite, Reservation

SERVICE_START_RESERVATION: Final[str] = "start_reservation"
SERVICE_UPDATE_RESERVATION: Final[str] = "update_reservation"
SERVICE_END_RESERVATION: Final[str] = "end_reservation"
SERVICE_ADD_FAVORITE: Final[str] = "add_favorite"
SERVICE_UPDATE_FAVORITE: Final[str] = "update_favorite"
SERVICE_REMOVE_FAVORITE: Final[str] = "remove_favorite"
SERVICE_LIST_ACTIVE_RESERVATIONS: Final[str] = "list_active_reservations"
SERVICE_LIST_FAVORITES: Final[str] = "list_favorites"

DEVICE_SELECTOR: Final[selector.DeviceSelector] = selector.DeviceSelector(
    selector.DeviceSelectorConfig(integration=DOMAIN)
)


def _error_detail(err: PyCityVisitorParkingError) -> str | None:
    """Return a safe, user-facing detail message when available."""
    user_message = getattr(err, "user_message", None)
    if isinstance(user_message, str) and user_message:
        return user_message
    detail = getattr(err, "detail", None)
    if isinstance(detail, str) and detail:
        return detail
    return None


def _error_base_key(err: PyCityVisitorParkingError, prefix: str) -> str:
    """Return the base translation key for a failed provider operation."""
    error_code = getattr(err, "error_code", None)
    if error_code == "auth_error":
        suffix = "auth_failed"
    elif error_code == "network_error":
        suffix = "network_failed"
    elif error_code == "validation_error":
        suffix = "validation_failed"
    elif error_code == "provider_error":
        suffix = "provider_failed"
    elif isinstance(err, AuthError):
        suffix = "auth_failed"
    elif isinstance(err, NetworkError):
        suffix = "network_failed"
    elif isinstance(err, ValidationError):
        suffix = "validation_failed"
    elif isinstance(err, ProviderError):
        suffix = "provider_failed"
    else:
        suffix = "operation_failed"
    return f"{prefix}_{suffix}"


def _reservation_error_key(err: PyCityVisitorParkingError, detail_present: bool) -> str:
    """Return the translation key for a reservation failure."""
    base_key = _error_base_key(err, "reservation")
    if detail_present:
        return f"{base_key}_detail"
    return base_key


def _favorite_error_key(err: PyCityVisitorParkingError, detail_present: bool) -> str:
    """Return the translation key for a favorite failure."""
    base_key = _error_base_key(err, "favorite")
    if detail_present:
        return f"{base_key}_detail"
    return base_key


def _raise_reservation_error(err: PyCityVisitorParkingError) -> None:
    """Raise a translated Home Assistant error for reservation failures."""
    detail = _error_detail(err)
    LOGGER.debug("Reservation request failed: %s: %s", type(err).__name__, err)
    raise HomeAssistantError(
        translation_domain=DOMAIN,
        translation_key=_reservation_error_key(err, detail is not None),
        translation_placeholders={"detail": detail} if detail else None,
    ) from err


def _raise_favorite_error(err: PyCityVisitorParkingError) -> None:
    """Raise a translated Home Assistant error for favorite failures."""
    detail = _error_detail(err)
    LOGGER.debug("Favorite request failed: %s: %s", type(err).__name__, err)
    raise HomeAssistantError(
        translation_domain=DOMAIN,
        translation_key=_favorite_error_key(err, detail is not None),
        translation_placeholders={"detail": detail} if detail else None,
    ) from err


SERVICE_START_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_START_TIME): cv.datetime,
        vol.Required(ATTR_END_TIME): cv.datetime,
        vol.Required(ATTR_LICENSE_PLATE): cv.string,
    }
)

SERVICE_UPDATE_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_RESERVATION_ID): cv.string,
        vol.Optional(ATTR_START_TIME): cv.datetime,
        vol.Optional(ATTR_END_TIME): cv.datetime,
        vol.Optional(ATTR_LICENSE_PLATE): cv.string,
    }
)

SERVICE_END_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_RESERVATION_ID): cv.string,
    }
)

SERVICE_ADD_FAVORITE_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_LICENSE_PLATE): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
    }
)

SERVICE_UPDATE_FAVORITE_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_FAVORITE_ID): cv.string,
        vol.Optional(ATTR_LICENSE_PLATE): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
    }
)

SERVICE_REMOVE_FAVORITE_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_FAVORITE_ID): cv.string,
    }
)

SERVICE_LIST_ACTIVE_RESERVATIONS_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Optional("return_response"): cv.boolean,
    }
)

SERVICE_LIST_FAVORITES_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Optional("return_response"): cv.boolean,
    }
)


async def async_setup_services(hass: HomeAssistant) -> None:
    """Set up the services for the integration."""

    hass.services.async_register(
        DOMAIN,
        SERVICE_START_RESERVATION,
        _async_handle_start_reservation,
        schema=SERVICE_START_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_RESERVATION,
        _async_handle_update_reservation,
        schema=SERVICE_UPDATE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_END_RESERVATION,
        _async_handle_end_reservation,
        schema=SERVICE_END_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_ADD_FAVORITE,
        _async_handle_add_favorite,
        schema=SERVICE_ADD_FAVORITE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_UPDATE_FAVORITE,
        _async_handle_update_favorite,
        schema=SERVICE_UPDATE_FAVORITE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_REMOVE_FAVORITE,
        _async_handle_remove_favorite,
        schema=SERVICE_REMOVE_FAVORITE_SCHEMA,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_LIST_ACTIVE_RESERVATIONS,
        _async_handle_list_active_reservations,
        schema=SERVICE_LIST_ACTIVE_RESERVATIONS_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_LIST_FAVORITES,
        _async_handle_list_favorites,
        schema=SERVICE_LIST_FAVORITES_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )


async def _async_handle_start_reservation(call: ServiceCall) -> None:
    """Handle reservation start service."""

    runtime = _runtime_from_call(call)
    start = _as_utc(call.data[ATTR_START_TIME])
    end = _as_utc(call.data[ATTR_END_TIME])
    now = dt_util.utcnow()
    min_start = now + timedelta(minutes=1)
    if start < min_start:
        LOGGER.debug(
            "Start time %s is before minimum %s, adjusting to minimum",
            start,
            min_start,
        )
        start = min_start
    LOGGER.debug(
        "Starting reservation with start=%s end=%s now=%s start_local=%s end_local=%s",
        start,
        end,
        now,
        dt_util.as_local(start),
        dt_util.as_local(end),
    )
    if end <= start:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="end_before_start",
        )

    try:
        await runtime.provider.start_reservation(
            license_plate=call.data[ATTR_LICENSE_PLATE],
            start_time=start,
            end_time=end,
        )
    except PyCityVisitorParkingError as err:
        _raise_reservation_error(err)
    else:
        LOGGER.debug(
            "Reservation start requested for device %s (start=%s end=%s)",
            call.data[ATTR_DEVICE_ID],
            start,
            end,
        )


async def _async_handle_update_reservation(call: ServiceCall) -> None:
    """Handle reservation update service."""

    runtime = _runtime_from_call(call)
    start = call.data.get(ATTR_START_TIME)
    end = call.data.get(ATTR_END_TIME)
    license_plate = call.data.get(ATTR_LICENSE_PLATE)
    if start is None and end is None and license_plate is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="update_requires_changes",
        )

    start_dt_raw = _as_utc(start) if start else None
    end_dt_raw = _as_utc(end) if end else None
    if start_dt_raw and end_dt_raw and end_dt_raw <= start_dt_raw:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="end_before_start",
        )

    if license_plate is not None:
        await _fallback_update_reservation(
            runtime,
            call.data[ATTR_RESERVATION_ID],
            start_dt_raw,
            end_dt_raw,
            license_plate,
        )
        return

    update_fields = set(_reservation_update_fields(runtime))
    allow_start = ATTR_START_TIME in update_fields
    allow_end = ATTR_END_TIME in update_fields
    start_dt = start_dt_raw if start_dt_raw and allow_start else None
    end_dt = end_dt_raw if end_dt_raw and allow_end else None
    if start is not None and not allow_start:
        LOGGER.debug(
            "Ignoring start_time update for device %s (unsupported by provider)",
            call.data[ATTR_DEVICE_ID],
        )
    if end is not None and not allow_end:
        LOGGER.debug(
            "Ignoring end_time update for device %s (unsupported by provider)",
            call.data[ATTR_DEVICE_ID],
        )
    if start_dt is None and end_dt is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="update_requires_changes",
        )

    try:
        update_payload: dict[str, object] = {
            "reservation_id": call.data[ATTR_RESERVATION_ID]
        }
        if start_dt is not None:
            update_payload["start_time"] = start_dt
        if end_dt is not None:
            update_payload["end_time"] = end_dt
        await runtime.provider.update_reservation(**update_payload)
    except (NotImplementedError, ProviderError) as err:
        if isinstance(err, ProviderError) and not _is_not_supported(err):
            _raise_reservation_error(err)
        await _fallback_update_reservation(
            runtime,
            call.data[ATTR_RESERVATION_ID],
            start_dt,
            end_dt,
            license_plate,
        )
    except PyCityVisitorParkingError as err:
        _raise_reservation_error(err)
    else:
        LOGGER.debug(
            "Reservation update requested for device %s reservation %s "
            "(start_changed=%s end_changed=%s license_changed=%s)",
            call.data[ATTR_DEVICE_ID],
            call.data[ATTR_RESERVATION_ID],
            start_dt is not None,
            end_dt is not None,
            license_plate is not None,
        )


async def _async_handle_end_reservation(call: ServiceCall) -> None:
    """Handle reservation end service."""

    runtime = _runtime_from_call(call)
    try:
        await runtime.provider.end_reservation(
            call.data[ATTR_RESERVATION_ID],
            dt_util.utcnow(),
        )
    except PyCityVisitorParkingError as err:
        _raise_reservation_error(err)
    else:
        LOGGER.debug(
            "Reservation end requested for device %s reservation %s",
            call.data[ATTR_DEVICE_ID],
            call.data[ATTR_RESERVATION_ID],
        )


async def _async_handle_add_favorite(call: ServiceCall) -> None:
    """Handle add favorite service."""

    runtime = _runtime_from_call(call)
    name = call.data.get(ATTR_NAME)
    try:
        payload: dict[str, str] = {ATTR_LICENSE_PLATE: call.data[ATTR_LICENSE_PLATE]}
        if name is not None:
            payload[ATTR_NAME] = name
        await runtime.provider.add_favorite(**payload)
    except (TypeError, PyCityVisitorParkingError) as err:
        LOGGER.debug(
            "Add favorite failed for device %s: %s: %s",
            call.data[ATTR_DEVICE_ID],
            type(err).__name__,
            err,
        )
        _raise_favorite_error(err)


async def _async_handle_update_favorite(call: ServiceCall) -> None:
    """Handle update favorite service."""

    runtime = _runtime_from_call(call)
    license_plate = call.data.get(ATTR_LICENSE_PLATE)
    name = call.data.get(ATTR_NAME)
    if license_plate is None and name is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="update_requires_changes",
        )

    try:
        update_data: dict[str, str] = {ATTR_FAVORITE_ID: call.data[ATTR_FAVORITE_ID]}
        if license_plate is not None:
            update_data[ATTR_LICENSE_PLATE] = license_plate
        if name is not None:
            update_data[ATTR_NAME] = name
        await runtime.provider.update_favorite(**update_data)
    except (NotImplementedError, ProviderError) as err:
        if isinstance(err, ProviderError) and not _is_not_supported(err):
            _raise_favorite_error(err)
        await _fallback_update_favorite(
            runtime, call.data[ATTR_FAVORITE_ID], license_plate, name
        )
    except (TypeError, PyCityVisitorParkingError) as err:
        LOGGER.debug(
            "Update favorite failed for device %s favorite %s: %s: %s",
            call.data[ATTR_DEVICE_ID],
            call.data[ATTR_FAVORITE_ID],
            type(err).__name__,
            err,
        )
        _raise_favorite_error(err)


async def _async_handle_remove_favorite(call: ServiceCall) -> None:
    """Handle remove favorite service."""

    runtime = _runtime_from_call(call)
    try:
        LOGGER.debug("Removing favorite for device %s", call.data[ATTR_DEVICE_ID])
        favorite_id = call.data[ATTR_FAVORITE_ID]
        await runtime.provider.remove_favorite(favorite_id)
        LOGGER.debug("Removed favorite for device %s", call.data[ATTR_DEVICE_ID])
    except PyCityVisitorParkingError as err:
        LOGGER.warning("Failed to remove favorite (%s)", err.__class__.__name__)
        _raise_favorite_error(err)


async def _async_handle_list_active_reservations(
    call: ServiceCall,
) -> dict[str, JsonValueType]:
    """Handle list active reservations service."""

    runtime = _runtime_from_call(call)
    request_started = time.perf_counter()
    reservation_update_fields = _reservation_update_fields(runtime)
    stale = False
    try:
        await runtime.coordinator.async_refresh()
    except Exception as err:  # pragma: no cover - defensive
        LOGGER.debug(
            "Active reservations refresh raised for device %s: %s: %s",
            call.data[ATTR_DEVICE_ID],
            type(err).__name__,
            err,
        )
        if runtime.coordinator.data:
            stale = True
        else:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="reservation_operation_failed",
            ) from err
    if not runtime.coordinator.last_update_success:
        reason = runtime.coordinator.last_exception
        LOGGER.debug(
            "Active reservations refresh failed for device %s: %s: %s",
            call.data[ATTR_DEVICE_ID],
            type(reason).__name__ if reason else "Unknown",
            reason,
        )
        if runtime.coordinator.data:
            stale = True
        else:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="reservation_operation_failed",
            )
    data = getattr(runtime.coordinator, "data", None)
    reservations = getattr(data, "reservations", []) if data else []
    favorites = getattr(data, "favorites", []) if data else []
    now = dt_util.utcnow()
    visible = [
        reservation for reservation in reservations if reservation.end_time > now
    ]
    active = [
        reservation
        for reservation in visible
        if reservation.start_time <= now < reservation.end_time
    ]
    future = [reservation for reservation in visible if reservation.start_time > now]
    favorite_by_plate = {
        _normalize_plate(favorite.license_plate): favorite
        for favorite in favorites
        if favorite.license_plate
    }
    LOGGER.debug(
        "Active reservations response for %s (permit %s): %s active, %s future of %s "
        "(duration=%.3fs)",
        runtime.coordinator.config_entry.title,
        runtime.permit_id,
        len(active),
        len(future),
        len(reservations),
        time.perf_counter() - request_started,
    )
    active_reservations: list[JsonValueType] = [
        _reservation_payload(reservation, favorite_by_plate) for reservation in visible
    ]
    reservation_update_fields_json: list[JsonValueType] = [
        str(field) for field in reservation_update_fields
    ]

    return {
        "count": len(visible),
        "active_count": len(active),
        "future_count": len(future),
        "active_reservations": active_reservations,
        "stale": stale,
        "reservation_update_fields": reservation_update_fields_json,
    }


async def _async_handle_list_favorites(call: ServiceCall) -> dict[str, JsonValueType]:
    """Handle list favorites service."""

    runtime = _runtime_from_call(call)
    try:
        favorites = await runtime.provider.list_favorites()
    except PyCityVisitorParkingError as err:
        _raise_favorite_error(err)

    normalized: list[JsonValueType] = []
    for favorite in favorites or []:
        favorite_id = get_attr(favorite, "id")
        license_plate = get_attr(favorite, "license_plate")
        name = get_attr(favorite, "name")
        if favorite_id is None and license_plate is None:
            continue
        payload: dict[str, JsonValueType] = {
            ATTR_FAVORITE_ID: str(favorite_id) if favorite_id is not None else "",
        }
        if license_plate is not None:
            payload[ATTR_LICENSE_PLATE] = str(license_plate)
        if name is not None:
            payload[ATTR_NAME] = str(name)
        normalized.append(payload)

    LOGGER.debug(
        "List favorites response for %s (permit %s): %s favorites",
        runtime.coordinator.config_entry.title,
        runtime.permit_id,
        len(normalized),
    )
    return {"count": len(normalized), "favorites": normalized}


async def _fallback_update_reservation(
    runtime: CityVisitorParkingRuntimeData,
    reservation_id: str,
    start_time: datetime | None,
    end_time: datetime | None,
    license_plate: str | None,
) -> None:
    """Fallback update by canceling and recreating the reservation."""

    if start_time is None or end_time is None or license_plate is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="update_requires_full_details",
        )

    LOGGER.debug(
        "Fallback update: cancel and recreate reservation %s "
        "for device %s (start=%s end=%s plate=%s)",
        reservation_id,
        runtime.provider,
        start_time,
        end_time,
        license_plate,
    )
    try:
        await runtime.provider.end_reservation(
            reservation_id,
            dt_util.utcnow(),
        )
        await runtime.provider.start_reservation(
            license_plate=license_plate,
            start_time=start_time,
            end_time=end_time,
        )
    except PyCityVisitorParkingError as err:
        LOGGER.debug(
            "Fallback reservation update failed for %s: %s: %s",
            reservation_id,
            type(err).__name__,
            err,
        )
        _raise_reservation_error(err)
    else:
        LOGGER.debug("Fallback reservation update succeeded for %s", reservation_id)


async def _fallback_update_favorite(
    runtime: CityVisitorParkingRuntimeData,
    favorite_id: str,
    license_plate: str | None,
    name: str | None,
) -> None:
    """Fallback update for favorites by remove and add."""

    if license_plate is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="update_requires_license_plate",
        )
    LOGGER.debug(
        "Fallback favorite update: remove and recreate favorite %s "
        "for device %s (plate=%s name=%s)",
        favorite_id,
        runtime.provider,
        license_plate,
        name,
    )
    try:
        await runtime.provider.remove_favorite(favorite_id)
        if name is None:
            await runtime.provider.add_favorite(
                license_plate=license_plate,
            )
        else:
            await runtime.provider.add_favorite(
                license_plate=license_plate,
                name=name,
            )
    except (TypeError, PyCityVisitorParkingError) as err:
        LOGGER.debug(
            "Fallback favorite update failed for %s: %s: %s",
            favorite_id,
            type(err).__name__,
            err,
        )
        _raise_favorite_error(err)
    else:
        LOGGER.debug("Fallback favorite update succeeded for %s", favorite_id)


def _runtime_from_call(call: ServiceCall) -> CityVisitorParkingRuntimeData:
    """Resolve runtime data from a service call."""

    hass: HomeAssistant = call.hass
    device_registry = dr.async_get(hass)
    device = device_registry.async_get(call.data[ATTR_DEVICE_ID])
    if device is None or not device.config_entries:
        _raise_invalid_target()

    entry_id = next(iter(device.config_entries))
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        _raise_invalid_target()
    if entry.state is not config_entries.ConfigEntryState.LOADED:
        _raise_invalid_target()

    LOGGER.debug(
        "Resolved runtime for %s (permit %s) from device %s (data keys=%s)",
        entry.title,
        entry.data.get(CONF_PERMIT_ID),
        call.data.get(ATTR_DEVICE_ID),
        list(call.data),
    )
    return entry.runtime_data


def _raise_invalid_target() -> None:
    """Raise when a service call targets an invalid entry."""

    raise ServiceValidationError(
        translation_domain=DOMAIN,
        translation_key="invalid_target",
    )


def _as_utc(value: datetime) -> datetime:
    """Normalize a datetime to UTC."""

    return dt_util.as_utc(value) if value.tzinfo else value.replace(tzinfo=dt_util.UTC)


def _format_timestamp(value: datetime) -> str:
    """Format a datetime as an ISO 8601 UTC timestamp."""

    return (
        dt_util.as_utc(value).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    )


def _is_not_supported(err: ProviderError) -> bool:
    """Return True when the provider reports an unsupported operation."""

    message = str(err).lower()
    return "not supported" in message or "unsupported" in message


def _normalize_plate(value: str | None) -> str:
    """Normalize a license plate for matching."""

    if not value:
        return ""
    return "".join(ch for ch in value.strip().upper() if ch.isalnum())


def _reservation_payload(
    reservation: Reservation, favorite_by_plate: dict[str, Favorite]
) -> dict[str, JsonValueType]:
    """Build reservation response payload with favorite metadata."""

    payload: dict[str, JsonValueType] = {
        ATTR_RESERVATION_ID: reservation.reservation_id,
        ATTR_START_TIME: _format_timestamp(reservation.start_time),
        ATTR_END_TIME: _format_timestamp(reservation.end_time),
    }

    license_plate = reservation.license_plate
    plate = _normalize_plate(license_plate)
    if plate and license_plate is not None:
        payload[ATTR_LICENSE_PLATE] = license_plate
        favorite = favorite_by_plate.get(plate)
        if favorite is not None:
            payload[ATTR_FAVORITE_ID] = favorite.favorite_id
            if favorite.name:
                payload["favorite_name"] = favorite.name
    return payload


def _reservation_update_fields(
    runtime: CityVisitorParkingRuntimeData,
) -> list[str]:
    """Return normalized reservation update fields for a provider."""

    update_fields = getattr(runtime.provider, "reservation_update_fields", None)
    if update_fields is None:
        return []
    return [str(field) for field in update_fields]
