"""Tests for shared version helpers."""

from __future__ import annotations

import importlib.metadata
from types import SimpleNamespace
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

from custom_components.city_visitor_parking.version import (
    _VERSION_CACHE_KEY,
    async_get_versions,
)

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant
    from pytest import MonkeyPatch


async def test_async_get_versions_returns_versions(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Version helper should return manifest and package versions."""
    hass.data.pop(_VERSION_CACHE_KEY, None)
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.version.async_get_integration",
        AsyncMock(return_value=SimpleNamespace(manifest={"version": "1.2.3"})),
    )
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.version.importlib.metadata.version",
        lambda _: "4.5.6",
    )

    assert await async_get_versions(hass) == ("1.2.3", "4.5.6")


async def test_async_get_versions_handles_missing_package(
    hass: HomeAssistant, monkeypatch: MonkeyPatch
) -> None:
    """Version helper should fall back to unknown when package metadata is missing."""
    hass.data.pop(_VERSION_CACHE_KEY, None)
    monkeypatch.setattr(
        "custom_components.city_visitor_parking.version.async_get_integration",
        AsyncMock(return_value=SimpleNamespace(manifest={"version": "1.2.3"})),
    )

    def _raise_package_not_found(_: str) -> str:
        raise importlib.metadata.PackageNotFoundError

    monkeypatch.setattr(
        "custom_components.city_visitor_parking.version.importlib.metadata.version",
        _raise_package_not_found,
    )

    assert await async_get_versions(hass) == ("1.2.3", "unknown")
