"""Shared version helpers for City visitor parking logging."""

from __future__ import annotations

import importlib.metadata
from typing import TYPE_CHECKING, Any

from homeassistant.loader import async_get_integration

from .const import DOMAIN

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_VERSION_CACHE_KEY = f"{DOMAIN}_versions"


async def async_get_versions(hass: HomeAssistant) -> tuple[str, str]:
    """Return cached integration and library versions."""
    if cached_versions := hass.data.get(_VERSION_CACHE_KEY):
        return cached_versions

    integration = await async_get_integration(hass, DOMAIN)
    ha_cvp_version = str(integration.manifest.get("version", "unknown"))
    try:
        pycvp_version = await hass.async_add_executor_job(
            importlib.metadata.version, "pycityvisitorparking"
        )
    except importlib.metadata.PackageNotFoundError:
        pycvp_version = "unknown"

    versions = (ha_cvp_version, pycvp_version)
    hass.data[_VERSION_CACHE_KEY] = versions
    return versions


def get_cached_versions(hass: HomeAssistant) -> tuple[str, str]:
    """Return cached versions, or unknown values when not initialized yet."""
    return hass.data.get(_VERSION_CACHE_KEY, ("unknown", "unknown"))


def build_log_block(  # noqa: PLR0913
    label: str,
    fields: dict[str, Any] | None = None,
    *,
    provider: str = "unknown",
    city: str = "unknown",
    ha_cvp_version: str = "unknown",
    pycvp_version: str = "unknown",
) -> str:
    """Return a labelled multi-line key=value block with provider metadata."""
    all_fields = {k: v for k, v in (fields or {}).items() if v is not None}
    all_fields.update(
        {
            "provider": provider,
            "city": city,
            "hacvp": ha_cvp_version,
            "pycvp": pycvp_version,
        }
    )
    width = max(len(k) for k in all_fields)
    lines = [label, *[f"  {k:<{width}} = {v}" for k, v in all_fields.items()]]
    return "\n".join(lines)
