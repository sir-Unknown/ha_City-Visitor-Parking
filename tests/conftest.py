"""Test configuration for City visitor parking."""

from __future__ import annotations

import sys
from dataclasses import dataclass
from types import ModuleType
from typing import Any, cast

import pytest

pytest_plugins = "pytest_homeassistant_custom_component"


class PyCityVisitorParkingError(Exception):
    """Stub base error."""


class AuthError(PyCityVisitorParkingError):
    """Stub auth error."""


class NetworkError(PyCityVisitorParkingError):
    """Stub network error."""


class ProviderError(PyCityVisitorParkingError):
    """Stub provider error."""


class ValidationError(PyCityVisitorParkingError):
    """Stub validation error."""


class Client:
    """Stub client for testing."""

    def __init__(self, *_args: object, **_kwargs: object) -> None:
        """Initialize the stub client."""

    async def list_providers(self) -> list[ProviderInfo]:
        """Return a default provider list."""
        return [
            ProviderInfo(
                id="dvsportal",
                favorite_update_fields=(),
                reservation_update_fields=(),
            )
        ]

    async def get_provider(self, *_args: object, **_kwargs: object) -> Provider:
        """Return a stub provider."""
        return Provider()


@dataclass(frozen=True)
class ProviderInfo:
    """Stub provider info."""

    id: str
    favorite_update_fields: tuple[str, ...]
    reservation_update_fields: tuple[str, ...]


class Provider:
    """Stub provider for testing."""

    async def login(self, *_args: object, **_kwargs: object) -> None:
        """Stub login call."""

    async def get_permit(self) -> dict[str, object]:
        """Return a default permit."""
        return {"id": "permit", "zone_validity": []}

    async def list_reservations(self) -> list[dict[str, object]]:
        """Return no reservations by default."""
        return []

    async def list_favorites(self) -> list[dict[str, object]]:
        """Return no favorites by default."""
        return []

    async def start_reservation(self, *_args: object, **_kwargs: object) -> None:
        """Stub start reservation."""

    async def update_reservation(self, *_args: object, **_kwargs: object) -> None:
        """Stub update reservation."""

    async def end_reservation(self, *_args: object, **_kwargs: object) -> None:
        """Stub end reservation."""

    async def add_favorite(self, *_args: object, **_kwargs: object) -> None:
        """Stub add favorite."""

    async def update_favorite(self, *_args: object, **_kwargs: object) -> None:
        """Stub update favorite."""

    async def remove_favorite(self, *_args: object, **_kwargs: object) -> None:
        """Stub remove favorite."""


module = cast("Any", ModuleType("pycityvisitorparking"))
module.AuthError = AuthError
module.NetworkError = NetworkError
module.ProviderError = ProviderError
module.ValidationError = ValidationError
module.ProviderInfo = ProviderInfo
module.Client = Client

exceptions_module = cast("Any", ModuleType("pycityvisitorparking.exceptions"))
exceptions_module.PyCityVisitorParkingError = PyCityVisitorParkingError
exceptions_module.AuthError = AuthError
exceptions_module.NetworkError = NetworkError
exceptions_module.ProviderError = ProviderError
exceptions_module.ValidationError = ValidationError

sys.modules.setdefault("pycityvisitorparking", module)
sys.modules.setdefault("pycityvisitorparking.exceptions", exceptions_module)


@pytest.fixture(autouse=True)
def _enable_custom_integrations(enable_custom_integrations: None) -> None:
    """Enable custom integrations for tests."""
    _ = enable_custom_integrations


@pytest.fixture
def pv_library() -> ModuleType:
    """Return the stubbed pycityvisitorparking module."""
    return module
