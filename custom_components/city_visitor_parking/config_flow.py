"""Config flow for City visitor parking."""

from __future__ import annotations

import logging
import re
from collections.abc import Mapping
from datetime import date, time
from importlib import resources
from typing import Final, cast

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
from pycityvisitorparking import AuthError, NetworkError
from pycityvisitorparking.exceptions import (
    PyCityVisitorParkingError,
    RateLimitError,
    ServiceUnavailableError,
)

from .client import async_create_client
from .const import (
    CONF_API_URL,
    CONF_AUTO_END,
    CONF_BASE_URL,
    CONF_DEMO_MODE,
    CONF_FREE_DATES,
    CONF_FREE_WEEKDAYS,
    CONF_GUI_URL,
    CONF_MUNICIPALITY,
    CONF_OPERATING_TIME_OVERRIDES,
    CONF_PERMIT_ID,
    CONF_PROVIDER_ID,
    DOMAIN,
    WEEKDAY_KEYS,
)
from .helpers import get_attr, normalize_override_windows, parse_comma_separated
from .models import ProviderConfig
from .version import async_get_versions, build_log_block

SECTION_OPERATING_TIMES: Final[str] = "operating_times"
SECTION_FREE_DATES: Final[str] = "free_parking_dates"

_AUTH_SCHEMA: Final[vol.Schema] = vol.Schema(
    {
        vol.Required(CONF_USERNAME): cv.string,
        vol.Required(CONF_PASSWORD): cv.string,
    }
)

WEEKDAY_LABELS: Final[dict[str, str]] = {
    "mon": "monday",
    "tue": "tuesday",
    "wed": "wednesday",
    "thu": "thursday",
    "fri": "friday",
    "sat": "saturday",
    "sun": "sunday",
}

_LOGGER = logging.getLogger(__name__)


@config_entries.HANDLERS.register(DOMAIN)
class CityVisitorParkingConfigFlow(config_entries.ConfigFlow):
    """Handle a config flow for City visitor parking."""

    VERSION = 1
    MINOR_VERSION = 1

    def __init__(self) -> None:
        """Initialize the config flow."""
        self._providers: dict[str, ProviderConfig] = {}
        self._provider_config: ProviderConfig | None = None
        self._credentials: dict[str, str] = {}
        self._reauth_entry: config_entries.ConfigEntry | None = None

    def is_matching(self, other_flow: CityVisitorParkingConfigFlow) -> bool:
        """Return True if other_flow matches this flow."""
        return False

    async def async_step_user(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the initial step."""
        self._providers = await _async_load_providers(self.hass)
        errors: dict[str, str] = {}

        if user_input is None:
            return self._show_user_form(user_input, errors)

        selected = cast("str", user_input[CONF_MUNICIPALITY])
        username = cast("str", user_input[CONF_USERNAME])
        password = cast("str", user_input[CONF_PASSWORD])
        self._credentials = {CONF_USERNAME: username, CONF_PASSWORD: password}

        self._provider_config = self._resolve_provider_config(selected)
        if self._provider_config is None:
            errors["base"] = "invalid_municipality"
            return self._show_user_form(user_input, errors)
        permit_id = await self._async_validate_credentials(username, password, errors)
        if errors:
            return self._show_user_form(user_input, errors)
        if permit_id is None:
            return self.async_abort(reason="unknown")

        return await self._async_create_entry_for_permit(permit_id)

    async def async_step_auth(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle the authentication step."""
        return await self._async_handle_auth(user_input, step_id="auth")

    def _entry_from_context(self) -> config_entries.ConfigEntry | None:
        """Return the config entry referenced by the flow context, or None."""
        entry_id = self.context.get("entry_id")
        if not isinstance(entry_id, str):
            return None
        return self.hass.config_entries.async_get_entry(entry_id)

    async def async_step_reauth(
        self, _user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle reauthentication."""
        entry = self._entry_from_context()
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

    async def async_step_reconfigure(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Handle reconfiguration."""
        entry = self._entry_from_context()
        if entry is None:
            return self.async_abort(reason="unknown")

        if user_input is None:
            self.context["title_placeholders"] = {"name": entry.title}
            schema = vol.Schema(
                {
                    vol.Optional(
                        CONF_BASE_URL,
                        default=entry.data.get(CONF_BASE_URL, ""),
                    ): cv.string,
                    vol.Optional(
                        CONF_API_URL,
                        default=entry.data.get(CONF_API_URL, ""),
                    ): cv.string,
                }
            )
            return self.async_show_form(
                step_id="reconfigure",
                data_schema=schema,
                description_placeholders={"name": entry.title},
            )

        base_url = _normalize_optional_text(user_input.get(CONF_BASE_URL))
        api_url = _normalize_optional_text(user_input.get(CONF_API_URL))

        provider_id = entry.data.get(CONF_PROVIDER_ID)
        municipality = entry.data.get(CONF_MUNICIPALITY)
        permit_id = entry.data.get(CONF_PERMIT_ID)
        if not provider_id or not municipality or not permit_id:
            return self.async_abort(reason="unknown")

        await self.async_set_unique_id(
            _build_unique_id(
                ProviderConfig(
                    provider_id=provider_id,
                    municipality_name=municipality,
                    base_url=base_url,
                    api_url=api_url,
                ),
                permit_id,
            )
        )
        self._abort_if_unique_id_mismatch(reason="wrong_account")

        return self.async_update_reload_and_abort(
            entry,
            data_updates={
                CONF_BASE_URL: base_url,
                CONF_API_URL: api_url,
            },
            reason="reconfigure_successful",
        )

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
            return self.async_show_form(step_id=step_id, data_schema=_AUTH_SCHEMA)

        username = cast("str", user_input[CONF_USERNAME])
        password = cast("str", user_input[CONF_PASSWORD])
        self._credentials = {CONF_USERNAME: username, CONF_PASSWORD: password}

        permit_id = await self._async_validate_credentials(
            username,
            password,
            errors,
        )
        if errors:
            return self.async_show_form(
                step_id=step_id, data_schema=_AUTH_SCHEMA, errors=errors
            )

        if self._reauth_entry is not None:
            return self.async_update_reload_and_abort(
                self._reauth_entry,
                data_updates=self._credentials,
                reason="reauth_successful",
            )

        if permit_id is None:
            return self.async_abort(reason="unknown")

        return await self._async_create_entry_for_permit(permit_id)

    def _show_user_form(
        self, user_input: Mapping[str, object] | None, errors: dict[str, str]
    ) -> config_entries.ConfigFlowResult:
        """Show the initial municipality and credential form."""
        schema = vol.Schema(
            {
                vol.Required(CONF_MUNICIPALITY): selector.SelectSelector(
                    selector.SelectSelectorConfig(
                        options=[
                            selector.SelectOptionDict(
                                value=provider.municipality_name,
                                label=provider.municipality_name,
                            )
                            for provider in sorted(
                                self._providers.values(),
                                key=lambda p: p.municipality_name,
                            )
                        ],
                        custom_value=True,
                        mode=selector.SelectSelectorMode.DROPDOWN,
                        sort=True,
                    )
                ),
                vol.Required(CONF_USERNAME): cv.string,
                vol.Required(CONF_PASSWORD): cv.string,
            }
        )
        suggested_values: dict[str, object] = {}
        if user_input is not None:
            suggested_values.update(user_input)
            suggested_values.pop(CONF_PASSWORD, None)
        return self.async_show_form(
            step_id="user",
            data_schema=self.add_suggested_values_to_schema(schema, suggested_values),
            errors=errors,
        )

    def _resolve_provider_config(self, selection: str) -> ProviderConfig | None:
        """Resolve a typed municipality selection to a known provider config."""
        if provider_config := self._providers.get(selection):
            return provider_config

        normalized_selection = slugify(selection)
        for key, provider in self._providers.items():
            if provider.municipality_name.casefold() == selection.casefold():
                return provider
            if slugify(provider.municipality_name) == normalized_selection:
                return provider
            if slugify(key) == normalized_selection:
                return provider

        return None

    async def _async_create_entry_for_permit(
        self, permit_id: str
    ) -> config_entries.ConfigFlowResult:
        """Create a config entry for the selected permit."""
        if self._provider_config is None:
            return self.async_abort(reason="unknown")

        unique_id = _build_unique_id(self._provider_config, permit_id)
        await self.async_set_unique_id(unique_id)
        self._abort_if_unique_id_configured()

        title = f"{self._provider_config.municipality_name} - {permit_id}"

        data = {
            CONF_PROVIDER_ID: self._provider_config.provider_id,
            CONF_MUNICIPALITY: self._provider_config.municipality_name,
            CONF_BASE_URL: self._provider_config.base_url,
            CONF_API_URL: self._provider_config.api_url,
            CONF_GUI_URL: self._provider_config.gui_url,
            CONF_PERMIT_ID: permit_id,
            **self._credentials,
        }

        return self.async_create_entry(title=title, data=data)

    async def _async_validate_credentials(
        self, username: str, password: str, errors: dict[str, str]
    ) -> str | None:
        """Validate credentials and return the permit id."""
        if self._provider_config is None:
            errors["base"] = "unknown"
            return None

        error_key: str | None = None
        permit: object | None = None
        ha_cvp_version, pycvp_version = await async_get_versions(self.hass)
        try:
            client = await async_create_client(self.hass, self._provider_config)
            provider = await client.get_provider(
                self._provider_config.provider_id,
                base_url=self._provider_config.base_url,
                api_uri=self._provider_config.api_url,
                request_context=self._provider_config.municipality_name,
                ha_cvp_version=ha_cvp_version,
                pycvp_version=pycvp_version,
            )
            await provider.login(username=username, password=password)
            permit = await provider.get_permit()
        except AuthError as err:
            _LOGGER.debug(
                "%s",
                build_log_block(
                    "login failed",
                    {"error-type": type(err).__name__, "error": str(err)},
                    provider=self._provider_config.provider_id,
                    city=self._provider_config.municipality_name,
                    ha_cvp_version=ha_cvp_version,
                    pycvp_version=pycvp_version,
                ),
            )
            error_key = "invalid_auth"
        except NetworkError:
            error_key = "cannot_connect"
        except RateLimitError as err:
            _LOGGER.debug(
                "%s",
                build_log_block(
                    "login rate-limited",
                    {"error-type": type(err).__name__, "error": str(err)},
                    provider=self._provider_config.provider_id,
                    city=self._provider_config.municipality_name,
                    ha_cvp_version=ha_cvp_version,
                    pycvp_version=pycvp_version,
                ),
            )
            error_key = "rate_limit"
        except ServiceUnavailableError as err:
            _LOGGER.debug(
                "%s",
                build_log_block(
                    "login service unavailable",
                    {"error-type": type(err).__name__, "error": str(err)},
                    provider=self._provider_config.provider_id,
                    city=self._provider_config.municipality_name,
                    ha_cvp_version=ha_cvp_version,
                    pycvp_version=pycvp_version,
                ),
            )
            error_key = "service_unavailable"
        except PyCityVisitorParkingError as err:
            _LOGGER.debug(
                "%s",
                build_log_block(
                    "login provider error",
                    {"error-type": type(err).__name__, "error": str(err)},
                    provider=self._provider_config.provider_id,
                    city=self._provider_config.municipality_name,
                    ha_cvp_version=ha_cvp_version,
                    pycvp_version=pycvp_version,
                ),
            )
            error_key = "unknown"
        # Allowed in config flow
        except Exception as err:  # pylint: disable=broad-exception-caught
            _LOGGER.debug(
                "%s",
                build_log_block(
                    "login unexpected error",
                    {"error-type": type(err).__name__, "error": str(err)},
                    provider=self._provider_config.provider_id,
                    city=self._provider_config.municipality_name,
                    ha_cvp_version=ha_cvp_version,
                    pycvp_version=pycvp_version,
                ),
            )
            error_key = "unknown"

        if error_key is not None:
            errors["base"] = error_key
            return None
        if permit is None:
            errors["base"] = "unknown"
            return None

        permit_id = get_attr(permit, "permit_id") or get_attr(permit, "id")
        if not permit_id:
            errors["base"] = "no_permits"
            return None

        return str(permit_id)

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
        self._config_entry: config_entries.ConfigEntry = config_entry

    async def async_step_init(
        self, user_input: dict[str, object] | None = None
    ) -> config_entries.ConfigFlowResult:
        """Manage the options flow."""
        errors: dict[str, str] = {}
        if user_input is not None:
            section_input = user_input.get(SECTION_OPERATING_TIMES)
            if not isinstance(section_input, Mapping):
                section_input = {}
            overrides, free_weekdays = _build_overrides(
                cast("Mapping[str, object]", section_input),
                errors,
            )
            free_dates_section = user_input.get(SECTION_FREE_DATES)
            if not isinstance(free_dates_section, Mapping):
                free_dates_section = {}
            raw_free_dates = cast("Mapping[str, object]", free_dates_section).get(
                CONF_FREE_DATES, ""
            )
            free_dates = _normalize_free_dates(cast("str", raw_free_dates), errors)
            if errors:
                return self._show_form(user_input, errors)

            return self.async_create_entry(
                title="",
                data={
                    CONF_AUTO_END: cast("bool", user_input[CONF_AUTO_END]),
                    CONF_FREE_DATES: free_dates,
                    CONF_FREE_WEEKDAYS: free_weekdays,
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
        overrides = cast("Mapping[str, object]", overrides)
        defaults = {CONF_AUTO_END: self._config_entry.options.get(CONF_AUTO_END, False)}
        if user_input is not None:
            raw_auto_end = user_input.get(CONF_AUTO_END)
            if isinstance(raw_auto_end, bool):
                defaults[CONF_AUTO_END] = raw_auto_end

        raw_free_weekdays = self._config_entry.options.get(CONF_FREE_WEEKDAYS, [])
        free_weekdays: list[str] = (
            list(raw_free_weekdays) if isinstance(raw_free_weekdays, list) else []
        )

        free_dates_default = str(self._config_entry.options.get(CONF_FREE_DATES, ""))
        if user_input is not None:
            free_dates_section = user_input.get(SECTION_FREE_DATES, {})
            if isinstance(free_dates_section, Mapping):
                raw = cast("Mapping[str, object]", free_dates_section).get(
                    CONF_FREE_DATES
                )
                if isinstance(raw, str):
                    free_dates_default = raw

        expanded_times = _should_expand_overrides(overrides, free_weekdays, user_input)
        expanded_free = bool(free_dates_default.strip())

        schema: dict[object, object] = {
            vol.Required(CONF_AUTO_END, default=defaults[CONF_AUTO_END]): cv.boolean,
        }

        day_schema = _build_day_schema(overrides, free_weekdays, user_input)
        schema[vol.Required(SECTION_OPERATING_TIMES)] = section(
            vol.Schema(day_schema), {"collapsed": not expanded_times}
        )

        free_dates_schema = {
            vol.Optional(CONF_FREE_DATES, default=free_dates_default): (
                selector.TextSelector(selector.TextSelectorConfig())
            ),
        }
        schema[vol.Required(SECTION_FREE_DATES)] = section(
            vol.Schema(free_dates_schema), {"collapsed": not expanded_free}
        )

        return self.async_show_form(
            step_id="init", data_schema=vol.Schema(schema), errors=errors
        )


def _build_unique_id(provider: ProviderConfig, permit_id: str) -> str:
    """Build a stable unique id for config entries."""
    municipality_slug = slugify(provider.municipality_name)
    return f"{provider.provider_id}:{permit_id}:{municipality_slug}"


def _build_overrides(
    user_input: Mapping[str, object], errors: dict[str, str]
) -> tuple[dict[str, list[dict[str, str]]], list[str]]:
    """Build operating time overrides and free weekdays from user input."""
    overrides: dict[str, list[dict[str, str]]] = {}
    free_weekdays: list[str] = []
    for day in WEEKDAY_KEYS:
        free_key = _day_free_key(day)
        if user_input.get(free_key) is True:
            free_weekdays.append(day)
            continue
        day_key = _day_windows_key(day)
        windows = _parse_time_windows(user_input.get(day_key), errors)
        if errors:
            return {}, []
        if not windows:
            continue
        overrides[day] = windows
    return overrides, free_weekdays


async def _async_load_providers(hass: HomeAssistant) -> dict[str, ProviderConfig]:
    """Load providers from the packaged YAML file."""
    demo_mode: bool = hass.data.get(DOMAIN, {}).get(CONF_DEMO_MODE, False)
    return await hass.async_add_executor_job(_load_providers_sync, demo_mode)


def _load_providers_sync(demo_mode: bool = False) -> dict[str, ProviderConfig]:
    """Load provider definitions from disk in a worker thread."""
    with (
        resources.files(__package__)
        .joinpath("providers.yaml")
        .open("r", encoding="utf-8") as file
    ):
        data = cast("dict[str, dict[str, object]]", yaml.safe_load(file) or {})

    providers: dict[str, ProviderConfig] = {}
    for key, config in data.items():
        provider_id = str(config["provider_id"])
        if provider_id == "demo" and not demo_mode:
            continue
        providers[key] = ProviderConfig(
            provider_id=provider_id,
            municipality_name=str(config["municipality_name"]),
            base_url=_normalize_optional_text(config.get("base_url")),
            api_url=_normalize_optional_text(config.get("api_url")),
            gui_url=_normalize_optional_text(config.get("gui_url")),
        )
    return providers


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
    error_key: str | None = None
    for segment in [part.strip() for part in raw.split(",") if part.strip()]:
        if "-" not in segment:
            error_key = "invalid_override_format"
            break
        start_raw, end_raw = (part.strip() for part in segment.split("-", 1))
        if not start_raw or not end_raw:
            error_key = "invalid_override_format"
            break
        start = _parse_time(start_raw)
        end = _parse_time(end_raw)
        if start is None or end is None:
            error_key = "invalid_override_format"
            break
        if end <= start:
            error_key = "invalid_time_range"
            break
        windows.append(
            {
                "start": _format_time(start) or "",
                "end": _format_time(end) or "",
            }
        )
    if error_key is not None:
        errors["base"] = error_key
        return []
    return windows


def _day_windows_key(day: str) -> str:
    """Return the field key for a weekday's window input."""
    return f"{WEEKDAY_LABELS[day]}_chargeable_windows"


def _day_free_key(day: str) -> str:
    """Return the field key for a weekday's free parking checkbox."""
    return f"{WEEKDAY_LABELS[day]}_free_parking"


def _should_expand_overrides(
    overrides: Mapping[str, object],
    free_weekdays: list[str],
    user_input: dict[str, object] | None,
) -> bool:
    """Return True when the overrides section should be expanded."""
    if free_weekdays or any(
        normalize_override_windows(overrides.get(day)) for day in WEEKDAY_KEYS
    ):
        return True
    if user_input is None:
        return False
    section_input = user_input.get(SECTION_OPERATING_TIMES, {})
    if not isinstance(section_input, Mapping):
        return False
    section_input = cast("Mapping[str, object]", section_input)
    for day in WEEKDAY_KEYS:
        raw_free = section_input.get(_day_free_key(day))
        if isinstance(raw_free, bool) and raw_free:
            return True
        raw_windows = section_input.get(_day_windows_key(day))
        if isinstance(raw_windows, str) and raw_windows.strip():
            return True
    return False


def _build_day_schema(
    overrides: Mapping[str, object],
    free_weekdays: list[str],
    user_input: dict[str, object] | None,
) -> dict[object, object]:
    """Build the schema for weekday override inputs."""
    day_schema: dict[object, object] = {}
    section_input: Mapping[str, object] | None = None
    if user_input is not None:
        candidate = user_input.get(SECTION_OPERATING_TIMES, {})
        if isinstance(candidate, Mapping):
            section_input = cast("Mapping[str, object]", candidate)

    for day in WEEKDAY_KEYS:
        day_key = _day_windows_key(day)
        free_key = _day_free_key(day)

        # Determine whether free parking is active for this day.
        is_free = day in free_weekdays
        if section_input is not None:
            raw_free = section_input.get(free_key)
            if isinstance(raw_free, bool):
                is_free = raw_free

        day_schema[vol.Optional(free_key, default=is_free)] = selector.BooleanSelector()

        # Build the time windows field; always shown, ignored on save when free.
        default_windows = (
            "" if is_free else _format_override_windows(overrides.get(day))
        )
        if section_input is not None and not is_free:
            raw_value = section_input.get(day_key, default_windows)
            if isinstance(raw_value, str):
                default_windows = raw_value
        day_schema[vol.Optional(day_key, default=default_windows)] = (
            selector.TextSelector(selector.TextSelectorConfig())
        )

    return day_schema


_FREE_DATE_ANNUAL_RE = re.compile(r"^(\d{2})-(\d{2})$")
_FREE_DATE_ONCE_RE = re.compile(r"^(\d{2})-(\d{2})-(\d{4})$")


def _is_valid_free_date(entry: str) -> bool:
    """Return True if entry is a valid DD-MM or DD-MM-YYYY date string."""
    m = _FREE_DATE_ANNUAL_RE.match(entry)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        try:
            date(dt_util.now().year, month, day)
            return True
        except ValueError:
            return False
    m = _FREE_DATE_ONCE_RE.match(entry)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            date(year, month, day)
            return True
        except ValueError:
            return False
    return False


def _normalize_free_dates(value: str, errors: dict[str, str]) -> str:
    """Normalize and validate a comma-separated free-dates string.

    Invalid entries set errors['base'] and cause an empty string to be returned.
    """
    entries = parse_comma_separated(value)
    for entry in entries:
        if not _is_valid_free_date(entry):
            errors["base"] = "invalid_free_date_format"
            return ""
    return ", ".join(entries)


def _normalize_optional_text(value: object) -> str | None:
    """Normalize optional text input to None or a stripped string."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None
