"""Client helpers for the City visitor parking integration."""

from __future__ import annotations

from typing import Any

from homeassistant.helpers import aiohttp_client
from pycityvisitorparking import Client

from .models import ProviderConfig


async def async_create_client(hass: Any, provider: ProviderConfig) -> Any:
    """Create a pycityvisitorparking client using Home Assistant's session."""

    session = aiohttp_client.async_get_clientsession(hass)
    return Client(
        session=session,
        base_url=provider.base_url,
        api_uri=provider.api_url,
    )
