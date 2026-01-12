"""Config flow for City visitor parking."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from datetime import time
from importlib import resources
from typing import cast

import voluptuous as vol
import yaml
from homeassistant import config_entries
from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import section
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers import selector
from homeassistant.util import dt as dt_util
from homeassistant.util import slugify
from pycityvisitorparking import AuthError, Client, NetworkError
from pycityvisitorparking.exceptions import PyCityVisitorParkingError

from .client import async_create_client
from .const import (
    CONF_API_URL,
    CONF_AUTO_END,
    CONF_BASE_URL,
    CONF_DESCRIPTION,
    CONF_MUNICIPALITY,
    CONF_OPERATING_TIME_OVERRIDES,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
    LOGGER,
    WEEKDAY_KEYS,
)
from .helpers import get_attr, normalize_override_windows
from .models import ProviderConfig

OTHER_OPTION = "other"
SECTION_OPERATING_TIMES = "operating_times"

WEEKDAY_LABELS = {
    "mon": "monday",
    "tue": "tuesday",
    "wed": "wednesday",
    "thu": "thursday",
    "fri": "friday",
    "sat": "saturday",
    "sun": "sunday",
}


@dataclass(frozen=True)
class PermitChoice:
    """Simplified permit choice for the flow."""

    permit_id: str
    label: str


class CityVisitorParkingConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for City visitor parking."""

    VERSION = 1
    MINOR_VERSION = 1

    def __init__(self) -> None:
        """Initialize the config flow."""

        self._providers: dict[str, ProviderConfig] = {}
        self._provider_config: ProviderConfig | None = None
        self._credentials: dict[str, str] = {}
        self._permits: list[PermitChoice] = []
        self._reauth_entry: config_entries.ConfigEntry | None = None

    async def async_step_user(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the initial step."""

        self._providers = await _async_load_providers(self.hass)
        options = [
            selector.SelectOptionDict(value=key, label=provider.municipality_name)
            for key, provider in sorted(
                self._providers.items(),
                key=lambda item: item[1].municipality_name,
            )
        ]
        options.append(selector.SelectOptionDict(value=OTHER_OPTION, label="Other"))

        if user_input is None:
            schema = vol.Schema(
                {
                    vol.Required(CONF_MUNICIPALITY): selector.SelectSelector(
                        selector.SelectSelectorConfig(options=options)
                    )
                }
            )
            return self.async_show_form(step_id="user", data_schema=schema)

        selected = cast(str, user_input[CONF_MUNICIPALITY])
        if selected == OTHER_OPTION:
            return await self.async_step_other()

        self._provider_config = self._providers[selected]
        return await self.async_step_auth()

    async def async_step_other(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle manual provider configuration."""

        errors: dict[str, str] = {}
        providers = []
        if user_input is None:
            try:
                providers = await _async_list_providers()
            except NetworkError:
                errors["base"] = "cannot_connect"
            # Allowed in config flow
            except Exception as err:  # noqa: BLE001
                LOGGER.debug(
                    "Unexpected error while listing providers: %s",
                    type(err).__name__,
                )
                errors["base"] = "unknown"

        provider_options = [
            selector.SelectOptionDict(value=provider, label=provider)
            for provider in providers
        ]

        if user_input is None or errors:
            schema = vol.Schema(
                {
                    vol.Required(CONF_PROVIDER_ID): selector.SelectSelector(
                        selector.SelectSelectorConfig(options=provider_options)
                    ),
                    vol.Required(CONF_MUNICIPALITY): cv.string,
                    vol.Optional(CONF_BASE_URL): cv.string,
                    vol.Optional(CONF_API_URL): cv.string,
                }
            )
            return self.async_show_form(
                step_id="other", data_schema=schema, errors=errors
            )

        self._provider_config = ProviderConfig(
            provider_id=cast(str, user_input[CONF_PROVIDER_ID]),
            municipality_name=cast(str, user_input[CONF_MUNICIPALITY]),
            base_url=cast(str | None, user_input.get(CONF_BASE_URL)),
            api_url=cast(str | None, user_input.get(CONF_API_URL)),
        )
        return await self.async_step_auth()

    async def async_step_auth(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the authentication step."""

        return await self._async_handle_auth(user_input, step_id="auth")

    async def async_step_permit(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle permit selection."""

        if user_input is None:
            options = [
                selector.SelectOptionDict(value=permit.permit_id, label=permit.label)
                for permit in self._permits
            ]
            schema = vol.Schema(
                {
                    vol.Required(CONF_PERMIT_ID): selector.SelectSelector(
                        selector.SelectSelectorConfig(options=options)
                    ),
                    vol.Optional(CONF_DESCRIPTION): cv.string,
                }
            )
            return self.async_show_form(step_id="permit", data_schema=schema)

        permit_id = cast(str, user_input[CONF_PERMIT_ID])
        description = cast(str | None, user_input.get(CONF_DESCRIPTION))

        if self._provider_config is None:
            return self.async_abort(reason="unknown")

        unique_id = _build_unique_id(self._provider_config, permit_id)
        await self.async_set_unique_id(unique_id)
        self._abort_if_unique_id_configured()

        title = (
            f"{description} - {permit_id}"
            if description
            else f"{self._provider_config.municipality_name} - {permit_id}"
        )

        data = {
            CONF_PROVIDER_ID: self._provider_config.provider_id,
            CONF_MUNICIPALITY: self._provider_config.municipality_name,
            CONF_BASE_URL: self._provider_config.base_url,
            CONF_API_URL: self._provider_config.api_url,
            CONF_PERMIT_ID: permit_id,
            **self._credentials,
        }
        if description:
            data[CONF_DESCRIPTION] = description

        return self.async_create_entry(title=title, data=data)

    async def async_step_reauth(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle reauthentication."""

        entry = self.hass.config_entries.async_get_entry(self.context["entry_id"])
        if entry is None:
            return self.async_abort(reason="unknown")

        self._reauth_entry = entry
        self._provider_config = ProviderConfig(
            provider_id=entry.data[CONF_PROVIDER_ID],
            municipality_name=entry.data[CONF_MUNICIPALITY],
            base_url=entry.data.get(CONF_BASE_URL),
            api_url=entry.data.get(CONF_API_URL),
        )
        self.context["title_placeholders"] = {"name": entry.title}
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Confirm reauthentication."""

        return await self._async_handle_auth(user_input, step_id="reauth_confirm")

    async def _async_handle_auth(
        self, user_input: dict[str, object] | None, *, step_id: str
    ) -> config_entries.ConfigFlowResult:
        """Validate credentials and move to the next step."""

        errors: dict[str, str] = {}
        if user_input is None:
            return self.async_show_form(
                step_id=step_id,
                data_schema=vol.Schema(
                    {
                        vol.Required(CONF_USERNAME): cv.string,
                        vol.Required(CONF_PASSWORD): cv.string,
                    }
                ),
            )

        username = cast(str, user_input[CONF_USERNAME])
        password = cast(str, user_input[CONF_PASSWORD])
        self._credentials = {CONF_USERNAME: username, CONF_PASSWORD: password}

        permits = await self._async_validate_credentials(
            username,
            password,
            errors,
        )
        if errors:
            return self.async_show_form(
                step_id=step_id,
                data_schema=vol.Schema(
                    {
                        vol.Required(CONF_USERNAME): cv.string,
                        vol.Required(CONF_PASSWORD): cv.string,
                    }
                ),
                errors=errors,
            )

        self._permits = permits
        if self._reauth_entry is not None:
            return self.async_update_reload_and_abort(
                self._reauth_entry,
                data_updates=self._credentials,
                reason="reauth_successful",
            )

        return await self.async_step_permit()

    async def _async_validate_credentials(
        self, username: str, password: str, errors: dict[str, str]
    ) -> list[PermitChoice]:
        """Validate credentials and return permits."""

        if self._provider_config is None:
            errors["base"] = "unknown"
            return []

        try:
            client = await async_create_client(self.hass, self._provider_config)
            provider = await client.get_provider(
                self._provider_config.provider_id,
                base_url=self._provider_config.base_url,
                api_uri=self._provider_config.api_url,
            )
            await provider.login(username=username, password=password)
            permit = await provider.get_permit()
        except AuthError:
            errors["base"] = "invalid_auth"
            return []
        except NetworkError:
            errors["base"] = "cannot_connect"
            return []
        except PyCityVisitorParkingError as err:
            LOGGER.debug(
                "Provider error during login for %s: %s",
                self._provider_config.provider_id,
                type(err).__name__,
            )
            errors["base"] = "unknown"
            return []
        # Allowed in config flow
        except Exception as err:  # noqa: BLE001
            LOGGER.debug(
                "Unexpected error during login for %s: %s",
                self._provider_config.provider_id,
                type(err).__name__,
            )
            errors["base"] = "unknown"
            return []

        permit_id = get_attr(permit, "permit_id") or get_attr(permit, "id")
        choices = []
        if permit_id:
            label = get_attr(permit, "name") or get_attr(permit, "label") or permit_id
            choices = [
                PermitChoice(
                    permit_id=str(permit_id),
                    label=str(label),
                )
            ]
        if not choices:
            errors["base"] = "no_permits"
            return []

        return choices

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        """Return the options flow handler."""

        return CityVisitorParkingOptionsFlow(config_entry)


class CityVisitorParkingOptionsFlow(config_entries.OptionsFlow):
    """Handle options for City visitor parking."""

    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        """Initialize options flow."""

        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Manage the options flow."""

        errors: dict[str, str] = {}
        if user_input is not None:
            section_input = user_input.get(SECTION_OPERATING_TIMES, {})
            if not isinstance(section_input, Mapping):
                section_input = {}
            overrides = _build_overrides(section_input, errors)
            if errors:
                return self._show_form(user_input, errors)

            self._update_description(user_input.get(CONF_DESCRIPTION))
            return self.async_create_entry(
                title="",
                data={
                    CONF_AUTO_END: cast(bool, user_input[CONF_AUTO_END]),
                    CONF_OPERATING_TIME_OVERRIDES: overrides,
                },
            )

        return self._show_form(user_input, errors)

    def _show_form(
        self, user_input: dict[str, object] | None, errors: dict[str, str]
    ) -> config_entries.ConfigFlowResult:
        """Show the options form."""

        overrides = self._config_entry.options.get(CONF_OPERATING_TIME_OVERRIDES, {})
        if not isinstance(overrides, Mapping):
            overrides = {}
        defaults = {CONF_AUTO_END: self._config_entry.options.get(CONF_AUTO_END, False)}
        description_default = self._config_entry.data.get(CONF_DESCRIPTION, "")
        if user_input is not None:
            raw_auto_end = user_input.get(CONF_AUTO_END)
            if isinstance(raw_auto_end, bool):
                defaults[CONF_AUTO_END] = raw_auto_end
            raw_description = user_input.get(CONF_DESCRIPTION)
            if isinstance(raw_description, str):
                description_default = raw_description

        expanded = False
        for day in WEEKDAY_KEYS:
            if normalize_override_windows(overrides.get(day)):
                expanded = True
                break
        if not expanded and user_input is not None:
            section_input = user_input.get(SECTION_OPERATING_TIMES, {})
            if isinstance(section_input, Mapping):
                for day in WEEKDAY_KEYS:
                    raw_value = section_input.get(_day_windows_key(day))
                    if isinstance(raw_value, str) and raw_value.strip():
                        expanded = True
                        break

        schema: dict[object, object] = {
            vol.Required(CONF_AUTO_END, default=defaults[CONF_AUTO_END]): cv.boolean,
            vol.Optional(CONF_DESCRIPTION, default=description_default): cv.string,
        }

        day_schema: dict[object, object] = {}
        for day in WEEKDAY_KEYS:
            day_key = _day_windows_key(day)
            default_windows = _format_override_windows(overrides.get(day))
            if user_input is not None:
                section_input = user_input.get(SECTION_OPERATING_TIMES, {})
                if isinstance(section_input, dict):
                    default_windows = section_input.get(day_key, default_windows)

            day_schema[vol.Optional(day_key, default=default_windows)] = (
                selector.TextSelector()
            )

        schema[vol.Required(SECTION_OPERATING_TIMES)] = section(
            vol.Schema(day_schema), {"collapsed": not expanded}
        )

        return self.async_show_form(
            step_id="init", data_schema=vol.Schema(schema), errors=errors
        )

    def _update_description(self, raw_description: object) -> None:
        """Update the config entry description and title."""

        description = str(raw_description).strip() if raw_description else ""
        data = dict(self._config_entry.data)
        if description:
            data[CONF_DESCRIPTION] = description
        else:
            data.pop(CONF_DESCRIPTION, None)

        permit_id = data.get(CONF_PERMIT_ID)
        municipality = data.get(CONF_MUNICIPALITY)
        if permit_id and municipality:
            title = (
                f"{description} - {permit_id}"
                if description
                else f"{municipality} - {permit_id}"
            )
        else:
            title = self._config_entry.title

        self.hass.config_entries.async_update_entry(
            self._config_entry,
            data=data,
            title=title,
        )


def _build_unique_id(provider: ProviderConfig, permit_id: str) -> str:
    """Build a stable unique id for config entries."""

    municipality_slug = slugify(provider.municipality_name)
    return f"{provider.provider_id}:{permit_id}:{municipality_slug}"


def _build_overrides(
    user_input: Mapping[str, object], errors: dict[str, str]
) -> dict[str, list[dict[str, str]]]:
    """Build operating time overrides from user input."""

    overrides: dict[str, list[dict[str, str]]] = {}
    for day in WEEKDAY_KEYS:
        day_key = _day_windows_key(day)
        windows = _parse_time_windows(user_input.get(day_key), errors)
        if errors:
            return {}
        if not windows:
            continue
        overrides[day] = windows
    return overrides


async def _async_load_providers(hass: HomeAssistant) -> dict[str, ProviderConfig]:
    """Load providers from the packaged YAML file."""

    return await hass.async_add_executor_job(_load_providers_sync)


def _load_providers_sync() -> dict[str, ProviderConfig]:
    """Load provider definitions from disk in a worker thread."""

    with (
        resources.files(__package__)
        .joinpath("providers.yaml")
        .open("r", encoding="utf-8") as file
    ):
        data = yaml.safe_load(file) or {}

    providers: dict[str, ProviderConfig] = {}
    for key, config in data.items():
        providers[key] = ProviderConfig(
            provider_id=str(config["provider_id"]),
            municipality_name=str(config["municipality_name"]),
            base_url=str(config.get("base_url")) if config.get("base_url") else None,
            api_url=str(config.get("api_url")) if config.get("api_url") else None,
        )
    return providers


async def _async_list_providers() -> list[str]:
    """Return provider IDs from the client library."""

    client = Client()
    providers = await client.list_providers()
    return [provider.id for provider in providers]


def _parse_time(value: object) -> time | None:
    """Parse time strings into time objects."""

    if isinstance(value, time):
        return value
    if isinstance(value, str):
        if not value:
            return None
        return dt_util.parse_time(value)
    return None


def _format_time(value: time | None) -> str | None:
    """Format a time object for selector defaults."""

    if value is None:
        return None
    return value.replace(microsecond=0).strftime("%H:%M")


def _format_override_windows(value: object) -> str:
    """Format overrides into a comma-separated string."""

    windows = normalize_override_windows(value)
    if not windows:
        return ""
    formatted: list[str] = []
    for window in windows:
        start = _parse_time(window.get("start"))
        end = _parse_time(window.get("end"))
        if start is None or end is None:
            continue
        formatted.append(f"{start:%H:%M}-{end:%H:%M}")
    return ", ".join(formatted)


def _parse_time_windows(value: object, errors: dict[str, str]) -> list[dict[str, str]]:
    """Parse a comma-separated time window string."""

    if value is None:
        return []
    if not isinstance(value, str):
        errors["base"] = "invalid_override_format"
        return []

    raw = value.strip()
    if not raw:
        return []

    windows: list[dict[str, str]] = []
    for segment in [part.strip() for part in raw.split(",") if part.strip()]:
        if "-" not in segment:
            errors["base"] = "invalid_override_format"
            return []
        start_raw, end_raw = (part.strip() for part in segment.split("-", 1))
        if not start_raw or not end_raw:
            errors["base"] = "invalid_override_format"
            return []
        start = _parse_time(start_raw)
        end = _parse_time(end_raw)
        if start is None or end is None:
            errors["base"] = "invalid_override_format"
            return []
        if end <= start:
            errors["base"] = "invalid_time_range"
            return []
        windows.append(
            {
                "start": _format_time(start) or "",
                "end": _format_time(end) or "",
            }
        )
    return windows


def _day_windows_key(day: str) -> str:
    """Return the field key for a weekday's window input."""

    return f"{WEEKDAY_LABELS[day]}_chargeable_windows"
