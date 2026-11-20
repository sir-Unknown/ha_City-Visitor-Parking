"""Tests for City visitor parking websocket API."""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from types import SimpleNamespace
from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock

from freezegun import freeze_time
from homeassistant import config_entries
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.util import dt as dt_util
from pycityvisitorparking.exceptions import PyCityVisitorParkingError
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.const import (
    CONF_MUNICIPALITY,
    CONF_OPERATING_TIME_OVERRIDES,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
    STATE_FREE,
    STATE_PAID,
)
from custom_components.city_visitor_parking.models import (
    AutoEndState,
    CoordinatorData,
    Favorite,
    PaidParkingStatus,
    ProviderConfig,
    Reservation,
    TimeRange,
)
from custom_components.city_visitor_parking.runtime_data import (
    CityVisitorParkingRuntimeData,
)
from custom_components.city_visitor_parking.websocket_api import (
    _ws_get_status,
    _ws_list_favorites,
    _ws_list_reservations,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from homeassistant.components.websocket_api.connection import ActiveConnection
    from homeassistant.core import HomeAssistant


class _FakeConnection:
    """Capture websocket responses for tests."""

    def __init__(self) -> None:
        """Initialize the fake connection."""
        self.errors: list[dict[str, object]] = []
        self.results: list[dict[str, object]] = []

    def send_error(self, msg_id: int, code: str, message: str) -> None:
        """Capture an error response."""
        self.errors.append({"id": msg_id, "code": code, "message": message})

    def send_result(self, msg_id: int, result: dict[str, object]) -> None:
        """Capture a success response."""
        self.results.append({"id": msg_id, "result": result})


def _as_utc_iso(value: datetime | None) -> str | None:
    """Return a UTC ISO8601 timestamp string for websocket assertions."""
    if value is None:
        return None
    return dt_util.as_utc(value).isoformat()


async def test_ws_list_favorites_success(hass: HomeAssistant) -> None:
    """Websocket should return favorites for a loaded entry."""
    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    provider = AsyncMock()
    provider.list_favorites.return_value = [
        {"id": "fav1", "license_plate": "AB-1234", "name": "Car"},
        {"license_plate": "CD-5678"},
        SimpleNamespace(name="Ignored"),
    ]
    entry.runtime_data = _runtime(provider, None)

    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    _ws_list_favorites(
        hass,
        connection,
        {"id": 1, "config_entry_id": entry.entry_id},
    )
    await hass.async_block_till_done()

    result = _first_result(raw_connection)
    favorites = cast("list[dict[str, object]]", result["favorites"])
    assert favorites[0]["id"] == "fav1"
    assert favorites[0]["license_plate"] == "AB-1234"
    assert favorites[1]["license_plate"] == "CD-5678"


async def test_ws_list_favorites_invalid_target(hass: HomeAssistant) -> None:
    """Websocket should reject invalid targets."""
    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    _ws_list_favorites(
        hass,
        connection,
        {"id": 1, "config_entry_id": "missing"},
    )
    await hass.async_block_till_done()

    error = _first_error(raw_connection)
    assert error["code"] == "invalid_target"


async def test_ws_get_status_invalid_target(hass: HomeAssistant) -> None:
    """Websocket should reject invalid targets for status."""
    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    _ws_get_status(
        hass,
        connection,
        {"id": 1, "config_entry_id": "missing"},
    )
    await hass.async_block_till_done()

    error = _first_error(raw_connection)
    assert error["code"] == "invalid_target"


async def test_ws_list_favorites_provider_error(hass: HomeAssistant) -> None:
    """Websocket should surface provider failures."""
    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    provider = AsyncMock()
    provider.list_favorites.side_effect = PyCityVisitorParkingError
    entry.runtime_data = _runtime(provider, None)

    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    _ws_list_favorites(
        hass,
        connection,
        {"id": 1, "config_entry_id": entry.entry_id},
    )
    await hass.async_block_till_done()

    error = _first_error(raw_connection)
    assert error["code"] == "favorites_failed"


async def test_ws_get_status_current_window(hass: HomeAssistant) -> None:
    """Websocket should return current paid window details."""
    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    window = TimeRange(
        start=now - timedelta(hours=1),
        end=now + timedelta(hours=1),
    )
    data = CoordinatorData(
        permit_id="permit",
        permit_remaining_balance=0,
        permit_balance_unit=None,
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
    entry.runtime_data = _runtime(AsyncMock(), data)

    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    with freeze_time(now):
        _ws_get_status(
            hass,
            connection,
            {"id": 1, "config_entry_id": entry.entry_id},
        )
        await hass.async_block_till_done()

    response = _first_result(raw_connection)
    assert response["state"] == STATE_PAID
    assert response["window_kind"] == "current"
    assert response["window_start"] == dt_util.as_utc(window.start).isoformat()
    assert response["window_end"] == dt_util.as_utc(window.end).isoformat()


async def test_ws_get_status_next_window_override(hass: HomeAssistant) -> None:
    """Websocket should return next window when using overrides."""
    entry = _create_entry(
        options={
            CONF_OPERATING_TIME_OVERRIDES: {"mon": [{"start": "11:00", "end": "12:00"}]}
        }
    )
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    data = CoordinatorData(
        permit_id="permit",
        permit_remaining_balance=0,
        permit_balance_unit=None,
        paid_hours=(),
        reservations=(),
        favorites=(),
        paid_parking_status=PaidParkingStatus(
            is_paid_now=False,
            next_change_time=None,
            windows_today=(),
        ),
        active_reservations=(),
    )
    entry.runtime_data = _runtime(AsyncMock(), data)

    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    with freeze_time(now):
        _ws_get_status(
            hass,
            connection,
            {"id": 1, "config_entry_id": entry.entry_id},
        )
        await hass.async_block_till_done()

    response = _first_result(raw_connection)
    assert response["state"] == STATE_FREE
    assert response["window_kind"] == "next"
    local_now = dt_util.as_local(now)
    expected_start_local = datetime.combine(
        local_now.date(), time(11, 0), tzinfo=local_now.tzinfo
    )
    expected_end_local = datetime.combine(
        local_now.date(), time(12, 0), tzinfo=local_now.tzinfo
    )
    expected_start = dt_util.as_utc(expected_start_local)
    expected_end = dt_util.as_utc(expected_end_local)
    assert response["window_start"] == expected_start.isoformat()
    assert response["window_end"] == expected_end.isoformat()


async def test_ws_get_status_failure_response(hass: HomeAssistant) -> None:
    """Websocket should return an error when status fails."""
    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)
    entry.runtime_data = _runtime(AsyncMock(), None)

    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    _ws_get_status(
        hass,
        connection,
        {"id": 1, "config_entry_id": entry.entry_id},
    )
    await hass.async_block_till_done()

    error = _first_error(raw_connection)
    assert error["code"] == "status_failed"


async def test_ws_list_reservations_reads_coordinator_data(
    hass: HomeAssistant,
) -> None:
    """Websocket should list unended reservations without a provider fetch."""
    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)

    now = datetime(2025, 1, 6, 10, 0, tzinfo=UTC)
    running = Reservation(
        reservation_id="running",
        start_time=now - timedelta(minutes=30),
        end_time=now + timedelta(minutes=30),
        license_plate="AB-12-CD",
    )
    upcoming = Reservation(
        reservation_id="upcoming",
        start_time=now + timedelta(hours=2),
        end_time=now + timedelta(hours=3),
    )
    ended = Reservation(
        reservation_id="ended",
        start_time=now - timedelta(hours=2),
        end_time=now - timedelta(hours=1),
    )
    data = CoordinatorData(
        permit_id="permit",
        permit_remaining_balance=0,
        permit_balance_unit=None,
        paid_hours=(),
        reservations=(running, upcoming, ended),
        favorites=(Favorite(favorite_id="fav1", license_plate="AB12CD", name="Mom"),),
        paid_parking_status=PaidParkingStatus(
            is_paid_now=False, next_change_time=None, windows_today=()
        ),
        active_reservations=(running,),
    )
    provider = AsyncMock()
    provider.reservation_update_fields = ["end_time"]
    entry.runtime_data = _runtime(provider, data)
    entry.runtime_data.coordinator.last_update_success = False

    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    with freeze_time(now):
        _ws_list_reservations(
            hass,
            connection,
            {"id": 1, "config_entry_id": entry.entry_id},
        )

    result = _first_result(raw_connection)
    reservations = cast("list[dict[str, object]]", result["reservations"])
    assert [item["reservation_id"] for item in reservations] == [
        "running",
        "upcoming",
    ]
    assert reservations[0]["favorite_name"] == "Mom"
    assert (result["count"], result["active_count"], result["future_count"]) == (
        2,
        1,
        1,
    )
    assert result["reservation_update_fields"] == ["end_time"]
    assert result["stale"] is True
    # The cached read must not reach the provider or refresh the coordinator.
    assert provider.mock_calls == []
    entry.runtime_data.coordinator.async_refresh.assert_not_called()


async def test_ws_list_reservations_without_data(hass: HomeAssistant) -> None:
    """Websocket should report an error before the first coordinator update."""
    entry = _create_entry()
    entry.add_to_hass(hass)
    entry.mock_state(hass, config_entries.ConfigEntryState.LOADED)
    entry.runtime_data = _runtime(AsyncMock(), None)

    raw_connection = _FakeConnection()
    connection = cast("ActiveConnection", raw_connection)
    _ws_list_reservations(
        hass,
        connection,
        {"id": 1, "config_entry_id": entry.entry_id},
    )

    assert _first_error(raw_connection)["code"] == "reservations_failed"


def test_ws_as_utc_iso_none() -> None:
    """UTC formatting should return None for missing values."""
    assert _as_utc_iso(None) is None


def _first_result(connection: _FakeConnection) -> dict[str, object]:
    """Return the first websocket result payload."""
    return cast("dict[str, object]", connection.results[0]["result"])


def _first_error(connection: _FakeConnection) -> dict[str, object]:
    """Return the first websocket error payload."""
    return cast("dict[str, object]", connection.errors[0])


def _create_entry(options: dict[str, object] | None = None) -> MockConfigEntry:
    """Create a mock entry for websocket tests."""
    return MockConfigEntry(
        domain=DOMAIN,
        data={
            CONF_PROVIDER_ID: "dvsportal",
            CONF_MUNICIPALITY: "City",
            CONF_PERMIT_ID: "permit",
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
        unique_id="dvsportal:permit:city",
        title="City - permit",
        options=options or {},
    )


async def _call_through[T](operation: Callable[[], Awaitable[T]]) -> T:
    """Run a provider call without session recovery, like a healthy coordinator."""
    return await operation()


def _runtime(
    provider: AsyncMock, data: CoordinatorData | None
) -> CityVisitorParkingRuntimeData:
    """Build runtime data for websocket tests."""
    coordinator = AsyncMock()
    coordinator.async_call_with_relogin = AsyncMock(side_effect=_call_through)
    coordinator.data = data
    return CityVisitorParkingRuntimeData(
        client=AsyncMock(),
        provider=provider,
        provider_config=ProviderConfig(
            provider_id="dvsportal",
            municipality_name="City",
            base_url=None,
            api_url=None,
        ),
        coordinator=coordinator,
        permit_id="permit",
        auto_end_state=AutoEndState(),
        operating_time_overrides={},
        free_dates="",
        free_weekdays=[],
    )
