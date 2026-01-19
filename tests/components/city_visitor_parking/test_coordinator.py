"""Tests for the City visitor parking coordinator."""

from __future__ import annotations

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

from custom_components.city_visitor_parking.const import (
    CONF_AUTO_END,
    CONF_OPERATING_TIME_OVERRIDES,
    DOMAIN,
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
    provider.get_permit.return_value = {"zone_validity": []}
    provider.list_reservations.return_value = [reservation]
    provider.list_favorites.return_value = []

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
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
    """Auth errors should raise ConfigEntryAuthFailed."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.get_permit.side_effect = pv_library.AuthError

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    await coordinator.async_refresh()
    assert isinstance(coordinator.last_exception, ConfigEntryAuthFailed)


async def test_network_failure_raises_updatefailed(
    hass: HomeAssistant, pv_library: ModuleType
) -> None:
    """Network failures should raise UpdateFailed."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.get_permit.side_effect = pv_library.NetworkError

    coordinator = CityVisitorParkingCoordinator(
        hass,
        provider=provider,
        config_entry=entry,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    await coordinator.async_refresh()
    assert isinstance(coordinator.last_exception, UpdateFailed)


async def test_unexpected_failure_raises_updatefailed(hass: HomeAssistant) -> None:
    """Unexpected failures should raise UpdateFailed."""
    entry = _create_entry(auto_end=False)
    entry.add_to_hass(hass)

    provider = AsyncMock()
    provider.get_permit.side_effect = RuntimeError("boom")

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
    provider.get_permit.return_value = {"zone_validity": []}
    provider.list_reservations.return_value = []
    provider.list_favorites.return_value = []

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
    provider.get_permit.return_value = {"zone_validity": []}
    provider.list_reservations.return_value = [reservation]
    provider.list_favorites.return_value = []
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
        await protocol.get_permit(object())
    with pytest.raises(NotImplementedError):
        await protocol.list_reservations(object())
    with pytest.raises(NotImplementedError):
        await protocol.list_favorites(object())
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
        zone_validity=[],
        reservations=[],
        favorites=[],
        zone_availability=ZoneAvailability(
            is_chargeable_now=True,
            next_change_time=None,
            windows_today=[],
        ),
        active_reservations=[
            Reservation(
                reservation_id="res1",
                start_time=datetime(2025, 1, 6, 9, 0, tzinfo=UTC),
                end_time=datetime(2025, 1, 6, 10, 0, tzinfo=UTC),
            )
        ],
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
        zone_validity=[],
        reservations=[],
        favorites=[],
        zone_availability=ZoneAvailability(
            is_chargeable_now=False,
            next_change_time=None,
            windows_today=[],
        ),
        active_reservations=[],
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


def _create_entry(auto_end: bool) -> MockConfigEntry:
    """Create a mock entry with options."""
    return MockConfigEntry(
        domain=DOMAIN,
        data={"permit_id": "permit"},
        options={CONF_AUTO_END: auto_end},
    )
