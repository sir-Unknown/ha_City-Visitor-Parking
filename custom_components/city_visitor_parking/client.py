"""Client helpers for the City visitor parking integration."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.helpers import aiohttp_client
from pycityvisitorparking import Client

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

    from .models import ProviderConfig


async def async_create_client(hass: HomeAssistant, provider: ProviderConfig) -> Client:
    """Create a pycityvisitorparking client using Home Assistant's session."""
    session = aiohttp_client.async_get_clientsession(hass)
    return Client(
        session=session,
        base_url=provider.base_url,
        api_uri=provider.api_url,
    )
