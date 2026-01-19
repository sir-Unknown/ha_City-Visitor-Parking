"""Shared helper utilities for the City visitor parking integration."""

from __future__ import annotations

from collections.abc import Mapping
from typing import cast


def normalize_override_windows(value: object) -> list[dict[str, object]]:
    """Normalize override data to a list of window dicts."""
    if isinstance(value, list):
        windows = cast("list[object]", value)
        return [
            cast("dict[str, object]", window)
            for window in windows
            if isinstance(window, dict)
        ]
    if isinstance(value, dict) and "start" in value and "end" in value:
        return [cast("dict[str, object]", value)]
    return []


def get_attr(obj: object, name: str) -> object | None:
    """Return attribute or mapping value for name."""
    if isinstance(obj, Mapping):
        mapping = cast("Mapping[str, object]", obj)
        return mapping.get(name)
    return getattr(obj, name, None)
