"""Provider authentication helpers for the City visitor parking integration."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from homeassistant.const import CONF_PASSWORD, CONF_USERNAME

from .const import CONF_PERMIT_ID

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry
    from pycityvisitorparking.provider.base import BaseProvider

_LOGGER = logging.getLogger(__name__)


def has_stored_credentials(entry: ConfigEntry) -> bool:
    """Return whether the entry carries credentials usable for a login."""
    return bool(entry.data.get(CONF_USERNAME)) and bool(entry.data.get(CONF_PASSWORD))


async def async_provider_login(entry: ConfigEntry, provider: BaseProvider) -> None:
    """Authenticate a provider with the credentials stored on the config entry.

    Shared by initial setup and by the runtime recovery path in the
    coordinator, so a session that has to be re-established while the entry is
    running is established exactly the way a manual reload would establish it.

    Anything the provider resolves during login stays inside the library and is
    reused on reauthentication, so nothing is persisted on the entry.

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
        )
    finally:
        _LOGGER.debug(
            "Provider login duration for %s (permit %s): %.3fs",
            entry.title,
            entry.data.get(CONF_PERMIT_ID),
            time.perf_counter() - login_started,
        )
