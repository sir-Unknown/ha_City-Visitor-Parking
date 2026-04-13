#!/usr/bin/env python3
"""Switch pycityvisitorparking between released and local Git testing modes."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = REPO_ROOT / "custom_components/city_visitor_parking/manifest.json"
PYPROJECT_PATH = REPO_ROOT / "pyproject.toml"
PROVIDERS_PATH = REPO_ROOT / "custom_components/city_visitor_parking/providers.yaml"

DEFAULT_RELEASE_REQUIREMENT = "pycityvisitorparking==0.5.21"
DEFAULT_RELEASE_PROVIDER_ID = "dvsportal"
DEFAULT_LOCAL_PROVIDER_ID = "dvsportal_new"
DEFAULT_LOCAL_REPO = REPO_ROOT.parent / "pyCityVisitorParking"
DEFAULT_REMOTE_REPO = "https://github.com/sir-Unknown/pyCityVisitorParking.git"


def _parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description=(
            "Switch pycityvisitorparking between the released dependency and "
            "a local git checkout for testing."
        )
    )
    subparsers = parser.add_subparsers(dest="mode", required=True)

    release_parser = subparsers.add_parser(
        "release",
        help="Use the published pycityvisitorparking release and released DVS IDs.",
    )
    release_parser.add_argument(
        "--requirement",
        default=DEFAULT_RELEASE_REQUIREMENT,
        help=f"Published requirement to pin (default: {DEFAULT_RELEASE_REQUIREMENT})",
    )

    local_git_parser = subparsers.add_parser(
        "local-git",
        help="Use a local git checkout and switch DVS providers to dvsportal_new.",
    )
    local_git_parser.add_argument(
        "--repo",
        default=str(DEFAULT_LOCAL_REPO),
        help=(
            "Path to the local pyCityVisitorParking git checkout "
            f"(default: {DEFAULT_LOCAL_REPO})"
        ),
    )
    local_git_parser.add_argument(
        "--ref",
        help=(
            "Git branch, tag, or commit to install. Defaults to the checkout's "
            "current branch, or HEAD commit when detached."
        ),
    )

    remote_git_parser = subparsers.add_parser(
        "remote-git",
        help=(
            "Use a public GitHub git ref so HACVP can release against an "
            "unreleased pyCityVisitorParking commit."
        ),
    )
    remote_git_parser.add_argument(
        "--repo",
        default=DEFAULT_REMOTE_REPO,
        help=f"Remote git repository URL (default: {DEFAULT_REMOTE_REPO})",
    )
    remote_git_parser.add_argument(
        "--ref",
        required=True,
        help="Public branch, tag, or commit that already exists on the remote.",
    )
    return parser.parse_args()


def _run_git(repo_path: Path, *args: str) -> str:
    """Run git in the provided repository and return stdout."""
    result = subprocess.run(
        ["git", "-C", str(repo_path), *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _resolve_local_git_requirement(repo_arg: str, ref_arg: str | None) -> str:
    """Build a local git requirement for pycityvisitorparking."""
    repo_path = Path(repo_arg).expanduser().resolve()
    if not repo_path.exists():
        raise FileNotFoundError(f"Local git checkout not found: {repo_path}")

    if ref_arg is not None:
        ref = ref_arg
    else:
        try:
            ref = _run_git(repo_path, "symbolic-ref", "--quiet", "--short", "HEAD")
        except subprocess.CalledProcessError:
            ref = _run_git(repo_path, "rev-parse", "HEAD")

    return f"pycityvisitorparking @ git+{repo_path.as_uri()}@{ref}"


def _resolve_remote_git_requirement(repo_url: str, ref: str) -> str:
    """Build a remote git requirement for pycityvisitorparking."""
    return f"pycityvisitorparking @ git+{repo_url}@{ref}"


def _update_manifest(requirement: str) -> None:
    """Update manifest.json with the selected dependency."""
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest["requirements"] = [requirement]
    manifest_text = json.dumps(manifest, indent=2)
    for key in ("after_dependencies", "codeowners", "dependencies", "requirements"):
        manifest_text = re.sub(
            rf'"{key}": \[\n\s+"([^"\n]+)"\n\s+\]',
            rf'"{key}": ["\1"]',
            manifest_text,
        )
    MANIFEST_PATH.write_text(manifest_text + "\n", encoding="utf-8")


def _update_pyproject(requirement: str) -> None:
    """Update pyproject.toml with the selected dependency."""
    pyproject_text = PYPROJECT_PATH.read_text(encoding="utf-8")
    quoted_requirement = json.dumps(requirement)
    updated_text, replacements = re.subn(
        r'^dependencies = \[.*\]$',
        f"dependencies = [{quoted_requirement}]",
        pyproject_text,
        count=1,
        flags=re.MULTILINE,
    )
    if replacements != 1:
        raise ValueError("Could not update pyproject.toml dependency list")
    PYPROJECT_PATH.write_text(updated_text, encoding="utf-8")


def _update_dvs_provider_ids(provider_id: str) -> int:
    """Switch active DVS provider IDs in providers.yaml."""
    providers_text = PROVIDERS_PATH.read_text(encoding="utf-8")
    updated_text, replacements = re.subn(
        r'^(  provider_id: )dvsportal(?:_new)?$',
        rf"\1{provider_id}",
        providers_text,
        flags=re.MULTILINE,
    )
    if replacements == 0:
        raise ValueError("Could not find active DVS provider mappings in providers.yaml")
    PROVIDERS_PATH.write_text(updated_text, encoding="utf-8")
    return replacements


def main() -> int:
    """Run the dependency switcher."""
    args = _parse_args()

    if args.mode == "release":
        requirement = args.requirement
        provider_id = DEFAULT_RELEASE_PROVIDER_ID
    elif args.mode == "remote-git":
        requirement = _resolve_remote_git_requirement(args.repo, args.ref)
        provider_id = DEFAULT_LOCAL_PROVIDER_ID
    else:
        requirement = _resolve_local_git_requirement(args.repo, args.ref)
        provider_id = DEFAULT_LOCAL_PROVIDER_ID

    _update_manifest(requirement)
    _update_pyproject(requirement)
    replacements = _update_dvs_provider_ids(provider_id)

    print(f"Updated manifest and pyproject requirement to: {requirement}")
    print(f"Updated {replacements} active DVS provider mapping(s) to: {provider_id}")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (FileNotFoundError, subprocess.CalledProcessError, ValueError) as err:
        print(err, file=sys.stderr)
        raise SystemExit(1) from err
