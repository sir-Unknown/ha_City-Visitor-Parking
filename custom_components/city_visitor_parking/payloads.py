"""Response payload helpers for City visitor parking."""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from homeassistant.util import dt as dt_util

from .const import STATE_CHARGEABLE, STATE_FREE
from .helpers import get_attr, normalize_plate
from .time_windows import (
    current_or_next_window,
    current_or_next_window_with_overrides,
    windows_for_today,
)

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping, Sequence
    from datetime import datetime

    from pycityvisitorparking import Favorite as ProviderFavorite

    from .models import (
        CoordinatorData,
        Favorite,
        Reservation,
        TimeRange,
        Zone,
        ZoneAvailability,
    )


def utc_iso(value: datetime | None) -> str | None:
    """Return a UTC ISO8601 timestamp string."""
    if value is None:
        return None
    return dt_util.as_utc(value).isoformat()


def timerange_payload(window: TimeRange) -> dict[str, str]:
    """Convert a time range to a JSON-serializable payload."""
    return {
        "start": utc_iso(window.start) or "",
        "end": utc_iso(window.end) or "",
    }


def reservation_zone_payload(
    reservation: Reservation,
    zones: Sequence[Zone],
    options: Mapping[str, object],
    now: datetime,
) -> dict[str, str]:
    """Return the zone keys of a reservation; empty when it has no zone.

    ``zone_name`` falls back to the zone ID when the zone is not in ``zones``.
    ``zone_window_start``/``zone_window_end`` give the paid window of that zone
    that applies to the reservation: the window running at its start (or now,
    once it started), else the next one. They are absent when the zone is
    unknown or no paid window falls within the reservation.
    """
    zone_id = reservation.zone_id
    if not zone_id:
        return {}
    zone = next((zone for zone in zones if zone.zone_id == zone_id), None)
    payload = {
        "zone_id": zone_id,
        "zone_name": zone.name if zone is not None and zone.name else zone_id,
    }
    if zone is None:
        return payload
    # A reservation's own zone decides when it is paid, not the permit default.
    reference = max(now, reservation.start_time)
    window = current_or_next_window_with_overrides(
        zone.zone_validity, options, reference
    )
    if window is not None and window.start < reservation.end_time:
        payload["zone_window_start"] = utc_iso(window.start) or ""
        payload["zone_window_end"] = utc_iso(window.end) or ""
    return payload


def reservation_payload(
    reservation: Reservation,
    favorite_by_plate: Mapping[str, Favorite],
    zones: Sequence[Zone],
    options: Mapping[str, object],
    now: datetime,
) -> dict[str, str]:
    """Build a reservation response payload with favorite and zone metadata.

    Zone keys come from ``reservation_zone_payload``.
    """
    payload: dict[str, str] = {
        "reservation_id": reservation.reservation_id,
        "start_time": utc_iso(reservation.start_time) or "",
        "end_time": utc_iso(reservation.end_time) or "",
        **reservation_zone_payload(reservation, zones, options, now),
    }

    license_plate = reservation.license_plate
    plate = normalize_plate(license_plate)
    if plate and license_plate is not None:
        payload["license_plate"] = license_plate
        favorite = favorite_by_plate.get(plate)
        if favorite is not None:
            payload["favorite_id"] = favorite.favorite_id
            if favorite.name:
                payload["favorite_name"] = favorite.name
    return payload


def normalize_favorites(
    favorites: Iterable[ProviderFavorite],
) -> list[dict[str, str]]:
    """Normalize favorites to a JSON-serializable structure."""
    normalized: list[dict[str, str]] = []
    for favorite in favorites or []:
        favorite_id = get_attr(favorite, "id")
        license_plate = get_attr(favorite, "license_plate")
        name = get_attr(favorite, "name")
        if favorite_id is None and license_plate is None:
            continue

        payload: dict[str, str] = {}
        if favorite_id is not None:
            payload["id"] = str(favorite_id)
        if license_plate is not None:
            payload["license_plate"] = str(license_plate)
        if name is not None:
            payload["name"] = str(name)
        normalized.append(payload)

    return normalized


def _availability_payload(
    zone_validity: Sequence[TimeRange],
    availability: ZoneAvailability,
    options: Mapping[str, object],
    now: datetime,
    *,
    stale: bool,
) -> dict[str, object]:
    """Return state and current/next effective window for one set of windows."""
    effective_windows_today = windows_for_today(zone_validity, options, now)
    effective_window = current_or_next_window_with_overrides(
        zone_validity,
        options,
        now,
    )
    is_chargeable_now = availability.is_chargeable_now
    next_change_time = availability.next_change_time
    if stale:
        current_effective_window = next(
            (
                window
                for window in effective_windows_today
                if window.start <= now < window.end
            ),
            None,
        )
        is_chargeable_now = current_effective_window is not None
        if current_effective_window is not None:
            next_change_time = current_effective_window.end
        else:
            next_change_time = effective_window.start if effective_window else None

    state = STATE_CHARGEABLE if is_chargeable_now else STATE_FREE
    window_kind: str | None = None
    if effective_window is not None:
        is_current = effective_window.start <= now < effective_window.end
        is_next = effective_window.start > now
        if state == STATE_CHARGEABLE and is_current:
            window_kind = "current"
        elif state == STATE_FREE and is_next:
            window_kind = "next"

    return {
        "state": state,
        "is_chargeable_now": is_chargeable_now,
        "next_change_time": utc_iso(next_change_time),
        "window_kind": window_kind,
        "window_start": utc_iso(effective_window.start) if effective_window else None,
        "window_end": utc_iso(effective_window.end) if effective_window else None,
        "effective_windows_today": effective_windows_today,
    }


def build_status_payload(
    data: CoordinatorData,
    options: Mapping[str, object],
    now: datetime,
    *,
    stale: bool = False,
) -> dict[str, object]:
    """Build the shared status response for services and websocket.

    Top-level fields describe the default zone. ``zones`` repeats the state and
    window per selectable zone (default first) so the card can switch zones
    without another request; it is empty when the permit has no zones.
    """
    provider_windows_today = windows_for_today(data.zone_validity, {}, now)
    provider_window = current_or_next_window(data.zone_validity, now)
    default_status = _availability_payload(
        data.zone_validity, data.zone_availability, options, now, stale=stale
    )
    effective_windows_today = cast(
        "list[TimeRange]", default_status.pop("effective_windows_today")
    )
    zones: list[dict[str, object]] = []
    for zone in data.zones:
        zone_status = _availability_payload(
            zone.zone_validity, zone.zone_availability, options, now, stale=stale
        )
        del zone_status["effective_windows_today"]
        del zone_status["is_chargeable_now"]
        zones.append({"zone_id": zone.zone_id, "name": zone.name, **zone_status})

    return {
        **default_status,
        "effective_windows_today": [
            timerange_payload(window) for window in effective_windows_today
        ],
        "provider_windows_today": [
            timerange_payload(window) for window in provider_windows_today
        ],
        "zone_validity": [timerange_payload(window) for window in data.zone_validity],
        "provider_window_start": (
            utc_iso(provider_window.start) if provider_window else None
        ),
        "provider_window_end": (
            utc_iso(provider_window.end) if provider_window else None
        ),
        "remaining_balance": max(0.0, data.permit_remaining_balance),
        "balance_unit": data.permit_balance_unit,
        "permit_id": data.permit_id,
        "zones": zones,
    }
