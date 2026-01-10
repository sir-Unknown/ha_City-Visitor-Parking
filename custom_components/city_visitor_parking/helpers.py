"""Shared helper utilities for the City visitor parking integration."""

from __future__ import annotations


def normalize_override_windows(value: object) -> list[dict[str, str]]:
    """Normalize override data to a list of window dicts."""

    if isinstance(value, list):
        return [window for window in value if isinstance(window, dict)]
    if isinstance(value, dict) and "start" in value and "end" in value:
        return [value]
    return []


def get_attr(obj: object, name: str) -> object | None:
    """Return attribute or mapping value for name."""

    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)
