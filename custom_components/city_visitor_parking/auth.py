"""Provider authentication helpers for the City visitor parking integration."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from homeassistant.const import CONF_PASSWORD, CONF_USERNAME
from pycityvisitorparking import AuthError

from .const import CONF_PERMIT_ID, CONF_RESOLVED_LOGIN_PARAMS

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from pycityvisitorparking.provider.base import BaseProvider

    from .runtime_data import CityVisitorParkingConfigEntry

_LOGGER = logging.getLogger(__name__)


def has_stored_credentials(entry: CityVisitorParkingConfigEntry) -> bool:
    """Return whether the entry carries credentials usable for a login."""
    return bool(entry.data.get(CONF_USERNAME)) and bool(entry.data.get(CONF_PASSWORD))


async def async_provider_login(
    hass: HomeAssistant,
    entry: CityVisitorParkingConfigEntry,
    provider: BaseProvider,
) -> None:
    """Authenticate a provider with the credentials stored on the config entry.

    Shared by initial setup and by the runtime recovery path in the
    coordinator, so a session that has to be re-established while the entry is
    running is established exactly the way a manual reload would establish it.

    Provider-resolved login parameters are persisted on the entry so a later
    login can skip the lookups that produced them, and are cleared again when
    the provider rejects the login, so a stale resolved value cannot keep a
    valid account locked out.

    Library errors are raised unchanged; callers decide how to surface them.
    """
    login_started = time.perf_counter()
    try:
        await provider.login(
            username=entry.data[CONF_USERNAME],
            password=entry.data[CONF_PASSWORD],
            # Passes the permit_id so providers can skip auto-detection when
            # multiple config entries share the same provider.
            permit_id=entry.data.get(CONF_PERMIT_ID),
            # Passes previously resolved params back to skip redundant API calls
            # on restart (e.g. location for 2park, permit_media_type_id for dvsportal).
            **entry.data.get(CONF_RESOLVED_LOGIN_PARAMS, {}),
        )
    except AuthError:
        if entry.data.get(CONF_RESOLVED_LOGIN_PARAMS):
            hass.config_entries.async_update_entry(
                entry, data={**entry.data, CONF_RESOLVED_LOGIN_PARAMS: {}}
            )
        raise
    finally:
        _LOGGER.debug(
            "Provider login duration for %s (permit %s): %.3fs",
            entry.title,
            entry.data.get(CONF_PERMIT_ID),
            time.perf_counter() - login_started,
        )

    resolved = getattr(provider, "resolved_login_params", {})
    if resolved != entry.data.get(CONF_RESOLVED_LOGIN_PARAMS):
        hass.config_entries.async_update_entry(
            entry, data={**entry.data, CONF_RESOLVED_LOGIN_PARAMS: resolved}
        )
