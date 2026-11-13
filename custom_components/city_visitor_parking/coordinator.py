"""Coordinator for City visitor parking data."""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Protocol, cast

from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util
from pycityvisitorparking import AuthError, NetworkError, ProviderError
from pycityvisitorparking.exceptions import (
    NotFoundError,
    PyCityVisitorParkingError,
    RateLimitError,
    ServiceUnavailableError,
)

from .auth import async_provider_login, has_stored_credentials
from .const import (
    AUTO_END_COOLDOWN,
    CONF_AUTO_END,
    CONF_DEFAULT_PARKING_AREA,
    DEFAULT_UPDATE_INTERVAL,
    ERROR_CODE_PROVIDER_REJECTED,
    IDLE_UPDATE_INTERVAL,
    RELOGIN_COOLDOWN,
    RELOGIN_REJECTIONS_BEFORE_REAUTH,
    TRANSITION_BUFFER,
    TRANSITION_LOOKAHEAD,
)
from .helpers import get_attr
from .models import (
    AutoEndState,
    CoordinatorData,
    PaidParkingStatus,
    ParkingArea,
    Reservation,
    TimeRange,
)
from .models import Favorite as CoordinatorFavorite
from .time_windows import windows_for_today
from .version import async_get_versions, build_log_block

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable, Iterable, Mapping

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

        async def list_reservation_targets(self) -> list[object]:
            """Return the targets a reservation can be started for."""
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
        self._entry: ConfigEntry = config_entry
        self._last_relogin: datetime | None = None
        self._relogin_rejections: int = 0

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
            permit, reservations, favorites = await self.async_call_with_relogin(
                self._provider.fetch_all
            )
            # Parking areas are the library's reservation targets; an empty list means
            # the permit has nothing to choose.
            targets = await self.async_call_with_relogin(
                self._provider.list_reservation_targets
            )
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
        normalized_reservations = _normalize_reservations(reservations)
        normalized_favorites = _normalize_favorites(favorites)
        now = dt_util.utcnow()
        options = self._options()
        active_reservations = _active_reservations(normalized_reservations, now)
        parking_areas = _order_default_parking_area_first(
            _normalize_parking_areas(targets, options, now),
            options.get(CONF_DEFAULT_PARKING_AREA),
        )
        # The permit-level windows (sensors, status, auto-end fallback) follow the
        # default parking area: the user's choice from the options, else the provider's.
        paid_hours = (
            list(parking_areas[0].paid_hours)
            if parking_areas
            else _normalize_paid_hours(permit)
        )
        paid_parking_status = (
            parking_areas[0].paid_parking_status
            if parking_areas
            else _compute_paid_parking_status(paid_hours, options, now)
        )

        data = CoordinatorData(
            permit_id=self._permit_id,
            permit_remaining_balance=remaining_balance,
            permit_balance_unit=balance_unit if isinstance(balance_unit, str) else None,
            paid_hours=tuple(paid_hours),
            reservations=tuple(normalized_reservations),
            favorites=tuple(normalized_favorites),
            paid_parking_status=paid_parking_status,
            active_reservations=tuple(active_reservations),
            parking_areas=tuple(parking_areas),
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

    async def async_call_with_relogin[T](
        self, operation: Callable[[], Awaitable[T]]
    ) -> T:
        """Run a provider call, recovering once from an expired provider session.

        The session established at setup is not refreshed anywhere else, so it
        eventually expires while the entry keeps running. The library retries a
        request once after re-authenticating, but only when the provider answers
        with an explicit auth status; a provider that reports an expired session
        as a generic server error instead keeps the dead session in place and
        every following call fails until the entry is reloaded by hand.

        Reloading only helps because it logs in again, so do exactly that here
        and retry the call once. Failures that a new session cannot fix are
        re-raised untouched, see ``_is_session_failure``.

        ``AuthError`` stays in the retry set because the library's own
        re-authentication is opt-in per provider request; for providers that do
        not use it, this is the only path that renews the session.

        Only use this for calls that are safe to repeat. A provider error does
        not prove the first attempt was not processed, so a retried write could
        be applied twice; writes use ``async_renew_session`` instead.
        """
        try:
            result = await operation()
        except PyCityVisitorParkingError as err:
            if not self._is_session_failure(err) or not self._may_relogin():
                raise
            _LOGGER.debug(
                "Call for %s failed with %s; re-authenticating and retrying once",
                self._entry_title,
                type(err).__name__,
            )
            await self._async_relogin(err)
            result = await operation()
        # A working session clears the recovery state, so the next expiry is
        # handled immediately and an old rejection is not counted again.
        self._last_relogin = None
        self._relogin_rejections = 0
        return result

    async def async_renew_session(self, err: PyCityVisitorParkingError) -> None:
        """Re-authenticate after a failed call that must not be repeated.

        For writes the failed call is reported to the caller unchanged; this
        only makes sure the next attempt does not hit the same dead session
        instead of waiting for the next poll. Never raises: the original error
        is what the caller needs to see, and a rejected login is counted so the
        next poll can still escalate to reauth.
        """
        if not self._is_session_failure(err) or not self._may_relogin():
            return
        _LOGGER.debug(
            "Call for %s failed with %s; re-authenticating for the next attempt",
            self._entry_title,
            type(err).__name__,
        )
        try:
            await self._async_relogin(err)
        except PyCityVisitorParkingError as login_err:
            _LOGGER.debug(
                "Re-login for %s failed: %s",
                self._entry_title,
                type(login_err).__name__,
            )

    @staticmethod
    def _is_session_failure(err: PyCityVisitorParkingError) -> bool:
        """Return whether a fresh session could plausibly fix this failure.

        A ``NetworkError`` never reached the provider, rate-limit and
        maintenance responses would only be made worse by an extra login, and a
        missing item, invalid input, or a request the provider refused (for
        example no balance left) is unrelated to the session.
        """
        if isinstance(err, RateLimitError | ServiceUnavailableError | NotFoundError):
            return False
        if err.error_code == ERROR_CODE_PROVIDER_REJECTED:
            return False
        return isinstance(err, AuthError | ProviderError)

    def _may_relogin(self) -> bool:
        """Return whether an automatic re-login may be attempted right now."""
        if not has_stored_credentials(self._entry):
            return False
        if self._last_relogin is None:
            return True
        return dt_util.utcnow() - self._last_relogin >= RELOGIN_COOLDOWN

    async def _async_relogin(self, trigger: PyCityVisitorParkingError) -> None:
        """Re-authenticate the provider with the credentials on the entry.

        A rejected login escalates to a reauth flow (``AuthError`` reaches
        ``_async_update_data``) only when it is a credential problem with
        reasonable certainty: the failed update was itself an ``AuthError``, or
        the login has now been rejected in consecutive cooldown windows. A
        single rejection after a generic provider error may be part of the same
        outage, so it is reported as that provider error instead.
        """
        # Recorded before the attempt so a login that fails or hangs still
        # spaces out the next one.
        self._last_relogin = dt_util.utcnow()
        try:
            await async_provider_login(self._entry, self._provider)
        except AuthError:
            self._relogin_rejections += 1
            if (
                isinstance(trigger, AuthError)
                or self._relogin_rejections >= RELOGIN_REJECTIONS_BEFORE_REAUTH
            ):
                raise
            _LOGGER.debug(
                "Re-login for %s was rejected after %s; retrying after cooldown",
                self._entry_title,
                type(trigger).__name__,
            )
            raise trigger from None
        self._relogin_rejections = 0

    async def _async_maybe_auto_end(self, data: CoordinatorData) -> None:
        """Auto-end reservations whose parking area is no longer paid."""
        options = self._options()
        if not options.get(CONF_AUTO_END, False):
            return
        if not data.active_reservations:
            return

        now = dt_util.utcnow()
        self._prune_auto_end_attempts(now)

        for reservation in data.active_reservations:
            # Parking areas have different paid hours, so judge each reservation by its
            # own parking area; fall back to the permit's default parking area when it
            # is unknown.
            parking_area = data.parking_area(reservation.parking_area_id)
            availability = (
                parking_area.paid_parking_status
                if parking_area is not None
                else data.paid_parking_status
            )
            if availability.is_paid_now:
                continue
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

        2. **ParkingArea currently paid** → ``DEFAULT_UPDATE_INTERVAL``
           Even without a current reservation paid parking is "open for business";
           a reservation could be started at any moment and should appear in HA
           promptly.

        3. **ParkingArea transition imminent** (within ``TRANSITION_LOOKAHEAD``) →
           ``DEFAULT_UPDATE_INTERVAL``
           Polling at full speed ensures the paid parking sensor flips as soon as
           the paid-parking window opens or closes.

        4. **ParkingArea transition known, not imminent** → precise interval
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

        # 2. Paid parking is active right now — stay responsive.
        if data.paid_parking_status.is_paid_now:
            return DEFAULT_UPDATE_INTERVAL

        next_change = data.paid_parking_status.next_change_time
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


def _normalize_paid_hours(permit_or_parking_area: object) -> list[TimeRange]:
    """Normalize paid hours blocks of a permit or parking area to UTC."""
    # "zone_validity" is the library's field name for the paid hours.
    raw_blocks = get_attr(permit_or_parking_area, "zone_validity")
    if not isinstance(raw_blocks, list):
        return []
    return [
        time_range
        for block in cast("list[object]", raw_blocks)
        if (time_range := _parse_time_range(block)) is not None
    ]


def _normalize_parking_areas(
    targets: object, options: Mapping[str, object], now: datetime
) -> list[ParkingArea]:
    """Normalize the library's reservation targets to parking areas, in order.

    The first target is the provider default. A list that is not a list of targets
    means the permit has nothing to choose.
    """
    if not isinstance(targets, list):
        return []
    parking_areas: list[ParkingArea] = []
    for raw_parking_area in cast("list[object]", targets):
        parking_area_id = get_attr(raw_parking_area, "id")
        if parking_area_id is None:
            continue
        name = get_attr(raw_parking_area, "name")
        paid_hours = _normalize_paid_hours(raw_parking_area)
        parking_areas.append(
            ParkingArea(
                parking_area_id=str(parking_area_id),
                name=str(name) if name else str(parking_area_id),
                paid_hours=tuple(paid_hours),
                paid_parking_status=_compute_paid_parking_status(
                    paid_hours, options, now
                ),
            )
        )
    return parking_areas


def _order_default_parking_area_first(
    parking_areas: list[ParkingArea], default_parking_area_id: object
) -> list[ParkingArea]:
    """Move the user's default parking area to the front; keep other order.

    A stored default that the permit no longer has is ignored, so the provider's
    default (its first parking area) applies again.
    """
    if not isinstance(default_parking_area_id, str):
        return parking_areas
    for index, parking_area in enumerate(parking_areas):
        if parking_area.parking_area_id == default_parking_area_id:
            return [parking_area, *parking_areas[:index], *parking_areas[index + 1 :]]
    return parking_areas


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
        parking_area_id = get_attr(reservation, "reservation_target_id")
        normalized.append(
            Reservation(
                reservation_id=str(reservation_id),
                start_time=time_range.start,
                end_time=time_range.end,
                license_plate=str(license_plate) if license_plate else None,
                parking_area_id=str(parking_area_id)
                if parking_area_id is not None
                else None,
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


def _compute_paid_parking_status(
    paid_hours: list[TimeRange],
    options: Mapping[str, object],
    now: datetime,
) -> PaidParkingStatus:
    """Compute paid parking availability using validity blocks and overrides."""
    windows_today = windows_for_today(paid_hours, options, now)
    is_paid_now = any(window.start <= now < window.end for window in windows_today)

    next_change_time = None
    if windows_today:
        if is_paid_now:
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

    return PaidParkingStatus(
        is_paid_now=is_paid_now,
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
