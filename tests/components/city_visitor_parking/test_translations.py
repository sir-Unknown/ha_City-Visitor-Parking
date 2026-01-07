"""Tests for translation files."""

from __future__ import annotations

import json
from pathlib import Path


def test_translation_files_parse() -> None:
    """Ensure translations exist and parse as JSON."""

    base = Path("custom_components/city_visitor_parking")
    files = [
        base / "translations" / "en.json",
        base / "translations" / "nl.json",
    ]

    for path in files:
        assert path.exists()
        json.loads(path.read_text(encoding="utf-8"))
