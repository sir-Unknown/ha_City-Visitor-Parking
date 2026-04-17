"""Coordinator for City visitor parking data."""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Protocol, cast

from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util
from pycityvisitorparking import AuthError, NetworkError
from pycityvisitorparking.exceptions import PyCityVisitorParkingError

from .const import (
    AUTO_END_COOLDOWN,
    CONF_AUTO_END,
    DEFAULT_UPDATE_INTERVAL,
    IDLE_UPDATE_INTERVAL,
    TRANSITION_BUFFER,
    TRANSITION_LOOKAHEAD,
)
from .helpers import get_attr
from .models import (
    AutoEndState,
    CoordinatorData,
    Reservation,
    TimeRange,
    ZoneAvailability,
)
from .models import Favorite as CoordinatorFavorite
from .time_windows import windows_for_today
from .version import async_get_versions, build_log_block

if TYPE_CHECKING:
    from collections.abc import Iterable, Mapping

    from homeassistant.config_entries import ConfigEntry
    from homeassistant.core import HomeAssistant
    from pycityvisitorparking import Favorite as ProviderFavorite
    from pycityvisitorparking import Permit
    from pycityvisitorparking import Reservation as ProviderReservation
    from pycityvisitorparking.provider.base import BaseProvider as ProviderProtocol
else:

    class ProviderProtocol(Protocol):
        """Protocol for runtime provider behavior."""

        async def fetch_all(self) -> tuple[object, list[object], list[object]]:
            """Return permit, reservations, and favorites in one batch."""
            raise NotImplementedError

        async def end_reservation(
            self,
            reservation_id: str,
            end_time: datetime,
        ) -> object:
            """End a reservation."""
            raise NotImplementedError

    ProviderFavorite = object
    Permit = object
    ProviderReservation = object

_LOGGER = logging.getLogger(__name__)


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
            logger=_LOGGER,
            name=config_entry.title,
            update_interval=DEFAULT_UPDATE_INTERVAL,
            config_entry=config_entry,
        )
        self._entry_title: str = config_entry.title
        self._provider: ProviderProtocol = provider
        self._permit_id: str = permit_id
        self._auto_end_state: AutoEndState = auto_end_state
        self._unavailable_logged: bool = False

    async def _async_update_data(self) -> CoordinatorData:
        """Fetch data from the API and normalize it."""
        ha_cvp_version, pycvp_version = await async_get_versions(self.hass)
        try:
            _LOGGER.debug(
                "Fetching permit, reservations, and favorites for %s (permit %s)",
                self._entry_title,
                self._permit_id,
            )

            started = time.perf_counter()
            permit, reservations, favorites = await self._provider.fetch_all()
            _LOGGER.debug(
                "Provider %s fetch_all duration: %.3fs — reservations=%s favorites=%s",
                self._entry_title,
                time.perf_counter() - started,
                len(reservations or []),
                len(favorites or []),
            )
            if self._unavailable_logged:
                _LOGGER.info("Visitor parking data is available again")
                self._unavailable_logged = False
        except AuthError as err:
            self._log_unavailable_once()
            _LOGGER.debug(
                "%s",
                build_log_block(
                    "coordinator auth failed",
                    {
                        "entry": self._entry_title,
                        "permit": self._permit_id,
                        "error-type": type(err).__name__,
                        "error": str(err),
                    },
                    provider=self._provider.provider_id,
                    city=getattr(self._provider, "_request_context_name", None)
                    or "unknown",
                    ha_cvp_version=ha_cvp_version,
                    pycvp_version=pycvp_version,
                ),
            )
            raise ConfigEntryAuthFailed from err
        except (NetworkError, PyCityVisitorParkingError) as err:
            self._log_unavailable_once()
            _LOGGER.debug(
                "%s",
                build_log_block(
                    "coordinator fetch failed",
                    {
                        "entry": self._entry_title,
                        "permit": self._permit_id,
                        "error-type": type(err).__name__,
                        "error": str(err),
                    },
                    provider=self._provider.provider_id,
                    city=getattr(self._provider, "_request_context_name", None)
                    or "unknown",
                    ha_cvp_version=ha_cvp_version,
                    pycvp_version=pycvp_version,
                ),
            )
            raise UpdateFailed("API communication error") from err
        except Exception as err:  # Allowed in background tasks
            self._log_unavailable_once()
            _LOGGER.debug(
                "%s",
                build_log_block(
                    "coordinator fetch failed unexpectedly",
                    {
                        "entry": self._entry_title,
                        "permit": self._permit_id,
                        "error-type": type(err).__name__,
                        "error": str(err),
                    },
                    provider=self._provider.provider_id,
                    city=getattr(self._provider, "_request_context_name", None)
                    or "unknown",
                    ha_cvp_version=ha_cvp_version,
                    pycvp_version=pycvp_version,
                ),
            )
            raise UpdateFailed("Unexpected error") from err

        remaining_balance = _normalize_remaining_balance(permit)
        balance_unit = get_attr(permit, "balance_unit")
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
            permit_remaining_balance=remaining_balance,
            permit_balance_unit=balance_unit if isinstance(balance_unit, str) else None,
            zone_validity=tuple(zone_validity),
            reservations=tuple(normalized_reservations),
            favorites=tuple(normalized_favorites),
            zone_availability=zone_availability,
            active_reservations=tuple(active_reservations),
        )

        next_interval = self._compute_next_interval(data, now)
        current_interval: timedelta | None = self.update_interval  # type: ignore[has-type]
        if next_interval != current_interval:
            _LOGGER.debug(
                "Adaptive interval for %s: %s → %s",
                self._entry_title,
                current_interval,
                next_interval,
            )
            self.update_interval = next_interval  # type: ignore[has-type]

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
                _LOGGER.debug(
                    "Auto-end failed for an active reservation", exc_info=True
                )

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
        """Return options from the config entry."""
        return self.config_entry.options if self.config_entry is not None else {}

    def _log_unavailable_once(self) -> None:
        """Log an unavailable message only once until recovery."""
        if self._unavailable_logged:
            return
        _LOGGER.info("Visitor parking data is unavailable")
        self._unavailable_logged = True

    def _compute_next_interval(self, data: CoordinatorData, now: datetime) -> timedelta:
        """Return the polling interval to use after the current update.

        The interval adapts to the current state so that the coordinator polls
        frequently when there is something time-sensitive to track, and falls
        back to a longer idle interval when nothing is expected to change soon.
        This reduces API calls significantly during quiet periods without
        sacrificing responsiveness when it matters.

        Decision tree (first match wins):

        1. **Active reservation present** → ``DEFAULT_UPDATE_INTERVAL``
           An active reservation must be tracked closely: balance may change,
           the auto-end feature needs to fire on time, and the user expects
           timely sensor updates.

        2. **Zone currently chargeable** → ``DEFAULT_UPDATE_INTERVAL``
           Even without a current reservation the zone is "open for business";
           a reservation could be started at any moment and should appear in HA
           promptly.

        3. **Zone transition imminent** (within ``TRANSITION_LOOKAHEAD``) →
           ``DEFAULT_UPDATE_INTERVAL``
           Polling at full speed ensures the zone-state sensor flips as soon as
           the paid-parking window opens or closes.

        4. **Zone transition known, not imminent** → precise interval
           Schedule the next update to arrive ``TRANSITION_BUFFER`` before the
           upcoming transition, capped at ``IDLE_UPDATE_INTERVAL``.  This
           combines two goals: the coordinator wakes up just in time to catch
           the transition (precise scheduling), but never goes completely silent
           for more than ``IDLE_UPDATE_INTERVAL``.

        5. **No upcoming transition known** → ``IDLE_UPDATE_INTERVAL``
           Nothing is expected to change; poll at the minimum rate to keep data
           reasonably fresh while minimising API traffic.
        """
        # 1. Active reservation — track closely.
        if data.active_reservations:
            return DEFAULT_UPDATE_INTERVAL

        # 2. Zone is chargeable right now — stay responsive.
        if data.zone_availability.is_chargeable_now:
            return DEFAULT_UPDATE_INTERVAL

        next_change = data.zone_availability.next_change_time
        if next_change is not None:
            time_until_change = next_change - now

            # 3. Transition is imminent — switch to fast polling.
            if time_until_change <= TRANSITION_LOOKAHEAD:
                return DEFAULT_UPDATE_INTERVAL

            # 4. Transition is known but not imminent — schedule precisely.
            #    Arrive TRANSITION_BUFFER before the change, but cap at the
            #    idle interval so we never sleep longer than that.
            precise_interval = max(time_until_change - TRANSITION_BUFFER, timedelta(0))
            return min(precise_interval, IDLE_UPDATE_INTERVAL)

        # 5. No known upcoming change — idle polling.
        return IDLE_UPDATE_INTERVAL


def _parse_time_range(item: object) -> TimeRange | None:
    """Parse start_time/end_time from an item into a valid TimeRange, or None."""
    start = get_attr(item, "start_time")
    end = get_attr(item, "end_time")
    if start is None or end is None:
        return None
    start_dt = _as_utc_datetime(start)
    end_dt = _as_utc_datetime(end)
    if start_dt >= end_dt:
        return None
    return TimeRange(start=start_dt, end=end_dt)


def _normalize_zone_validity(permit: Permit) -> list[TimeRange]:
    """Normalize zone validity blocks to TimeRange objects in UTC."""
    raw_blocks = get_attr(permit, "zone_validity")
    if not isinstance(raw_blocks, list):
        return []
    return [
        time_range
        for block in cast("list[object]", raw_blocks)
        if (time_range := _parse_time_range(block)) is not None
    ]


def _normalize_remaining_balance(permit: Permit) -> float:
    """Normalize remaining balance (minutes, times, or monetary amount)."""
    raw = get_attr(permit, "remaining_balance")
    if raw is None:
        return 0.0
    try:
        if not isinstance(raw, int | float | str):
            return 0.0
        value = float(raw)
    except TypeError, ValueError:
        return 0.0
    return max(0.0, value)


def _normalize_reservations(
    reservations: Iterable[ProviderReservation],
) -> list[Reservation]:
    """Normalize reservation entries to Reservation objects."""
    normalized: list[Reservation] = []
    for reservation in reservations or []:
        reservation_id = get_attr(reservation, "id")
        if reservation_id is None:
            continue
        time_range = _parse_time_range(reservation)
        if time_range is None:
            continue
        license_plate = get_attr(reservation, "license_plate")
        normalized.append(
            Reservation(
                reservation_id=str(reservation_id),
                start_time=time_range.start,
                end_time=time_range.end,
                license_plate=str(license_plate) if license_plate else None,
            )
        )
    return normalized


def _normalize_favorites(
    favorites: Iterable[ProviderFavorite],
) -> list[CoordinatorFavorite]:
    """Normalize favorite entries to Favorite objects."""
    normalized: list[CoordinatorFavorite] = []
    for favorite in favorites or []:
        favorite_id = get_attr(favorite, "id")
        license_plate = get_attr(favorite, "license_plate")
        name = get_attr(favorite, "name")
        if favorite_id is None:
            continue
        normalized.append(
            CoordinatorFavorite(
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
    windows_today = windows_for_today(zone_validity, options, now)
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
        windows_today=tuple(windows_today),
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
