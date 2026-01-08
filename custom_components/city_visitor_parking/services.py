"""Service handlers for City visitor parking."""

from __future__ import annotations

import time
from datetime import datetime, timedelta
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
from pycityvisitorparking.exceptions import PyCityVisitorParkingError

from .const import (
    ATTR_END_TIME,
    ATTR_FAVORITE_ID,
    ATTR_LICENSE_PLATE,
    ATTR_NAME,
    ATTR_RESERVATION_ID,
    ATTR_START_TIME,
    DOMAIN,
    LOGGER,
)
from .models import CityVisitorParkingRuntimeData, Favorite, Reservation

SERVICE_START_RESERVATION = "start_reservation"
SERVICE_UPDATE_RESERVATION = "update_reservation"
SERVICE_END_RESERVATION = "end_reservation"
SERVICE_ADD_FAVORITE = "add_favorite"
SERVICE_UPDATE_FAVORITE = "update_favorite"
SERVICE_REMOVE_FAVORITE = "remove_favorite"
SERVICE_LIST_ACTIVE_RESERVATIONS = "list_active_reservations"
SERVICE_LIST_FAVORITES = "list_favorites"

DEVICE_SELECTOR = selector.DeviceSelector(
    selector.DeviceSelectorConfig(integration=DOMAIN)
)

SERVICE_START_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_START_TIME): cv.datetime,
        vol.Required(ATTR_END_TIME): cv.datetime,
        vol.Required(ATTR_LICENSE_PLATE): cv.string,
    }
)

SERVICE_UPDATE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_RESERVATION_ID): cv.string,
        vol.Optional(ATTR_START_TIME): cv.datetime,
        vol.Optional(ATTR_END_TIME): cv.datetime,
        vol.Optional(ATTR_LICENSE_PLATE): cv.string,
    }
)

SERVICE_END_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_RESERVATION_ID): cv.string,
    }
)

SERVICE_ADD_FAVORITE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_LICENSE_PLATE): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
    }
)

SERVICE_UPDATE_FAVORITE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_FAVORITE_ID): cv.string,
        vol.Optional(ATTR_LICENSE_PLATE): cv.string,
        vol.Optional(ATTR_NAME): cv.string,
    }
)

SERVICE_REMOVE_FAVORITE_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Required(ATTR_FAVORITE_ID): cv.string,
    }
)

SERVICE_LIST_ACTIVE_RESERVATIONS_SCHEMA = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
        vol.Optional("return_response"): cv.boolean,
    }
)

SERVICE_LIST_FAVORITES_SCHEMA = vol.Schema(
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
        LOGGER.debug("Reservation start failed: %s: %s", type(err).__name__, err)
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="reservation_operation_failed",
        ) from err
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

    start_dt = _as_utc(start) if start else None
    end_dt = _as_utc(end) if end else None
    if start_dt and end_dt and end_dt <= start_dt:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="end_before_start",
        )

    if license_plate is not None:
        await _fallback_update_reservation(
            runtime,
            call.data[ATTR_RESERVATION_ID],
            start_dt,
            end_dt,
            license_plate,
        )
        return

    try:
        await runtime.provider.update_reservation(
            reservation_id=call.data[ATTR_RESERVATION_ID],
            start_time=start_dt,
            end_time=end_dt,
        )
    except (NotImplementedError, ProviderError) as err:
        if isinstance(err, ProviderError) and not _is_not_supported(err):
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="reservation_operation_failed",
            ) from err
        await _fallback_update_reservation(
            runtime,
            call.data[ATTR_RESERVATION_ID],
            start_dt,
            end_dt,
            license_plate,
        )
    except PyCityVisitorParkingError as err:
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="reservation_operation_failed",
        ) from err
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
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="reservation_operation_failed",
        ) from err
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
        if name is None:
            await runtime.provider.add_favorite(
                license_plate=call.data[ATTR_LICENSE_PLATE],
            )
        else:
            await runtime.provider.add_favorite(
                license_plate=call.data[ATTR_LICENSE_PLATE],
                name=name,
            )
    except (TypeError, PyCityVisitorParkingError) as err:
        LOGGER.debug(
            "Add favorite failed for device %s: %s: %s",
            call.data[ATTR_DEVICE_ID],
            type(err).__name__,
            err,
        )
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="favorite_operation_failed",
        ) from err


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
        update_data: dict[str, str] = {"favorite_id": call.data[ATTR_FAVORITE_ID]}
        if license_plate is not None:
            update_data["license_plate"] = license_plate
        if name is not None:
            update_data["name"] = name
        await runtime.provider.update_favorite(**update_data)
    except (NotImplementedError, ProviderError) as err:
        if isinstance(err, ProviderError) and not _is_not_supported(err):
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key="favorite_operation_failed",
            ) from err
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
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="favorite_operation_failed",
        ) from err


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
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="favorite_operation_failed",
        ) from err


async def _async_handle_list_active_reservations(
    call: ServiceCall,
) -> dict[str, JsonValueType]:
    """Handle list active reservations service."""

    runtime = _runtime_from_call(call)
    request_started = time.perf_counter()
    update_fields = getattr(runtime.provider, "reservation_update_fields", None)
    if update_fields is None:
        reservation_update_fields = ["start_time", "end_time"]
    else:
        reservation_update_fields = [str(field) for field in update_fields]
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
        "Active reservations response for device %s: %s active, %s future of %s "
        "(duration=%.3fs)",
        call.data[ATTR_DEVICE_ID],
        len(active),
        len(future),
        len(reservations),
        time.perf_counter() - request_started,
    )
    active_reservations: list[JsonValueType] = [
        _reservation_payload(reservation, favorite_by_plate)
        for reservation in visible
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
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="favorite_operation_failed",
        ) from err

    normalized: list[JsonValueType] = []
    for favorite in favorites or []:
        favorite_id = _get_attr(favorite, "id")
        license_plate = _get_attr(favorite, "license_plate")
        name = _get_attr(favorite, "name")
        if favorite_id is None and license_plate is None:
            continue
        payload: dict[str, JsonValueType] = {
            "favorite_id": str(favorite_id) if favorite_id is not None else "",
        }
        if license_plate is not None:
            payload["license_plate"] = str(license_plate)
        if name is not None:
            payload["name"] = str(name)
        normalized.append(payload)

    LOGGER.debug(
        "List favorites response for device %s: %s favorites",
        call.data[ATTR_DEVICE_ID],
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
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="reservation_operation_failed",
        ) from err
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
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="favorite_operation_failed",
        ) from err
    else:
        LOGGER.debug("Fallback favorite update succeeded for %s", favorite_id)


def _runtime_from_call(call: ServiceCall) -> CityVisitorParkingRuntimeData:
    """Resolve runtime data from a service call."""

    hass: HomeAssistant = call.hass
    LOGGER.debug(
        "Resolving runtime for device %s (data keys=%s)",
        call.data.get(ATTR_DEVICE_ID),
        list(call.data),
    )
    device_registry = dr.async_get(hass)
    device = device_registry.async_get(call.data[ATTR_DEVICE_ID])
    if device is None or not device.config_entries:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="invalid_target",
        )

    entry_id = next(iter(device.config_entries))
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="invalid_target",
        )
    if entry.state is not config_entries.ConfigEntryState.LOADED:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="invalid_target",
        )

    return entry.runtime_data


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


def _get_attr(obj: object, name: str) -> object | None:
    """Return attribute or mapping value for name."""

    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


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
        "reservation_id": reservation.reservation_id,
        "start_time": _format_timestamp(reservation.start_time),
        "end_time": _format_timestamp(reservation.end_time),
    }

    license_plate = reservation.license_plate
    plate = _normalize_plate(license_plate)
    if plate and license_plate is not None:
        payload["license_plate"] = license_plate
        favorite = favorite_by_plate.get(plate)
        if favorite is not None:
            payload["favorite_id"] = favorite.favorite_id
            if favorite.name:
                payload["favorite_name"] = favorite.name
    return payload
