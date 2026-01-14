"""Coordinator for City visitor parking data."""

from __future__ import annotations

import asyncio
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Protocol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util
from pycityvisitorparking import AuthError, NetworkError
from pycityvisitorparking.exceptions import PyCityVisitorParkingError

if TYPE_CHECKING:
    from pycityvisitorparking import Favorite as ProviderFavorite
    from pycityvisitorparking import Permit
    from pycityvisitorparking import Reservation as ProviderReservation
    from pycityvisitorparking.provider.base import BaseProvider as ProviderProtocol
else:

    class ProviderProtocol(Protocol):
        """Protocol for runtime provider behavior."""

        async def get_permit(self) -> object: ...

        async def list_reservations(self) -> list[object]: ...

        async def list_favorites(self) -> list[object]: ...

        async def end_reservation(
            self,
            reservation_id: str,
            end_time: datetime,
        ) -> object: ...

    ProviderFavorite = object
    Permit = object
    ProviderReservation = object

from .const import AUTO_END_COOLDOWN, CONF_AUTO_END, DEFAULT_UPDATE_INTERVAL, LOGGER
from .helpers import get_attr
from .models import (
    AutoEndState,
    CoordinatorData,
    Favorite,
    Reservation,
    TimeRange,
    ZoneAvailability,
)
from .time_windows import _windows_for_today


class CityVisitorParkingCoordinator(DataUpdateCoordinator[CoordinatorData]):
    """Data update coordinator for City visitor parking."""

    def __init__(
        self,
        hass: HomeAssistant,
        *,
        provider: ProviderProtocol,
        config_entry: ConfigEntry,
        permit_id: str,
        auto_end_state: AutoEndState,
    ) -> None:
        """Initialize the coordinator."""

        super().__init__(
            hass,
            logger=LOGGER,
            name=config_entry.title,
            update_interval=DEFAULT_UPDATE_INTERVAL,
            config_entry=config_entry,
        )
        self._entry_title = config_entry.title
        self._provider = provider
        self._permit_id = permit_id
        self._auto_end_state = auto_end_state
        self._unavailable_logged = False

    async def _async_update_data(self) -> CoordinatorData:
        """Fetch data from the API and normalize it."""

        try:
            LOGGER.debug(
                "Fetching permit, reservations, and favorites for %s (permit %s)",
                self._entry_title,
                self._permit_id,
            )
            permit, reservations, favorites = await asyncio.gather(
                self._provider.get_permit(),
                self._provider.list_reservations(),
                self._provider.list_favorites(),
            )
            LOGGER.debug(
                "Fetched data for %s (permit %s): reservations=%s favorites=%s",
                self._entry_title,
                self._permit_id,
                len(reservations or []),
                len(favorites or []),
            )
            if self._unavailable_logged:
                LOGGER.info("Visitor parking data is available again")
                self._unavailable_logged = False
        except AuthError as err:
            self._log_unavailable_once()
            raise ConfigEntryAuthFailed from err
        except (NetworkError, PyCityVisitorParkingError) as err:
            self._log_unavailable_once()
            LOGGER.debug(
                "Coordinator fetch failed for %s (permit %s): %s: %s",
                self._entry_title,
                self._permit_id,
                type(err).__name__,
                err,
            )
            raise UpdateFailed("API communication error") from err
        except Exception as err:  # Allowed in background tasks
            self._log_unavailable_once()
            LOGGER.debug(
                "Coordinator fetch failed unexpectedly for %s (permit %s): %s: %s",
                self._entry_title,
                self._permit_id,
                type(err).__name__,
                err,
            )
            raise UpdateFailed("Unexpected error") from err

        remaining_minutes = _normalize_remaining_minutes(permit)
        zone_validity = _normalize_zone_validity(permit)
        normalized_reservations = _normalize_reservations(reservations)
        normalized_favorites = _normalize_favorites(favorites)
        now = dt_util.utcnow()
        active_reservations = _active_reservations(normalized_reservations, now)
        zone_availability = _compute_zone_availability(
            zone_validity,
            self._options(),
            now,
        )

        data = CoordinatorData(
            permit_id=self._permit_id,
            permit_remaining_minutes=remaining_minutes,
            zone_validity=zone_validity,
            reservations=normalized_reservations,
            favorites=normalized_favorites,
            zone_availability=zone_availability,
            active_reservations=active_reservations,
        )
        await self._async_maybe_auto_end(data)
        return data

    async def _async_maybe_auto_end(self, data: CoordinatorData) -> None:
        """Auto-end reservations when the zone becomes free."""

        options = self._options()
        if not options.get(CONF_AUTO_END, False):
            return
        if data.zone_availability.is_chargeable_now:
            return
        if not data.active_reservations:
            return

        now = dt_util.utcnow()
        self._prune_auto_end_attempts(now)

        for reservation in data.active_reservations:
            if not _should_attempt_auto_end(
                self._auto_end_state,
                reservation.reservation_id,
                now,
            ):
                continue

            self._auto_end_state.attempted_ids[reservation.reservation_id] = now
            try:
                await self._provider.end_reservation(
                    reservation.reservation_id,
                    dt_util.as_utc(now),
                )
            except PyCityVisitorParkingError:
                LOGGER.debug("Auto-end failed for an active reservation", exc_info=True)

    def _prune_auto_end_attempts(self, now: datetime) -> None:
        """Remove stale auto-end attempts to keep memory usage small."""

        cutoff = now - timedelta(hours=6)
        self._auto_end_state.attempted_ids = {
            reservation_id: attempted_at
            for reservation_id, attempted_at in (
                self._auto_end_state.attempted_ids.items()
            )
            if attempted_at > cutoff
        }

    def _options(self) -> Mapping[str, object]:
        """Return options from the config entry or an empty mapping."""

        config_entry = self.config_entry
        if config_entry is None:
            return {}
        return config_entry.options

    def _log_unavailable_once(self) -> None:
        """Log an unavailable message only once until recovery."""

        if self._unavailable_logged:
            return
        LOGGER.info("Visitor parking data is unavailable")
        self._unavailable_logged = True


def _normalize_zone_validity(permit: Permit) -> list[TimeRange]:
    """Normalize zone validity blocks to TimeRange objects in UTC."""

    raw_blocks = get_attr(permit, "zone_validity")
    if not isinstance(raw_blocks, list):
        raw_blocks = []
    blocks: list[TimeRange] = []
    for block in raw_blocks:
        start = get_attr(block, "start_time")
        end = get_attr(block, "end_time")
        if start is None or end is None:
            continue
        start_dt = _as_utc_datetime(start)
        end_dt = _as_utc_datetime(end)
        if start_dt >= end_dt:
            continue
        blocks.append(TimeRange(start=start_dt, end=end_dt))
    return blocks


def _normalize_remaining_minutes(permit: Permit) -> int:
    """Normalize remaining time balance to minutes."""

    raw = get_attr(permit, "remaining_balance")
    if raw is None:
        return 0
    try:
        if not isinstance(raw, int | float | str):
            return 0
        value = int(raw)
    except (TypeError, ValueError):
        return 0
    return max(0, value)


def _normalize_reservations(
    reservations: Iterable[ProviderReservation],
) -> list[Reservation]:
    """Normalize reservation entries to Reservation objects."""

    normalized: list[Reservation] = []
    for reservation in reservations or []:
        reservation_id = get_attr(reservation, "id")
        start = get_attr(reservation, "start_time")
        end = get_attr(reservation, "end_time")
        license_plate = get_attr(reservation, "license_plate")
        if reservation_id is None or start is None or end is None:
            continue
        start_dt = _as_utc_datetime(start)
        end_dt = _as_utc_datetime(end)
        if start_dt >= end_dt:
            continue
        normalized.append(
            Reservation(
                reservation_id=str(reservation_id),
                start_time=start_dt,
                end_time=end_dt,
                license_plate=str(license_plate) if license_plate else None,
            )
        )
    return normalized


def _normalize_favorites(favorites: Iterable[ProviderFavorite]) -> list[Favorite]:
    """Normalize favorite entries to Favorite objects."""

    normalized: list[Favorite] = []
    for favorite in favorites or []:
        favorite_id = get_attr(favorite, "id")
        license_plate = get_attr(favorite, "license_plate")
        name = get_attr(favorite, "name")
        if favorite_id is None:
            continue
        normalized.append(
            Favorite(
                favorite_id=str(favorite_id),
                license_plate=str(license_plate) if license_plate else None,
                name=str(name) if name else None,
            )
        )
    return normalized


def _active_reservations(
    reservations: list[Reservation], now: datetime
) -> list[Reservation]:
    """Return reservations active at the provided time."""

    return [
        reservation
        for reservation in reservations
        if reservation.start_time <= now < reservation.end_time
    ]


def _compute_zone_availability(
    zone_validity: list[TimeRange],
    options: Mapping[str, object],
    now: datetime,
) -> ZoneAvailability:
    """Compute zone availability using validity blocks and overrides."""

    windows_today = _windows_for_today(zone_validity, options, now)
    is_chargeable_now = any(
        window.start <= now < window.end for window in windows_today
    )

    next_change_time = None
    if windows_today:
        if is_chargeable_now:
            next_change_time = min(
                (
                    window.end
                    for window in windows_today
                    if window.start <= now < window.end
                ),
                default=None,
            )
        else:
            next_change_time = min(
                (window.start for window in windows_today if window.start > now),
                default=None,
            )

    return ZoneAvailability(
        is_chargeable_now=is_chargeable_now,
        next_change_time=next_change_time,
        windows_today=windows_today,
    )


def _should_attempt_auto_end(
    state: AutoEndState, reservation_id: str, now: datetime
) -> bool:
    """Return True when a reservation can be auto-ended."""

    last_attempt = state.attempted_ids.get(reservation_id)
    if last_attempt is None:
        return True
    return now - last_attempt > AUTO_END_COOLDOWN


def _as_utc_datetime(value: object) -> datetime:
    """Convert a datetime or ISO string into a UTC datetime."""

    if isinstance(value, datetime):
        if value.tzinfo:
            return dt_util.as_utc(value)
        return value.replace(tzinfo=UTC)

    if isinstance(value, str):
        parsed = dt_util.parse_datetime(value)
        if parsed is None:
            raise ValueError("Unsupported datetime string")
        if parsed.tzinfo:
            return dt_util.as_utc(parsed)
        return parsed.replace(tzinfo=UTC)

    raise ValueError("Unsupported datetime value")
