"""Tests for the City visitor parking config flow."""

from __future__ import annotations

from datetime import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import voluptuous as vol
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.config_flow import (
    OTHER_OPTION,
    CityVisitorParkingConfigFlow,
    PermitChoice,
    _day_windows_key,
    _format_override_windows,
    _format_time,
    _parse_time,
    _parse_time_windows,
)
from custom_components.city_visitor_parking.const import (
    CONF_DESCRIPTION,
    CONF_MUNICIPALITY,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
)
from custom_components.city_visitor_parking.helpers import (
    get_attr,
    normalize_override_windows,
)
from custom_components.city_visitor_parking.models import ProviderConfig

KNOWN_MUNICIPALITY = "apeldoorn"


async def test_municipality_dropdown_includes_other(hass) -> None:
    """Ensure the municipality list includes "Other"."""

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    assert result["type"] == "form"

    schema = result["data_schema"].schema
    selector = schema[vol.Required(CONF_MUNICIPALITY)]
    values = _extract_option_values(selector)

    assert KNOWN_MUNICIPALITY in values
    assert OTHER_OPTION in values


async def test_known_municipality_skips_manual_step(hass) -> None:
    """Known municipalities should jump to auth."""

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: KNOWN_MUNICIPALITY}
    )

    assert result["type"] == "form"
    assert result["step_id"] == "auth"


async def test_other_municipality_requires_manual_fields(hass) -> None:
    """Other municipality must show manual provider fields."""

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: OTHER_OPTION}
    )

    schema = result["data_schema"].schema
    assert CONF_PROVIDER_ID in {key.schema for key in schema}
    assert CONF_MUNICIPALITY in {key.schema for key in schema}


async def test_other_municipality_list_providers_network_error(
    hass, monkeypatch, pv_library
) -> None:
    """Provider list errors should surface in the form."""

    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow._async_list_providers",
        AsyncMock(side_effect=pv_library.NetworkError),
    )

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: OTHER_OPTION}
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "cannot_connect"


async def test_other_municipality_list_providers_unknown_error(
    hass, monkeypatch
) -> None:
    """Unexpected provider list errors should map to unknown."""

    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow._async_list_providers",
        AsyncMock(side_effect=RuntimeError),
    )

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: OTHER_OPTION}
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "unknown"


async def test_other_municipality_manual_provider_flow(hass, monkeypatch) -> None:
    """Manual provider step should proceed to auth."""

    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow._async_list_providers",
        AsyncMock(return_value=["manual"]),
    )

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: OTHER_OPTION}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_PROVIDER_ID: "manual",
            CONF_MUNICIPALITY: "Custom",
            "base_url": "https://example.com",
            "api_url": "https://example.com/api",
        },
    )

    assert result["type"] == "form"
    assert result["step_id"] == "auth"


async def test_config_flow_success(hass, monkeypatch) -> None:
    """Successful flow creates the entry with a permit title."""

    provider = AsyncMock()
    provider.get_permit.return_value = {"id": "PERMIT1", "name": "Permit One"}
    client = AsyncMock()
    client.get_provider.return_value = provider
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(return_value=client),
    )

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: KNOWN_MUNICIPALITY}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: "user", CONF_PASSWORD: "pass"}
    )
    assert result["step_id"] == "permit"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_PERMIT_ID: "PERMIT1", CONF_DESCRIPTION: "Home"},
    )

    assert result["type"] == "create_entry"
    assert result["title"] == "Home - PERMIT1"
    assert result["data"][CONF_PERMIT_ID] == "PERMIT1"


async def test_config_flow_invalid_auth(hass, monkeypatch, pv_library) -> None:
    """Invalid credentials should be reported."""

    provider = AsyncMock()
    provider.login.side_effect = pv_library.AuthError
    client = AsyncMock()
    client.get_provider.return_value = provider
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(return_value=client),
    )

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: KNOWN_MUNICIPALITY}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: "user", CONF_PASSWORD: "pass"}
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "invalid_auth"


async def test_config_flow_cannot_connect(hass, monkeypatch, pv_library) -> None:
    """Network issues should map to cannot_connect."""

    provider = AsyncMock()
    provider.login.side_effect = pv_library.NetworkError
    client = AsyncMock()
    client.get_provider.return_value = provider
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(return_value=client),
    )

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: KNOWN_MUNICIPALITY}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: "user", CONF_PASSWORD: "pass"}
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "cannot_connect"


async def test_config_flow_unknown_error(hass, monkeypatch, pv_library) -> None:
    """Unknown errors should map to unknown."""

    provider = AsyncMock()
    provider.login.side_effect = pv_library.ProviderError
    client = AsyncMock()
    client.get_provider.return_value = provider
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(return_value=client),
    )

    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_MUNICIPALITY: KNOWN_MUNICIPALITY}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: "user", CONF_PASSWORD: "pass"}
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "unknown"


async def test_reauth_flow_success(hass, monkeypatch) -> None:
    """Reauthentication should update credentials."""

    provider = AsyncMock()
    provider.get_permit.return_value = {"id": "PERMIT1", "name": "Permit One"}
    client = AsyncMock()
    client.get_provider.return_value = provider
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(return_value=client),
    )

    entry = _create_entry()
    entry.add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": "reauth", "entry_id": entry.entry_id},
    )
    assert result["type"] == "form"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: "new", CONF_PASSWORD: "pass"}
    )
    assert result["type"] == "abort"
    assert result["reason"] == "reauth_successful"


async def test_reauth_flow_invalid_auth(hass, monkeypatch, pv_library) -> None:
    """Reauth should surface invalid credentials."""

    provider = AsyncMock()
    provider.login.side_effect = pv_library.AuthError
    client = AsyncMock()
    client.get_provider.return_value = provider
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(return_value=client),
    )

    entry = _create_entry()
    entry.add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": "reauth", "entry_id": entry.entry_id},
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"], {CONF_USERNAME: "new", CONF_PASSWORD: "pass"}
    )
    assert result["type"] == "form"
    assert result["errors"]["base"] == "invalid_auth"


async def test_reauth_missing_entry_aborts(hass) -> None:
    """Reauth should abort when the entry is missing."""

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": "reauth", "entry_id": "missing"},
    )
    assert result["type"] == "abort"
    assert result["reason"] == "unknown"


async def test_permit_step_without_provider_aborts(hass) -> None:
    """Permit step should abort without provider config."""

    flow = CityVisitorParkingConfigFlow()
    flow.hass = hass
    flow.context = {"source": "user"}
    flow._permits = [PermitChoice(permit_id="PERMIT1", label="Permit One")]

    result = await flow.async_step_permit({CONF_PERMIT_ID: "PERMIT1"})

    assert result["type"] == "abort"
    assert result["reason"] == "unknown"


async def test_validate_credentials_requires_provider(hass) -> None:
    """Credential validation should require provider config."""

    flow = CityVisitorParkingConfigFlow()
    flow.hass = hass
    errors: dict[str, str] = {}

    permits = await flow._async_validate_credentials("user", "pass", errors)

    assert permits == []
    assert errors["base"] == "unknown"


async def test_validate_credentials_unexpected_error(hass, monkeypatch) -> None:
    """Unexpected errors during validation should map to unknown."""

    flow = CityVisitorParkingConfigFlow()
    flow.hass = hass
    flow._provider_config = ProviderConfig(
        provider_id="dvsportal",
        municipality_name="City",
        base_url=None,
        api_url=None,
    )

    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(side_effect=RuntimeError),
    )

    errors: dict[str, str] = {}
    permits = await flow._async_validate_credentials("user", "pass", errors)

    assert permits == []
    assert errors["base"] == "unknown"


async def test_validate_credentials_no_permits(hass, monkeypatch) -> None:
    """Credential validation should report when no permits are returned."""

    flow = CityVisitorParkingConfigFlow()
    flow.hass = hass
    flow._provider_config = ProviderConfig(
        provider_id="dvsportal",
        municipality_name="City",
        base_url=None,
        api_url=None,
    )

    provider = AsyncMock()
    provider.get_permit.return_value = {}
    client = AsyncMock()
    client.get_provider.return_value = provider
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(return_value=client),
    )

    errors: dict[str, str] = {}
    permits = await flow._async_validate_credentials("user", "pass", errors)

    assert permits == []
    assert errors["base"] == "no_permits"


def test_override_helper_parsing() -> None:
    """Helper parsing should validate overrides."""

    errors: dict[str, str] = {}
    assert _parse_time_windows(None, errors) == []
    assert _parse_time_windows(123, errors) == []
    assert errors["base"] == "invalid_override_format"

    errors.clear()
    assert _parse_time_windows("08:00-09:00", errors) == [
        {"start": "08:00", "end": "09:00"}
    ]
    assert _format_override_windows({"start": "09:00", "end": "10:00"}) == "09:00-10:00"
    assert _format_override_windows([{"start": "09:00"}]) == ""
    assert normalize_override_windows([]) == []
    assert _day_windows_key("mon") == "monday_chargeable_windows"
    assert _parse_time(time(8, 0)) == time(8, 0)
    assert _parse_time("08:00") is not None
    assert _parse_time("") is None
    assert _format_time(None) is None
    assert get_attr({"name": "test"}, "name") == "test"
    assert get_attr(SimpleNamespace(name="attr"), "name") == "attr"

    errors.clear()
    assert _parse_time_windows("invalid", errors) == []
    assert errors["base"] == "invalid_override_format"
    errors.clear()
    assert _parse_time_windows("aa:bb-cc:dd", errors) == []
    assert errors["base"] == "invalid_override_format"


def _extract_option_values(selector) -> list[str]:
    """Return option values from a selector field."""

    if isinstance(selector, dict):
        selector = selector.get("selector", selector)
        if "select" in selector:
            options = selector["select"]["options"]
        else:
            options = selector.get("options", [])
    else:
        options = selector.config["options"]

    values: list[str] = []
    for option in options:
        if isinstance(option, str):
            values.append(option)
            continue
        if isinstance(option, dict):
            values.append(option["value"])
        else:
            values.append(option.value)
    return values


def _create_entry():
    """Create a mock entry for reauth tests."""

    return MockConfigEntry(
        domain=DOMAIN,
        data={
            CONF_PROVIDER_ID: "dvsportal",
            CONF_MUNICIPALITY: "Apeldoorn",
            CONF_PERMIT_ID: "PERMIT1",
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
        unique_id="dvsportal:PERMIT1:apeldoorn",
        title="Apeldoorn - PERMIT1",
    )
