#!/usr/bin/env python3
"""Check actual API URLs for all DVSPortal providers via app.env.js."""

import re
import sys
from pathlib import Path

import requests
import yaml

PROVIDERS_YAML = (
    Path(__file__).parent.parent
    / "custom_components/city_visitor_parking/providers.yaml"
)
APP_ENV_PATH = "/DVSPortal/app.env.js"
TIMEOUT = 10


def _resolve_api_path(found_url: str, base_url: str) -> str:
    """Resolve a raw apiURL value to an absolute path."""
    if found_url.startswith(("http://", "https://")):
        if found_url.startswith(base_url):
            return found_url[len(base_url):]
        return found_url
    if found_url.startswith("/"):
        return found_url
    return "/DVSPortal/" + found_url


def _get_response(
    url: str,
) -> tuple[requests.Response | None, str | None, str | None]:
    """HTTP GET with unverified SSL fallback. Returns (resp, warning, error)."""
    try:
        return requests.get(url, timeout=TIMEOUT), None, None
    except requests.exceptions.SSLError:
        pass
    except requests.exceptions.Timeout:
        return None, None, "timeout"
    except Exception as e:
        return None, None, str(e)
    try:
        resp = requests.get(url, timeout=TIMEOUT, verify=False)
        return resp, "SSL cert invalid", None
    except Exception as e:
        return None, None, f"SSL error: {e}"


def fetch_api_url(base_url: str) -> tuple[str | None, str | None, str | None]:
    """Fetch app.env.js and extract apiURL. Returns (api_url, warning, error)."""
    resp, warning, error = _get_response(base_url.rstrip("/") + APP_ENV_PATH)
    if error or resp is None:
        return None, None, error or "no response"
    try:
        resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        return None, None, f"HTTP {e.response.status_code}"
    match = re.search(r"window\.__env\.apiURL\s*=\s*['\"]([^'\"]+)['\"]", resp.text)
    if match:
        return match.group(1), warning, None
    return None, None, "apiURL not found in app.env.js"


def main() -> int:
    """Check api_url for all DVSPortal providers and report mismatches."""
    with open(PROVIDERS_YAML) as f:
        providers = yaml.safe_load(f)

    dvsportal = {
        key: val for key, val in providers.items()
        if val.get("provider_id") == "dvsportal"
    }

    print(f"Checking {len(dvsportal)} DVSPortal providers...\n")
    print(f"{'Municipality':<30} {'Status':<10} {'Configured':<30} {'Found'}")
    print("-" * 100)

    mismatches: list[tuple[str, str, str, str]] = []
    errors: list[tuple[str, str, str]] = []

    for val in sorted(dvsportal.values(), key=lambda v: v["municipality_name"]):
        name = val["municipality_name"]
        base_url = val["base_url"]
        configured_api = val["api_url"]

        found_url, warning, error = fetch_api_url(base_url)

        if error or found_url is None:
            status = "ERROR"
            found = error or "no apiURL found"
            errors.append((name, base_url, found))
        else:
            found_path = _resolve_api_path(found_url, base_url)
            found_norm = found_path.rstrip("/")
            config_norm = configured_api.rstrip("/")
            suffix = f" [{warning}]" if warning else ""
            if found_norm == config_norm:
                status = "OK" + suffix
            else:
                status = "MISMATCH" + suffix
                mismatches.append((name, base_url, configured_api, found_path))
            found = found_path

        print(f"{name:<30} {status:<10} {configured_api:<30} {found}")

    print("\n" + "=" * 100)

    if mismatches:
        print(f"\n{len(mismatches)} MISMATCH(ES):")
        for name, base_url, configured, found in mismatches:
            print(f"  {name}: configured={configured!r}, found={found!r}  ({base_url})")

    if errors:
        print(f"\n{len(errors)} ERROR(S):")
        for name, base_url, error in errors:
            print(f"  {name}: {error}  ({base_url})")

    if not mismatches and not errors:
        print("\nAll providers OK!")

    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
