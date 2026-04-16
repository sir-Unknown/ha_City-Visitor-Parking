"""Tests for the City visitor parking coordinator."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, time, timedelta
from types import SimpleNamespace
from typing import TYPE_CHECKING, Any, cast
from unittest.mock import AsyncMock

import pytest
from freezegun import freeze_time
from homeassistant.exceptions import ConfigEntryAuthFailed
from homeassistant.helpers.update_coordinator import UpdateFailed
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

import custom_components.city_visitor_parking.coordinator as coord_module
from custom_components.city_visitor_parking.const import (
    CONF_AUTO_END,
    CONF_OPERATING_TIME_OVERRIDES,
    DEFAULT_UPDATE_INTERVAL,
    DOMAIN,
    IDLE_UPDATE_INTERVAL,
    TRANSITION_BUFFER,
    TRANSITION_LOOKAHEAD,
)
from custom_components.city_visitor_parking.coordinator import (
    CityVisitorParkingCoordinator,
    Permit,
    ProviderFavorite,
    ProviderProtocol,
    ProviderReservation,
    _as_utc_datetime,
    _compute_zone_availability,
    _normalize_favorites,
    _normalize_remaining_minutes,
    _normalize_reservations,
    _normalize_zone_validity,
    _should_attempt_auto_end,
)
from custom_components.city_visitor_parking.helpers import (
    get_attr,
    normalize_override_windows,
)
from custom_components.city_visitor_parking.models import (
    AutoEndState,
    CoordinatorData,
    Favorite,
    Reservation,
    TimeRange,
    ZoneAvailability,
)
from custom_components.city_visitor_parking.time_windows import (
    _as_time,
    windows_for_today,
)

if TYPE_CHECKING:
    from types import ModuleType

    from homeassistant.core import HomeAssistant
    from pytest import LogCaptureFixture, MonkeyPatch

EXPECTED_MINUTES = 15


async def test_auto_end_reservation_once(hass: HomeAssistant) -> None:
    """Auto-end should only happen once per reservation within cooldown."""
    entry = _create_entry(auto_end=True)
    entry.add_to_hass(hass)

    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    reservation = {
        "id": "res1",
        "start_time": (now - timedelta(hours=1)).isoformat(),
        "end_time": (now + timedelta(hours=1)).isoformat(),
    }

    provider = AsyncMock()
    provider.fetch_all.return_value = ({"zone_validity": []}, [reservation], [])

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    with freeze_time(now):
        await coordinator.async_refresh()
        await coordinator.async_refresh()

    provider.end_reservation.assert_awaited_once()


async def test_auth_failure_triggers_reauth(
    hass: HomeAssistant,
    pv_library: ModuleType,
    monkeypatch: MonkeyPatch,
    caplog: LogCaptureFixture,
) -> None:
    """Auth errors should raise ConfigEntryAuthFailed."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.fetch_all.side_effect = pv_library.AuthError
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.coordinator.async_get_versions",
        AsyncMock(return_value=("1.2.3", "4.5.6")),
    )

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    with caplog.at_level(
        logging.DEBUG, logger="custom_components.city_visitor_parking.coordinator"
    ):
        await coordinator.async_refresh()
    assert isinstance(coordinator.last_exception, ConfigEntryAuthFailed)
    assert "hacvp" in caplog.text
    assert "1.2.3" in caplog.text


async def test_network_failure_raises_updatefailed(
    hass: HomeAssistant,
    pv_library: ModuleType,
    monkeypatch: MonkeyPatch,
    caplog: LogCaptureFixture,
) -> None:
    """Network failures should raise UpdateFailed."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.fetch_all.side_effect = pv_library.NetworkError
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.coordinator.async_get_versions",
        AsyncMock(return_value=("1.2.3", "4.5.6")),
    )

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    with caplog.at_level(
        logging.DEBUG, logger="custom_components.city_visitor_parking.coordinator"
    ):
        await coordinator.async_refresh()
    assert isinstance(coordinator.last_exception, UpdateFailed)
    assert "hacvp" in caplog.text
    assert "1.2.3" in caplog.text


async def test_unexpected_failure_raises_updatefailed(hass: HomeAssistant) -> None:
    """Unexpected failures should raise UpdateFailed."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.fetch_all.side_effect = RuntimeError("boom")

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    await coordinator.async_refresh()
    assert isinstance(coordinator.last_exception, UpdateFailed)
    assert coordinator._unavailable_logged is True


async def test_coordinator_logs_recovery(hass: HomeAssistant) -> None:
    """Coordinator should log availability recovery."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.fetch_all.return_value = ({"zone_validity": []}, [], [])

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )
    coordinator._unavailable_logged = True

    await coordinator.async_refresh()

    assert coordinator._unavailable_logged is False


async def test_auto_end_handles_provider_failure(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
    """Auto-end should swallow provider failures."""
    entry = _create_entry(auto_end=True)
    entry.add_to_hass(hass)

    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    reservation = {
        "id": "res1",
        "start_time": (now - timedelta(hours=1)).isoformat(),
        "end_time": (now + timedelta(hours=1)).isoformat(),
    }

    provider = AsyncMock()
    provider.fetch_all.return_value = ({"zone_validity": []}, [reservation], [])
    provider.end_reservation.side_effect = pv_library.ProviderError

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    with freeze_time(now):
        await coordinator.async_refresh()

    provider.end_reservation.assert_awaited_once()


async def test_provider_protocol_raises() -> None:
    """Provider protocol defaults should raise when called."""
    protocol = cast("Any", ProviderProtocol)
    with pytest.raises(NotImplementedError):
        await protocol.fetch_all(object())
    with pytest.raises(NotImplementedError):
        await protocol.end_reservation(object(), "res", datetime.now(UTC))


def test_normalize_helpers() -> None:
    """Normalization helpers should handle invalid input."""
    assert (
        _normalize_remaining_minutes(cast("Permit", {"remaining_balance": None})) == 0
    )
    assert (
        _normalize_remaining_minutes(cast("Permit", {"remaining_balance": "bad"})) == 0
    )
    assert (
        _normalize_remaining_minutes(cast("Permit", {"remaining_balance": "-5"})) == 0
    )
    assert (
        _normalize_remaining_minutes(cast("Permit", {"remaining_balance": 15}))
        == EXPECTED_MINUTES
    )
    assert _normalize_remaining_minutes(cast("Permit", {"remaining_balance": []})) == 0

    now = datetime(2025, 1, 1, 8, 0, tzinfo=UTC)
    validity = _normalize_zone_validity(
        cast(
            "Permit",
            {
                "zone_validity": [
                    {
                        "start_time": now.isoformat(),
                        "end_time": (now + timedelta(hours=1)).isoformat(),
                    },
                    {
                        "start_time": now.isoformat(),
                        "end_time": now.isoformat(),
                    },
                    {"start_time": now.isoformat()},
                ]
            },
        )
    )
    assert len(validity) == 1
    assert _normalize_zone_validity(cast("Permit", {"zone_validity": {}})) == []

    parsed = _as_utc_datetime("2025-01-01T10:00:00+00:00")
    assert parsed.tzinfo is not None
    parsed_tz = _as_utc_datetime(datetime(2025, 1, 1, 10, 0, tzinfo=UTC))
    assert parsed_tz.tzinfo is not None
    parsed_naive = _as_utc_datetime("2025-01-01T10:00:00")
    assert parsed_naive.tzinfo is not None
    parsed_naive_dt = _as_utc_datetime(datetime(2025, 1, 1, 10, 0, tzinfo=UTC))
    assert parsed_naive_dt.tzinfo is not None
    with pytest.raises(ValueError):
        _as_utc_datetime("not-a-date")
    with pytest.raises(ValueError):
        _as_utc_datetime(123)

    reservation = _normalize_reservations([cast("ProviderReservation", {"id": "res1"})])
    assert reservation == []
    invalid_reservation = _normalize_reservations(
        [
            cast(
                "ProviderReservation",
                {
                    "id": "res1",
                    "start_time": now.isoformat(),
                    "end_time": (now - timedelta(minutes=5)).isoformat(),
                },
            )
        ]
    )
    assert invalid_reservation == []
    favorites = _normalize_favorites(
        [cast("ProviderFavorite", {"license_plate": "AA1234"})]
    )
    assert favorites == []
    favorites = _normalize_favorites(
        [
            cast(
                "ProviderFavorite",
                {"id": "fav1", "license_plate": "AA1234", "name": "Ada"},
            )
        ]
    )
    assert favorites == [
        Favorite(favorite_id="fav1", license_plate="AA1234", name="Ada")
    ]


def test_auto_end_cooldown() -> None:
    """Auto-end cooldown should prevent repeated attempts."""
    state = AutoEndState()
    now = datetime(2025, 1, 1, 12, 0, tzinfo=UTC)
    assert _should_attempt_auto_end(state, "res1", now) is True
    state.attempted_ids["res1"] = now
    assert _should_attempt_auto_end(state, "res1", now) is False


async def test_auto_end_skips_when_chargeable(hass: HomeAssistant) -> None:
    """Auto-end should skip when the zone is chargeable."""
    entry = _create_entry(auto_end=True)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    data = CoordinatorData(
        permit_id="permit",
        permit_remaining_minutes=0,
        permit_balance_unit=None,
        zone_validity=(),
        reservations=(),
        favorites=(),
        zone_availability=ZoneAvailability(
            is_chargeable_now=True,
            next_change_time=None,
            windows_today=(),
        ),
        active_reservations=(
            Reservation(
                reservation_id="res1",
                start_time=datetime(2025, 1, 6, 9, 0, tzinfo=UTC),
                end_time=datetime(2025, 1, 6, 10, 0, tzinfo=UTC),
            ),
        ),
    )

    await coordinator._async_maybe_auto_end(data)
    provider.end_reservation.assert_not_called()


async def test_auto_end_skips_without_reservations(hass: HomeAssistant) -> None:
    """Auto-end should skip when no active reservations exist."""
    entry = _create_entry(auto_end=True)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    data = CoordinatorData(
        permit_id="permit",
        permit_remaining_minutes=0,
        permit_balance_unit=None,
        zone_validity=(),
        reservations=(),
        favorites=(),
        zone_availability=ZoneAvailability(
            is_chargeable_now=False,
            next_change_time=None,
            windows_today=(),
        ),
        active_reservations=(),
    )

    await coordinator._async_maybe_auto_end(data)
    provider.end_reservation.assert_not_called()


async def test_options_fallback_when_missing_entry(hass: HomeAssistant) -> None:
    """Options should default to empty when config entry is missing."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=AsyncMock(),
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )
    coordinator.config_entry = None

    assert coordinator._options() == {}


async def test_log_unavailable_once(hass: HomeAssistant) -> None:
    """Log unavailable should only set flag once."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=AsyncMock(),
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    coordinator._log_unavailable_once()
    coordinator._log_unavailable_once()
    assert coordinator._unavailable_logged is True


def test_windows_for_today_with_overrides() -> None:
    """Overrides should override validity windows."""
    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    overrides = {"mon": [{"start": "10:00", "end": "12:00"}]}
    windows = windows_for_today([], {CONF_OPERATING_TIME_OVERRIDES: overrides}, now)

    assert len(windows) == 1
    assert windows[0].start < windows[0].end


def test_windows_for_today_fallback() -> None:
    """Fallback windows should filter by day."""
    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    window = TimeRange(
        start=datetime(2025, 1, 6, 0, 0, tzinfo=UTC),
        end=datetime(2025, 1, 6, 23, 0, tzinfo=UTC),
    )
    out_of_range = TimeRange(
        start=datetime(2025, 1, 5, 0, 0, tzinfo=UTC),
        end=datetime(2025, 1, 5, 23, 0, tzinfo=UTC),
    )
    windows = windows_for_today(
        [window, out_of_range], {CONF_OPERATING_TIME_OVERRIDES: {}}, now
    )

    assert len(windows) == 1


def test_override_helpers() -> None:
    """Override helpers should normalize values."""
    assert _as_time("08:00") is not None
    assert _as_time(time(9, 0)) == time(9, 0)
    assert _as_time(123) is None
    assert normalize_override_windows({"start": "08:00", "end": "09:00"})
    assert get_attr(SimpleNamespace(name="test"), "name") == "test"


def test_compute_zone_availability_next_change() -> None:
    """Zone availability should return the end of the current window."""
    now = datetime(2025, 1, 6, 9, 30, tzinfo=UTC)
    window = TimeRange(
        start=datetime(2025, 1, 6, 9, 0, tzinfo=UTC),
        end=datetime(2025, 1, 6, 11, 0, tzinfo=UTC),
    )
    availability = _compute_zone_availability([window], {}, now)

    assert availability.is_chargeable_now is True
    assert availability.next_change_time == window.end


def test_windows_for_today_invalid_overrides() -> None:
    """Invalid overrides should fall back to zone validity."""
    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    local_now = dt_util.as_local(now)
    local_start = datetime.combine(local_now.date(), time.min, tzinfo=local_now.tzinfo)
    window = TimeRange(
        start=dt_util.as_utc(local_start),
        end=dt_util.as_utc(local_start + timedelta(hours=1)),
    )
    windows = windows_for_today([window], {CONF_OPERATING_TIME_OVERRIDES: "bad"}, now)

    assert windows

    overrides = {"mon": [{"start": "10:00", "end": "09:00"}]}
    windows = windows_for_today(
        [window], {CONF_OPERATING_TIME_OVERRIDES: overrides}, now
    )
    assert windows


def test_compute_next_interval_active_reservation(hass: HomeAssistant) -> None:
    """Active reservation → always poll at the default (fast) interval."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=AsyncMock(),
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    data = _idle_data(
        active_reservations=(
            Reservation(
                reservation_id="res1",
                start_time=now - timedelta(hours=1),
                end_time=now + timedelta(hours=1),
            ),
        ),
    )

    assert coordinator._compute_next_interval(data, now) == DEFAULT_UPDATE_INTERVAL


def test_compute_next_interval_zone_chargeable(hass: HomeAssistant) -> None:
    """Zone chargeable but no active reservation → still poll at default interval."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=AsyncMock(),
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    data = _idle_data(
        zone_availability=ZoneAvailability(
            is_chargeable_now=True,
            next_change_time=now + timedelta(hours=2),
            windows_today=(),
        ),
    )

    assert coordinator._compute_next_interval(data, now) == DEFAULT_UPDATE_INTERVAL


def test_compute_next_interval_transition_imminent(hass: HomeAssistant) -> None:
    """Zone transition within TRANSITION_LOOKAHEAD → default interval."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=AsyncMock(),
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    # Transition is exactly at the edge of the lookahead window.
    data = _idle_data(
        zone_availability=ZoneAvailability(
            is_chargeable_now=False,
            next_change_time=now + TRANSITION_LOOKAHEAD,
            windows_today=(),
        ),
    )

    assert coordinator._compute_next_interval(data, now) == DEFAULT_UPDATE_INTERVAL


def test_compute_next_interval_precise_scheduling(hass: HomeAssistant) -> None:
    """Known transition beyond lookahead -> precise interval capped at IDLE."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=AsyncMock(),
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)

    # Transition in 45 minutes -- beyond TRANSITION_LOOKAHEAD (30 min).
    # Expected: 45 min - TRANSITION_BUFFER (2 min) = 43 min, which is > IDLE (30 min),
    # so the result is capped at IDLE_UPDATE_INTERVAL.
    transition_in_45 = now + timedelta(minutes=45)
    data_45 = _idle_data(
        zone_availability=ZoneAvailability(
            is_chargeable_now=False,
            next_change_time=transition_in_45,
            windows_today=(),
        ),
    )
    assert coordinator._compute_next_interval(data_45, now) == IDLE_UPDATE_INTERVAL

    # Transition in 32 minutes -- just beyond TRANSITION_LOOKAHEAD (30 min).
    # Expected: 32 min - 2 min buffer = 30 min, equal to IDLE_UPDATE_INTERVAL.
    transition_in_32 = now + timedelta(minutes=32)
    data_32 = _idle_data(
        zone_availability=ZoneAvailability(
            is_chargeable_now=False,
            next_change_time=transition_in_32,
            windows_today=(),
        ),
    )
    precise = timedelta(minutes=32) - TRANSITION_BUFFER
    assert coordinator._compute_next_interval(data_32, now) == min(
        precise, IDLE_UPDATE_INTERVAL
    )


def test_compute_next_interval_clamp_prevents_negative(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """precise_interval clamp must prevent a negative interval.

    With default constants TRANSITION_BUFFER (2 min) < TRANSITION_LOOKAHEAD
    (30 min), so precise_interval can never go negative in production. This
    test monkeypatches TRANSITION_BUFFER to exceed TRANSITION_LOOKAHEAD,
    reproducing the edge case that the max(..., timedelta(0)) guard covers.
    """
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=AsyncMock(),
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    # Transition is 35 minutes away — beyond TRANSITION_LOOKAHEAD (30 min),
    # so we reach case 4.  With a patched TRANSITION_BUFFER of 40 min the
    # unguarded calculation would yield -5 min; the clamp must return 0.
    monkeypatch.setattr(coord_module, "TRANSITION_BUFFER", timedelta(minutes=40))
    data = _idle_data(
        zone_availability=ZoneAvailability(
            is_chargeable_now=False,
            next_change_time=now + timedelta(minutes=35),
            windows_today=(),
        ),
    )

    result = coordinator._compute_next_interval(data, now)
    assert result == timedelta(0), f"Expected timedelta(0), got {result}"


def test_compute_next_interval_idle(hass: HomeAssistant) -> None:
    """No active reservation, free zone, no next transition → idle interval."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)
    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=AsyncMock(),
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    data = _idle_data()

    assert coordinator._compute_next_interval(data, now) == IDLE_UPDATE_INTERVAL


async def test_adaptive_interval_applied_after_update(hass: HomeAssistant) -> None:
    """Coordinator should apply the computed interval after a successful update."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    provider = AsyncMock()
    # No active reservation, free zone, no next change → idle interval expected.
    provider.fetch_all.return_value = ({"zone_validity": []}, [], [])

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    with freeze_time(now):
        await coordinator.async_refresh()

    assert coordinator.update_interval == IDLE_UPDATE_INTERVAL


async def test_adaptive_interval_fast_when_reservation_active(
    hass: HomeAssistant,
) -> None:
    """Coordinator should use default interval when a reservation is active."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    now = datetime(2025, 1, 6, 9, 0, tzinfo=UTC)
    reservation = {
        "id": "res1",
        "start_time": (now - timedelta(hours=1)).isoformat(),
        "end_time": (now + timedelta(hours=1)).isoformat(),
    }
    provider = AsyncMock()
    provider.fetch_all.return_value = ({"zone_validity": []}, [reservation], [])

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    with freeze_time(now):
        await coordinator.async_refresh()

    assert coordinator.update_interval == DEFAULT_UPDATE_INTERVAL


def _idle_data(
    *,
    active_reservations: tuple[Reservation, ...] = (),
    zone_availability: ZoneAvailability | None = None,
) -> CoordinatorData:
    """Return a CoordinatorData instance representing a quiet, idle state."""
    return CoordinatorData(
        permit_id="permit",
        permit_remaining_minutes=0,
        permit_balance_unit=None,
        zone_validity=(),
        reservations=(),
        favorites=(),
        zone_availability=zone_availability
        or ZoneAvailability(
            is_chargeable_now=False,
            next_change_time=None,
            windows_today=(),
        ),
        active_reservations=active_reservations,
    )


def _create_entry(auto_end: bool) -> MockConfigEntry:
    """Create a mock entry with options."""
    return MockConfigEntry(
        domain=DOMAIN,
        data={"permit_id": "permit"},
        options={CONF_AUTO_END: auto_end},
    )
