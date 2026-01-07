"""Tests for the City visitor parking config flow."""

from __future__ import annotations

from unittest.mock import AsyncMock

import voluptuous as vol
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.config_flow import OTHER_OPTION
from custom_components.city_visitor_parking.const import (
    CONF_DESCRIPTION,
    CONF_MUNICIPALITY,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
)

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
