"""Tests for the City visitor parking options flow."""

from __future__ import annotations

from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.config_flow import (
    CityVisitorParkingOptionsFlow,
)
from custom_components.city_visitor_parking.const import (
    CONF_AUTO_END,
    CONF_MUNICIPALITY,
    CONF_OPERATING_TIME_OVERRIDES,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
)


async def test_options_flow_save_overrides(hass) -> None:
    """Options flow should store overrides and auto-end settings."""

    entry = _create_entry()
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] == "form"

    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            CONF_AUTO_END: True,
            "operating_times": {
                "monday_chargeable_windows": "09:00-13:00, 14:00-17:30",
            },
        },
    )

    assert result["type"] == "create_entry"
    assert result["data"][CONF_AUTO_END] is True
    overrides = result["data"][CONF_OPERATING_TIME_OVERRIDES]
    assert overrides["mon"][0]["start"] == "09:00"
    assert overrides["mon"][0]["end"] == "13:00"
    assert overrides["mon"][1]["start"] == "14:00"
    assert overrides["mon"][1]["end"] == "17:30"
    assert entry.title == "Mock Title"


async def test_options_flow_invalid_range(hass) -> None:
    """Options flow should reject invalid time ranges."""

    entry = _create_entry()
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            CONF_AUTO_END: False,
            "operating_times": {"monday_chargeable_windows": "18:00-08:00"},
        },
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "invalid_time_range"


async def test_options_flow_incomplete_override(hass) -> None:
    """Options flow should reject incomplete overrides."""

    entry = _create_entry()
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)
    result = await hass.config_entries.options.async_configure(
        result["flow_id"],
        {
            CONF_AUTO_END: False,
            "operating_times": {"monday_chargeable_windows": "08:00-"},
        },
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "invalid_override_format"


async def test_options_flow_non_mapping_section(hass) -> None:
    """Options flow should handle non-mapping operating_times input."""

    entry = _create_entry()
    entry.add_to_hass(hass)
    flow = CityVisitorParkingOptionsFlow(entry)
    flow.hass = hass
    result = await flow.async_step_init(
        {
            CONF_AUTO_END: False,
            "operating_times": "invalid",
        }
    )

    assert result["type"] == "create_entry"
    assert result["data"][CONF_OPERATING_TIME_OVERRIDES] == {}


async def test_options_flow_non_mapping_overrides(hass) -> None:
    """Options flow should handle invalid stored overrides."""

    entry = _create_entry(options={CONF_OPERATING_TIME_OVERRIDES: "bad"})
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)

    assert result["type"] == "form"


async def test_options_flow_expands_with_overrides(hass) -> None:
    """Options flow should expand when overrides exist."""

    entry = _create_entry(
        options={
            CONF_OPERATING_TIME_OVERRIDES: {"mon": [{"start": "08:00", "end": "09:00"}]}
        }
    )
    entry.add_to_hass(hass)

    result = await hass.config_entries.options.async_init(entry.entry_id)

    assert result["type"] == "form"


def _create_entry(
    title: str | None = None,
    options: dict[str, object] | None = None,
):
    """Create a mock entry for options tests."""

    data = {
        CONF_PROVIDER_ID: "dvsportal",
        CONF_MUNICIPALITY: "Apeldoorn",
        CONF_PERMIT_ID: "PERMIT1",
        CONF_USERNAME: "user",
        CONF_PASSWORD: "pass",
    }

    return MockConfigEntry(
        domain=DOMAIN,
        data=data,
        options=options or {},
        title=title or "Mock Title",
    )
