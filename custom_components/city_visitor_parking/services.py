"""Service handlers for City visitor parking."""

from __future__ import annotations

import functools
import logging
import time
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Final, NoReturn, Protocol, cast

import probatio as vol
from homeassistant.const import ATTR_DEVICE_ID
from homeassistant.core import SupportsResponse
from homeassistant.exceptions import HomeAssistantError, ServiceValidationError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import selector, service
from homeassistant.util import dt as dt_util
from pycityvisitorparking import ProviderError
from pycityvisitorparking.exceptions import (
    AuthError,
    ErrorCode,
    NetworkError,
    PyCityVisitorParkingError,
    ValidationError,
)

from .const import (
    ATTR_END_TIME,
    ATTR_FAVORITE_ID,
    ATTR_LICENSE_PLATE,
    ATTR_NAME,
    ATTR_PARKING_AREA_ID,
    ATTR_RESERVATION_ID,
    ATTR_START_TIME,
    CONF_AUTO_END,
    CONF_PERMIT_ID,
    DOMAIN,
)
from .payloads import (
    build_reservations_payload,
    build_status_payload,
    normalize_favorites,
    reservation_update_fields,
)
from .version import async_get_versions, build_log_block

if TYPE_CHECKING:
    from collections.abc import Callable, Coroutine, Mapping
    from typing import Any

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant, ServiceCall
    from homeassistant.util.json import JsonValueType

    from .models import CoordinatorData
    from .runtime_data import CityVisitorParkingRuntimeData

_LOGGER = logging.getLogger(__name__)

SERVICE_START_RESERVATION: Final[str] = "start_reservation"
SERVICE_UPDATE_RESERVATION: Final[str] = "update_reservation"
SERVICE_END_RESERVATION: Final[str] = "end_reservation"
SERVICE_ADD_FAVORITE: Final[str] = "add_favorite"
SERVICE_UPDATE_FAVORITE: Final[str] = "update_favorite"
SERVICE_REMOVE_FAVORITE: Final[str] = "remove_favorite"
SERVICE_LIST_RESERVATIONS: Final[str] = "list_reservations"
SERVICE_LIST_FAVORITES: Final[str] = "list_favorites"
SERVICE_GET_STATUS: Final[str] = "get_status"
SERVICE_GET_ENTRY_INFO: Final[str] = "get_entry_info"


class _SelectorModule(Protocol):
    """Protocol for selector module helpers."""

    def selector(
        self, config: Mapping[str, object]
    ) -> selector.Selector[Mapping[str, object]]:
        """Instantiate a selector."""
        raise NotImplementedError


SELECTOR = cast("_SelectorModule", selector).selector
DEVICE_SELECTOR: Final[selector.Selector[Mapping[str, object]]] = SELECTOR(
    {"device": {"integration": DOMAIN}}
)


def _runtime_log_context(runtime: CityVisitorParkingRuntimeData) -> dict[str, str]:
    """Return logging context fields for a runtime-bound provider."""
    return {
        "provider": runtime.provider_config.provider_id,
        "city": runtime.provider_config.municipality_name,
    }


def _error_detail(err: PyCityVisitorParkingError) -> str | None:
    """Return the technical, PII-free detail of a library error when available."""
    detail = getattr(err, "detail", None)
    if isinstance(detail, str) and detail:
        return detail
    return None


def _error_base_key(err: PyCityVisitorParkingError, prefix: str) -> str:
    """Return the base translation key for a failed provider operation."""
    error_code = getattr(err, "error_code", None)
    if error_code == ErrorCode.AUTH_ERROR:
        suffix = "auth_failed"
    elif error_code == ErrorCode.NETWORK_ERROR:
        suffix = "network_failed"
    elif error_code == ErrorCode.VALIDATION_ERROR:
        suffix = "validation_failed"
    elif error_code == ErrorCode.PROVIDER_ERROR:
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


def _error_key(
    err: PyCityVisitorParkingError, prefix: str, detail_present: bool
) -> str:
    """Return the translation key for an operation failure."""
    base_key = _error_base_key(err, prefix)
    return f"{base_key}_detail" if detail_present else base_key


def _reservation_error_key(err: PyCityVisitorParkingError, detail_present: bool) -> str:
    """Return the translation key for a reservation failure."""
    return _error_key(err, "reservation", detail_present)


def _favorite_error_key(err: PyCityVisitorParkingError, detail_present: bool) -> str:
    """Return the translation key for a favorite failure."""
    return _error_key(err, "favorite", detail_present)


def _raise_reservation_error(
    err: PyCityVisitorParkingError,
    *,
    provider: str = "unknown",
    city: str = "unknown",
    ha_cvp_version: str = "unknown",
    pycvp_version: str = "unknown",
) -> NoReturn:
    """Raise a translated Home Assistant error for reservation failures."""
    detail = _error_detail(err)
    _LOGGER.debug(
        "%s",
        build_log_block(
            "reservation request failed",
            {"error-type": type(err).__name__, "error": str(err)},
            provider=provider,
            city=city,
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        ),
    )
    raise HomeAssistantError(
        translation_domain=DOMAIN,
        translation_key=_reservation_error_key(err, detail is not None),
        translation_placeholders={"detail": detail} if detail else None,
    ) from err


def _raise_favorite_error(
    err: PyCityVisitorParkingError | TypeError,
    *,
    provider: str = "unknown",
    city: str = "unknown",
    ha_cvp_version: str = "unknown",
    pycvp_version: str = "unknown",
) -> NoReturn:
    """Raise a translated Home Assistant error for favorite failures."""
    if not isinstance(err, PyCityVisitorParkingError):
        _LOGGER.debug(
            "%s",
            build_log_block(
                "favorite request failed",
                {"error-type": type(err).__name__, "error": str(err)},
                provider=provider,
                city=city,
                ha_cvp_version=ha_cvp_version,
                pycvp_version=pycvp_version,
            ),
        )
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key="favorite_operation_failed",
        ) from err
    detail = _error_detail(err)
    _LOGGER.debug(
        "%s",
        build_log_block(
            "favorite request failed",
            {"error-type": type(err).__name__, "error": str(err)},
            provider=provider,
            city=city,
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        ),
    )
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
        vol.Optional(ATTR_PARKING_AREA_ID): cv.string,
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

SERVICE_LIST_RESERVATIONS_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
    }
)

SERVICE_LIST_FAVORITES_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
    }
)

SERVICE_GET_STATUS_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
    }
)

SERVICE_GET_ENTRY_INFO_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(ATTR_DEVICE_ID): DEVICE_SELECTOR,
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
        SERVICE_LIST_RESERVATIONS,
        _async_handle_list_reservations,
        schema=SERVICE_LIST_RESERVATIONS_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_LIST_FAVORITES,
        _async_handle_list_favorites,
        schema=SERVICE_LIST_FAVORITES_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_STATUS,
        _async_handle_get_status,
        schema=SERVICE_GET_STATUS_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_GET_ENTRY_INFO,
        _async_handle_get_entry_info,
        schema=SERVICE_GET_ENTRY_INFO_SCHEMA,
        supports_response=SupportsResponse.ONLY,
    )


def _write_service(
    handler: Callable[[ServiceCall], Coroutine[Any, Any, None]],
) -> Callable[[ServiceCall], Coroutine[Any, Any, None]]:
    """Wrap a write service with session renewal and a post-write refresh.

    A provider that reports an expired session as a generic error would fail
    every following call until the next poll renews it. Writes cannot be retried
    safely, because a provider error does not prove the request was not applied,
    so the failure is still reported and only the next attempt benefits.

    After a successful write the coordinator is refreshed before the service
    returns, so sensors follow without waiting for the next scheduled poll and
    callers (the cards read the coordinator data over the websocket) see the
    change. ``async_refresh`` bypasses the request debouncer, whose cooldown
    would otherwise delay the refresh after a quick second write.
    """

    @functools.wraps(handler)
    async def wrapper(call: ServiceCall) -> None:
        try:
            await handler(call)
        except HomeAssistantError as err:
            # The handlers translate provider failures into HomeAssistantError
            # with the provider error chained as the cause.
            cause = err.__cause__
            if isinstance(cause, PyCityVisitorParkingError):
                await _runtime_from_call(call).coordinator.async_renew_session(cause)
            raise
        await _runtime_from_call(call).coordinator.async_refresh()

    return wrapper


def _resolve_parking_area_id(
    runtime: CityVisitorParkingRuntimeData, requested: object
) -> str | None:
    """Return the parking area to book in, or None for a permit without parking areas.

    Without a requested parking area the default parking area (the first of the
    coordinator's parking areas, which honours the default chosen in the options) is
    used, so the service and the card book in the same parking area.
    """
    data = cast("CoordinatorData | None", runtime.coordinator.data)
    parking_areas = data.parking_areas if data is not None else ()
    if requested is None:
        return parking_areas[0].parking_area_id if parking_areas else None
    if data is None or data.parking_area(cast("str", requested)) is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="invalid_parking_area",
        )
    return cast("str", requested)


@_write_service
async def _async_handle_start_reservation(call: ServiceCall) -> None:
    """Handle reservation start service."""
    runtime = _runtime_from_call(call)
    start = _as_utc(cast("datetime", call.data[ATTR_START_TIME]))
    end = _as_utc(cast("datetime", call.data[ATTR_END_TIME]))
    license_plate = cast("str", call.data[ATTR_LICENSE_PLATE])
    now = dt_util.utcnow()
    min_start = now + timedelta(minutes=1)
    if start < min_start:
        _LOGGER.debug(
            "Start time %s is before minimum %s, adjusting to minimum",
            start,
            min_start,
        )
        start = min_start
    _LOGGER.debug(
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

    parking_area_id = _resolve_parking_area_id(
        runtime, call.data.get(ATTR_PARKING_AREA_ID)
    )
    try:
        await runtime.provider.start_reservation(
            license_plate=license_plate,
            start_time=start,
            end_time=end,
            # Only providers with reservation targets accept the argument.
            **(
                {"reservation_target_id": parking_area_id}
                if parking_area_id is not None
                else {}
            ),
        )
    except PyCityVisitorParkingError as err:
        ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
        _raise_reservation_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )
    else:
        _LOGGER.debug(
            "Reservation start requested for device %s (start=%s end=%s)",
            call.data[ATTR_DEVICE_ID],
            start,
            end,
        )


@_write_service
async def _async_handle_update_reservation(call: ServiceCall) -> None:
    """Handle reservation update service."""
    runtime = _runtime_from_call(call)
    start_raw = call.data.get(ATTR_START_TIME)
    end_raw = call.data.get(ATTR_END_TIME)
    license_plate_raw = call.data.get(ATTR_LICENSE_PLATE)
    license_plate = license_plate_raw if isinstance(license_plate_raw, str) else None
    if start_raw is None and end_raw is None and license_plate is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="update_requires_changes",
        )

    start_dt_raw = _as_utc(start_raw) if isinstance(start_raw, datetime) else None
    end_dt_raw = _as_utc(end_raw) if isinstance(end_raw, datetime) else None
    if start_dt_raw and end_dt_raw and end_dt_raw <= start_dt_raw:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="end_before_start",
        )

    reservation_id: str = call.data[ATTR_RESERVATION_ID]
    if license_plate is not None:
        await _fallback_update_reservation(
            runtime,
            reservation_id,
            start_dt_raw,
            end_dt_raw,
            license_plate,
        )
        return

    update_fields = set(reservation_update_fields(runtime.provider))
    allow_start = ATTR_START_TIME in update_fields
    allow_end = ATTR_END_TIME in update_fields
    start_dt = start_dt_raw if start_dt_raw and allow_start else None
    end_dt = end_dt_raw if end_dt_raw and allow_end else None
    if start_raw is not None and not allow_start:
        _LOGGER.debug(
            "Ignoring start_time update for device %s (unsupported by provider)",
            call.data[ATTR_DEVICE_ID],
        )
    if end_raw is not None and not allow_end:
        _LOGGER.debug(
            "Ignoring end_time update for device %s (unsupported by provider)",
            call.data[ATTR_DEVICE_ID],
        )
    if start_dt is None and end_dt is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="update_requires_changes",
        )

    try:
        await runtime.provider.update_reservation(
            reservation_id=reservation_id,
            start_time=start_dt,
            end_time=end_dt,
        )
    except (NotImplementedError, ProviderError) as err:
        if isinstance(err, ProviderError) and not _is_not_supported(err):
            ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
            _raise_reservation_error(
                err,
                **_runtime_log_context(runtime),
                ha_cvp_version=ha_cvp_version,
                pycvp_version=pycvp_version,
            )
        await _fallback_update_reservation(
            runtime,
            reservation_id,
            start_dt,
            end_dt,
            license_plate,
        )
    except PyCityVisitorParkingError as err:
        ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
        _raise_reservation_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )
    else:
        _LOGGER.debug(
            "Reservation update requested for device %s reservation %s "
            "(start_changed=%s end_changed=%s license_changed=%s)",
            call.data[ATTR_DEVICE_ID],
            call.data[ATTR_RESERVATION_ID],
            start_dt is not None,
            end_dt is not None,
            license_plate is not None,
        )


@_write_service
async def _async_handle_end_reservation(call: ServiceCall) -> None:
    """Handle reservation end service."""
    runtime = _runtime_from_call(call)
    reservation_id: str = call.data[ATTR_RESERVATION_ID]
    try:
        await runtime.provider.end_reservation(
            reservation_id,
            dt_util.utcnow(),
        )
    except PyCityVisitorParkingError as err:
        ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
        _raise_reservation_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )
    else:
        _LOGGER.debug(
            "Reservation end requested for device %s reservation %s",
            call.data[ATTR_DEVICE_ID],
            reservation_id,
        )


@_write_service
async def _async_handle_add_favorite(call: ServiceCall) -> None:
    """Handle add favorite service."""
    runtime = _runtime_from_call(call)
    name_raw = call.data.get(ATTR_NAME)
    name = name_raw if isinstance(name_raw, str) else None
    try:
        license_plate: str = call.data[ATTR_LICENSE_PLATE]
        payload: dict[str, str] = {ATTR_LICENSE_PLATE: license_plate}
        if name is not None:
            payload[ATTR_NAME] = name
        await runtime.provider.add_favorite(**payload)
    except (TypeError, PyCityVisitorParkingError) as err:
        _LOGGER.debug(
            "Add favorite failed for device %s: %s: %s",
            call.data[ATTR_DEVICE_ID],
            type(err).__name__,
            err,
        )
        ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
        _raise_favorite_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )


@_write_service
async def _async_handle_update_favorite(call: ServiceCall) -> None:
    """Handle update favorite service."""
    runtime = _runtime_from_call(call)
    license_plate_raw = call.data.get(ATTR_LICENSE_PLATE)
    name_raw = call.data.get(ATTR_NAME)
    license_plate = license_plate_raw if isinstance(license_plate_raw, str) else None
    name = name_raw if isinstance(name_raw, str) else None
    if license_plate is None and name is None:
        raise ServiceValidationError(
            translation_domain=DOMAIN,
            translation_key="update_requires_changes",
        )

    favorite_id: str = call.data[ATTR_FAVORITE_ID]
    try:
        update_data: dict[str, str] = {ATTR_FAVORITE_ID: favorite_id}
        if license_plate is not None:
            update_data[ATTR_LICENSE_PLATE] = license_plate
        if name is not None:
            update_data[ATTR_NAME] = name
        await runtime.provider.update_favorite(**update_data)
    except (NotImplementedError, ProviderError) as err:
        if isinstance(err, ProviderError) and not _is_not_supported(err):
            ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
            _raise_favorite_error(
                err,
                **_runtime_log_context(runtime),
                ha_cvp_version=ha_cvp_version,
                pycvp_version=pycvp_version,
            )
        await _fallback_update_favorite(runtime, favorite_id, license_plate, name)
    except (TypeError, PyCityVisitorParkingError) as err:
        _LOGGER.debug(
            "Update favorite failed for device %s favorite %s: %s: %s",
            call.data[ATTR_DEVICE_ID],
            call.data[ATTR_FAVORITE_ID],
            type(err).__name__,
            err,
        )
        ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
        _raise_favorite_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )


@_write_service
async def _async_handle_remove_favorite(call: ServiceCall) -> None:
    """Handle remove favorite service."""
    runtime = _runtime_from_call(call)
    try:
        _LOGGER.debug("Removing favorite for device %s", call.data[ATTR_DEVICE_ID])
        favorite_id: str = call.data[ATTR_FAVORITE_ID]
        await runtime.provider.remove_favorite(favorite_id)
        _LOGGER.debug("Removed favorite for device %s", call.data[ATTR_DEVICE_ID])
    except PyCityVisitorParkingError as err:
        ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
        _raise_favorite_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )


async def _async_handle_list_reservations(
    call: ServiceCall,
) -> dict[str, JsonValueType]:
    """Handle list reservations service."""
    runtime = _runtime_from_call(call)
    request_started = time.perf_counter()
    data, stale = await _async_refresh_runtime_data(
        runtime,
        device_id=str(call.data[ATTR_DEVICE_ID]),
        translation_key="reservation_operation_failed",
        log_label="Reservations",
    )
    config_entry = runtime.coordinator.config_entry
    options = config_entry.options if config_entry else {}
    payload = build_reservations_payload(
        data,
        options,
        dt_util.utcnow(),
        reservation_update_fields(runtime.provider),
        stale=stale,
    )
    _LOGGER.debug(
        "Reservations response for %s (permit %s): %s active, %s future of %s "
        "(duration=%.3fs)",
        config_entry.title if config_entry else "unknown",
        runtime.permit_id,
        payload["active_count"],
        payload["future_count"],
        len(data.reservations),
        time.perf_counter() - request_started,
    )
    # Keep the legacy response key during the migration window so the
    # existing card and automations do not break when only the backend updates.
    payload["active_reservations"] = payload["reservations"]
    return cast("dict[str, JsonValueType]", payload)


async def _async_handle_list_favorites(call: ServiceCall) -> dict[str, JsonValueType]:
    """Handle list favorites service."""
    runtime = _runtime_from_call(call)
    try:
        favorites = await runtime.coordinator.async_call_with_relogin(
            runtime.provider.list_favorites
        )
    except PyCityVisitorParkingError as err:
        ha_cvp_version, pycvp_version = await async_get_versions(call.hass)
        _raise_favorite_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )

    normalized: list[JsonValueType] = []
    for favorite in normalize_favorites(favorites):
        payload: dict[str, JsonValueType] = {ATTR_FAVORITE_ID: favorite.get("id", "")}
        if "license_plate" in favorite:
            payload[ATTR_LICENSE_PLATE] = favorite["license_plate"]
        if "name" in favorite:
            payload[ATTR_NAME] = favorite["name"]
        normalized.append(payload)

    config_entry = runtime.coordinator.config_entry
    entry_title = config_entry.title if config_entry else "unknown"
    _LOGGER.debug(
        "List favorites response for %s (permit %s): %s favorites",
        entry_title,
        runtime.permit_id,
        len(normalized),
    )
    return {"count": len(normalized), "favorites": normalized}


async def _async_handle_get_status(call: ServiceCall) -> dict[str, JsonValueType]:
    """Handle get status service."""
    runtime = _runtime_from_call(call)
    entry = _entry_from_call(call)
    data, stale = await _async_refresh_runtime_data(
        runtime,
        device_id=str(call.data[ATTR_DEVICE_ID]),
        translation_key="status_operation_failed",
        log_label="Status",
    )
    response = build_status_payload(
        data,
        entry.options,
        dt_util.utcnow(),
        stale=stale,
    )
    response["stale"] = stale
    return cast("dict[str, JsonValueType]", response)


async def _async_handle_get_entry_info(call: ServiceCall) -> dict[str, JsonValueType]:
    """Handle get entry info service."""
    runtime = _runtime_from_call(call)
    entry = _entry_from_call(call)
    return {
        "permit_id": runtime.permit_id,
        "provider_id": runtime.provider_config.provider_id,
        "municipality_name": runtime.provider_config.municipality_name,
        "auto_end_reservation_when_free": bool(entry.options.get(CONF_AUTO_END, False)),
        "reservation_update_fields": [
            cast("JsonValueType", str(field))
            for field in reservation_update_fields(runtime.provider)
        ],
    }


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

    _LOGGER.debug(
        "Fallback update: cancel and recreate reservation %s "
        "for device %s (start=%s end=%s plate=%s)",
        reservation_id,
        runtime.provider_config.provider_id,
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
        _LOGGER.debug(
            "Fallback reservation update failed for %s: %s: %s",
            reservation_id,
            type(err).__name__,
            err,
        )
        ha_cvp_version, pycvp_version = await async_get_versions(
            runtime.coordinator.hass
        )
        _raise_reservation_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )
    else:
        _LOGGER.debug("Fallback reservation update succeeded for %s", reservation_id)


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
    _LOGGER.debug(
        "Fallback favorite update: remove and recreate favorite %s "
        "for device %s (plate=%s name=%s)",
        favorite_id,
        runtime.provider_config.provider_id,
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
        _LOGGER.debug(
            "Fallback favorite update failed for %s: %s: %s",
            favorite_id,
            type(err).__name__,
            err,
        )
        ha_cvp_version, pycvp_version = await async_get_versions(
            runtime.coordinator.hass
        )
        _raise_favorite_error(
            err,
            **_runtime_log_context(runtime),
            ha_cvp_version=ha_cvp_version,
            pycvp_version=pycvp_version,
        )
    else:
        _LOGGER.debug("Fallback favorite update succeeded for %s", favorite_id)


def _runtime_from_call(call: ServiceCall) -> CityVisitorParkingRuntimeData:
    """Resolve runtime data from a service call."""
    entry = _entry_from_call(call)
    _LOGGER.debug(
        "Resolved runtime for %s (permit %s) from device %s (data keys=%s)",
        entry.title,
        entry.data.get(CONF_PERMIT_ID),
        call.data.get(ATTR_DEVICE_ID),
        list(call.data),
    )
    return entry.runtime_data


def _entry_from_call(call: ServiceCall) -> ConfigEntry:
    """Resolve the loaded config entry that owns the targeted device."""
    _, entry = service.async_get_device_and_config_entry(
        call.hass,
        DOMAIN,
        str(call.data[ATTR_DEVICE_ID]),
        include_child_devices=False,
    )
    return entry


def _as_utc(value: datetime) -> datetime:
    """Normalize a datetime to UTC, assuming the HA timezone for naive datetimes."""
    if value.tzinfo:
        return dt_util.as_utc(value)
    return dt_util.as_utc(value.replace(tzinfo=dt_util.DEFAULT_TIME_ZONE))


def _is_not_supported(err: ProviderError) -> bool:
    """Return True when the provider reports an unsupported operation."""
    message = str(err).lower()
    return "not supported" in message or "unsupported" in message


async def _async_refresh_runtime_data(
    runtime: CityVisitorParkingRuntimeData,
    *,
    device_id: str,
    translation_key: str,
    log_label: str,
) -> tuple[CoordinatorData, bool]:
    """Refresh coordinator data for a response service."""
    stale = False
    try:
        await runtime.coordinator.async_refresh()
    except Exception as err:  # pragma: no cover - defensive
        _LOGGER.debug(
            "%s refresh raised for device %s: %s: %s",
            log_label,
            device_id,
            type(err).__name__,
            err,
        )
        if runtime.coordinator.data:
            stale = True
        else:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key=translation_key,
            ) from err

    if not runtime.coordinator.last_update_success:
        reason = runtime.coordinator.last_exception
        _LOGGER.debug(
            "%s refresh failed for device %s: %s: %s",
            log_label,
            device_id,
            type(reason).__name__ if reason else "Unknown",
            reason,
        )
        if runtime.coordinator.data:
            stale = True
        else:
            raise HomeAssistantError(
                translation_domain=DOMAIN,
                translation_key=translation_key,
            )

    coordinator_data = cast("CoordinatorData | None", runtime.coordinator.data)
    if coordinator_data is None:
        raise HomeAssistantError(
            translation_domain=DOMAIN,
            translation_key=translation_key,
        )
    return coordinator_data, stale
