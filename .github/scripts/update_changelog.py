#!/usr/bin/env python3
"""Update CHANGELOG.md from GitHub release notes."""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

CHANGES_HEADING = "## Changes"


def _normalize_body(body: str) -> str:
    body = body.strip()
    if body.startswith(CHANGES_HEADING):
        body = re.sub(r"^## Changes\s*", "", body, flags=re.S).strip()
    if not body:
        return ""

    # Demote category headings to sit under the version heading in the changelog.
    return re.sub(r"^### ", "#### ", body, flags=re.M)


def _load_release() -> dict[str, str]:
    event_path = os.environ.get("GITHUB_EVENT_PATH")
    if not event_path:
        print("GITHUB_EVENT_PATH is not set", file=sys.stderr)
        raise SystemExit(1)

    with Path(event_path).open(encoding="utf-8") as file:
        event = json.load(file)

    release = event.get("release")
    if not release:
        print("No release data in event payload", file=sys.stderr)
        raise SystemExit(1)

    tag = release.get("tag_name")
    if not tag:
        print("Release tag name is missing", file=sys.stderr)
        raise SystemExit(1)

    body = _normalize_body(release.get("body") or "")
    if not body:
        body = "- No changes"

    return {"tag": tag, "body": body}


def main() -> int:
    release = _load_release()
    changelog_path = Path("CHANGELOG.md")
    changelog = changelog_path.read_text(encoding="utf-8")

    if f"### {release['tag']}" in changelog:
        print("Changelog already contains this release")
        return 0

    unreleased_re = re.compile(r"## Unreleased\s*\n\n(?P<body>.*?)(?=\n## )", re.S)
    match = unreleased_re.search(changelog)
    if not match:
        print("Unreleased section not found", file=sys.stderr)
        return 1

    unreleased_body = _normalize_body(match.group("body"))
    changelog = unreleased_re.sub("## Unreleased\n\n", changelog, count=1)

    released_re = re.compile(r"(## Released\s*\n\n)")
    if not released_re.search(changelog):
        print("Released section not found", file=sys.stderr)
        return 1

    release_body = release["body"]
    if unreleased_body and release_body == "- No changes":
        release_body = unreleased_body
    elif unreleased_body:
        release_body = f"{release_body}\n\n{unreleased_body}"

    new_section = f"### {release['tag']}\n\n{release_body}\n\n"
    changelog = released_re.sub(rf"\1{new_section}", changelog, count=1)

    changelog_path.write_text(changelog, encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
