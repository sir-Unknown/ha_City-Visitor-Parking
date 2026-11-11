"""Client helpers for the City visitor parking integration."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pycityvisitorparking import Client

if TYPE_CHECKING:
    from aiohttp import ClientSession

    from .models import ProviderConfig


async def async_create_client(
    provider: ProviderConfig, session: ClientSession
) -> Client:
    """Create a pycityvisitorparking client on a caller-owned session.

    The session carries its own cookie jar, so callers pass a dedicated session
    per config entry to keep cookie-based provider logins isolated. ``Client``
    never closes an injected session; the caller owns its lifecycle.
    """
    return Client(
        session=session,
        base_url=provider.base_url,
        api_uri=provider.api_url,
    )
