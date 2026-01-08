"""Tests for City visitor parking diagnostics."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock

from homeassistant.components.diagnostics import REDACTED
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.const import (
    CONF_AUTO_END,
    CONF_OPERATING_TIME_OVERRIDES,
    CONF_PROVIDER_ID,
    DOMAIN,
)
from custom_components.city_visitor_parking.diagnostics import (
    async_get_config_entry_diagnostics,
)
from custom_components.city_visitor_parking.models import (
    AutoEndState,
    CityVisitorParkingRuntimeData,
    CoordinatorData,
    Favorite,
    ProviderConfig,
    Reservation,
    TimeRange,
    ZoneAvailability,
)


async def test_diagnostics_redacts_sensitive_data(hass) -> None:
    """Diagnostics should redact credentials and summarize runtime data."""

    entry = MockConfigEntry(
        domain=DOMAIN,
        data={
            CONF_PROVIDER_ID: "dvsportal",
            "municipality_name": "City",
            "permit_id": "permit",
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
        options={
            CONF_AUTO_END: True,
            CONF_OPERATING_TIME_OVERRIDES: {
                "mon": [{"start": "08:00", "end": "18:00"}]
            },
        },
    )
    entry.add_to_hass(hass)

    availability = ZoneAvailability(
        is_chargeable_now=True,
        next_change_time=None,
        windows_today=[],
    )
    data = CoordinatorData(
        permit_id="permit",
        permit_remaining_minutes=30,
        zone_validity=[
            TimeRange(
                start=datetime(2025, 1, 1, 8, 0, tzinfo=UTC),
                end=datetime(2025, 1, 1, 18, 0, tzinfo=UTC),
            )
        ],
        reservations=[
            Reservation(
                reservation_id="res1",
                start_time=datetime(2025, 1, 1, 9, 0, tzinfo=UTC),
                end_time=datetime(2025, 1, 1, 10, 0, tzinfo=UTC),
            )
        ],
        favorites=[Favorite(favorite_id="fav1")],
        zone_availability=availability,
        active_reservations=[],
    )
    coordinator = SimpleNamespace(
        data=data,
        update_interval=timedelta(minutes=5),
        last_update_success=True,
        last_update_success_time=datetime(2025, 1, 1, 9, 0, tzinfo=UTC),
    )
    entry.runtime_data = CityVisitorParkingRuntimeData(
        client=AsyncMock(),
        provider=AsyncMock(),
        provider_config=ProviderConfig(
            provider_id="dvsportal",
            municipality_name="City",
            base_url=None,
            api_url=None,
        ),
        coordinator=coordinator,
        permit_id="permit",
        auto_end_state=AutoEndState(),
    )

    diagnostics = await async_get_config_entry_diagnostics(hass, entry)

    assert diagnostics["entry_data"][CONF_USERNAME] == REDACTED
    assert diagnostics["entry_data"][CONF_PASSWORD] == REDACTED
    assert diagnostics["runtime"]["permit_id"] == "permit"
    assert diagnostics["runtime"]["zone_validity_blocks"] == 1
    assert diagnostics["runtime"]["favorites"] == 1
