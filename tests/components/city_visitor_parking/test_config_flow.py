"""Tests for the City visitor parking config flow."""

from __future__ import annotations

import logging
from datetime import time
from types import SimpleNamespace
from typing import TYPE_CHECKING, Protocol
from unittest.mock import AsyncMock

import voluptuous as vol
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.helpers import selector
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.city_visitor_parking.config_flow import (
    CityVisitorParkingConfigFlow,
    _day_windows_key,
    _format_override_windows,
    _format_time,
    _normalize_optional_text,
    _parse_time,
    _parse_time_windows,
)
from custom_components.city_visitor_parking.const import (
    CONF_API_URL,
    CONF_BASE_URL,
    CONF_GUI_URL,
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

if TYPE_CHECKING:
    from types import ModuleType

    from homeassistant.core import HomeAssistant
    from pytest import LogCaptureFixture, MonkeyPatch

KNOWN_MUNICIPALITY = "Apeldoorn"


async def test_municipality_selector_uses_sorted_dropdown(
    hass: HomeAssistant,
) -> None:
    """Ensure the municipality field uses a sorted HA select dropdown."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    assert result["type"] == "form"

    schema = result["data_schema"].schema
    municipality_selector = schema[vol.Required(CONF_MUNICIPALITY)]
    values = _extract_option_values(municipality_selector)
    config = _extract_selector_config(municipality_selector)
    labels = _extract_option_labels(municipality_selector)

    assert isinstance(municipality_selector, selector.SelectSelector)
    assert KNOWN_MUNICIPALITY in values
    assert CONF_USERNAME in {key.schema for key in schema}
    assert CONF_PASSWORD in {key.schema for key in schema}
    assert "other" not in values
    assert config["custom_value"] is True
    assert config["mode"] == selector.SelectSelectorMode.DROPDOWN
    assert config["sort"] is True
    assert labels == sorted(labels)


async def test_config_flow_accepts_custom_municipality_label(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """A typed municipality label should resolve to the matching provider."""
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
        result["flow_id"],
        {
            CONF_MUNICIPALITY: "Apeldoorn",
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
    )

    assert result["type"] == "create_entry"
    assert result["title"] == "Apeldoorn - PERMIT1"


async def test_config_flow_accepts_slugified_municipality_input(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """A slugified municipality value should still resolve for compatibility."""
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
        result["flow_id"],
        {
            CONF_MUNICIPALITY: "apeldoorn",
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
    )

    assert result["type"] == "create_entry"
    assert result["title"] == "Apeldoorn - PERMIT1"


async def test_config_flow_rejects_unknown_custom_municipality(
    hass: HomeAssistant,
) -> None:
    """An unknown typed municipality should return a validation error."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN, context={"source": "user"}
    )
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {
            CONF_MUNICIPALITY: "Not A Real Municipality",
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "invalid_municipality"


async def test_config_flow_success(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Successful flow creates the entry from the initial step."""
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
        result["flow_id"],
        {
            CONF_MUNICIPALITY: KNOWN_MUNICIPALITY,
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
    )

    assert result["type"] == "create_entry"
    assert result["title"] == "Apeldoorn - PERMIT1"
    assert result["data"][CONF_PERMIT_ID] == "PERMIT1"
    assert result["data"][CONF_GUI_URL] == "https://parkeren.apeldoorn.nl/DVSPortal/"


async def test_config_flow_invalid_auth(
    hass: HomeAssistant,
    monkeypatch: MonkeyPatch,
    pv_library: ModuleType,
    caplog: LogCaptureFixture,
) -> None:
    """Invalid credentials should be reported."""
    provider = AsyncMock()
    provider.login.side_effect = pv_library.AuthError
    client = AsyncMock()
    client.get_provider.return_value = provider
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_create_client",
        AsyncMock(return_value=client),
    )
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_get_versions",
        AsyncMock(return_value=("1.2.3", "4.5.6")),
    )

    with caplog.at_level(
        logging.DEBUG, logger="custom_components.city_visitor_parking.config_flow"
    ):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": "user"}
        )
        result = await hass.config_entries.flow.async_configure(
            result["flow_id"],
            {
                CONF_MUNICIPALITY: KNOWN_MUNICIPALITY,
                CONF_USERNAME: "user",
                CONF_PASSWORD: "pass",
            },
        )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "invalid_auth"
    assert "hacvp=1.2.3 pycvp=4.5.6" in caplog.text


async def test_config_flow_cannot_connect(
    hass: HomeAssistant, monkeypatch: MonkeyPatch, pv_library: ModuleType
) -> None:
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
        result["flow_id"],
        {
            CONF_MUNICIPALITY: KNOWN_MUNICIPALITY,
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "cannot_connect"


async def test_config_flow_unknown_error(
    hass: HomeAssistant, monkeypatch: MonkeyPatch, pv_library: ModuleType
) -> None:
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
        result["flow_id"],
        {
            CONF_MUNICIPALITY: KNOWN_MUNICIPALITY,
            CONF_USERNAME: "user",
            CONF_PASSWORD: "pass",
        },
    )

    assert result["type"] == "form"
    assert result["errors"]["base"] == "unknown"


async def test_reauth_flow_success(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
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


async def test_reconfigure_flow_success(hass: HomeAssistant) -> None:
    """Reconfigure flow should update endpoint overrides."""
    entry = _create_entry()
    entry.add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": "reconfigure", "entry_id": entry.entry_id},
    )
    assert result["type"] == "form"
    assert result["step_id"] == "reconfigure"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BASE_URL: "https://example.com", CONF_API_URL: "/api"},
    )
    await hass.async_block_till_done()

    assert result["type"] == "abort"
    assert result["reason"] == "reconfigure_successful"
    assert entry.data[CONF_BASE_URL] == "https://example.com"
    assert entry.data[CONF_API_URL] == "/api"


async def test_reconfigure_flow_missing_data_aborts(
    hass: HomeAssistant,
) -> None:
    """Reconfigure should abort when entry data is missing."""
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)

    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": "reconfigure", "entry_id": entry.entry_id},
    )
    assert result["type"] == "form"

    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {CONF_BASE_URL: "https://example.com", CONF_API_URL: "/api"},
    )

    assert result["type"] == "abort"
    assert result["reason"] == "unknown"


async def test_reconfigure_missing_entry_aborts(hass: HomeAssistant) -> None:
    """Reconfigure should abort when the entry is missing."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": "reconfigure", "entry_id": "missing"},
    )
    assert result["type"] == "abort"
    assert result["reason"] == "unknown"


async def test_reconfigure_missing_entry_id_aborts(hass: HomeAssistant) -> None:
    """Reconfigure should abort when entry ID is missing from context."""
    flow = CityVisitorParkingConfigFlow()
    flow.hass = hass
    flow.context = {"source": "reconfigure"}

    result = await flow.async_step_reconfigure()
    assert result["type"] == "abort"
    assert result["reason"] == "unknown"


async def test_reauth_flow_invalid_auth(
    hass: HomeAssistant, monkeypatch: MonkeyPatch, pv_library: ModuleType
) -> None:
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


async def test_reauth_missing_entry_aborts(hass: HomeAssistant) -> None:
    """Reauth should abort when the entry is missing."""
    result = await hass.config_entries.flow.async_init(
        DOMAIN,
        context={"source": "reauth", "entry_id": "missing"},
    )
    assert result["type"] == "abort"
    assert result["reason"] == "unknown"


async def test_reauth_missing_entry_id_aborts(hass: HomeAssistant) -> None:
    """Reauth should abort when entry ID is missing from context."""
    flow = CityVisitorParkingConfigFlow()
    flow.hass = hass
    flow.context = {"source": "reauth"}

    result = await flow.async_step_reauth()
    assert result["type"] == "abort"
    assert result["reason"] == "unknown"


async def test_validate_credentials_requires_provider(hass: HomeAssistant) -> None:
    """Credential validation should require provider config."""
    flow = CityVisitorParkingConfigFlow()
    flow.hass = hass
    errors: dict[str, str] = {}

    permit_id = await flow._async_validate_credentials("user", "pass", errors)

    assert permit_id is None
    assert errors["base"] == "unknown"


async def test_validate_credentials_unexpected_error(
    hass: HomeAssistant, monkeypatch: MonkeyPatch, caplog: LogCaptureFixture
) -> None:
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
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.config_flow.async_get_versions",
        AsyncMock(return_value=("1.2.3", "4.5.6")),
    )

    errors: dict[str, str] = {}
    with caplog.at_level(
        logging.DEBUG, logger="custom_components.city_visitor_parking.config_flow"
    ):
        permit_id = await flow._async_validate_credentials("user", "pass", errors)

    assert permit_id is None
    assert errors["base"] == "unknown"
    assert "hacvp=1.2.3 pycvp=4.5.6" in caplog.text


async def test_validate_credentials_no_permits(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
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
    permit_id = await flow._async_validate_credentials("user", "pass", errors)

    assert permit_id is None
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
    assert _normalize_optional_text(123) is None

    errors.clear()
    assert _parse_time_windows("invalid", errors) == []
    assert errors["base"] == "invalid_override_format"
    errors.clear()
    assert _parse_time_windows("aa:bb-cc:dd", errors) == []
    assert errors["base"] == "invalid_override_format"


class _SelectorConfig(Protocol):
    """Protocol for selector config objects."""

    config: dict[str, object]


def _extract_selector_config(selector: _SelectorConfig) -> dict[str, object]:
    """Return the config dict from a selector field."""
    return selector.config


def _extract_option_values(selector: dict[str, object] | _SelectorConfig) -> list[str]:
    """Return option values from a selector field."""
    option_dicts = _extract_selector_options(selector)

    values: list[str] = []
    for option in option_dicts:
        if isinstance(option, str):
            values.append(option)
            continue
        if isinstance(option, dict):
            values.append(option["value"])
        else:
            values.append(option.value)
    return values


def _extract_option_labels(selector: dict[str, object] | _SelectorConfig) -> list[str]:
    """Return option labels from a selector field."""
    option_dicts = _extract_selector_options(selector)

    labels: list[str] = []
    for option in option_dicts:
        if isinstance(option, str):
            labels.append(option)
            continue
        if isinstance(option, dict):
            labels.append(option["label"])
        else:
            labels.append(option.label)
    return labels


def _extract_selector_options(
    selector: dict[str, object] | _SelectorConfig,
) -> list[object]:
    """Return the option entries from a selector field."""
    if isinstance(selector, dict):
        selector_dict = selector
        nested = selector_dict.get("selector")
        if isinstance(nested, dict):
            selector_dict = nested
        if "select" in selector_dict:
            select_section = selector_dict.get("select")
            if isinstance(select_section, dict):
                options = select_section.get("options", [])
            else:
                options = []
        else:
            options = selector_dict.get("options", [])
    else:
        options = selector.config["options"]
    return list(options)


def _create_entry() -> MockConfigEntry:
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
