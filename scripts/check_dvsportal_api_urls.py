#!/usr/bin/env python3
"""Check DVSPortal API URLs and perform fake login attempts per municipality."""

import argparse
import re
import sys
from ast import literal_eval
from json import dumps
from pathlib import Path
from ssl import SSLError
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    import yaml
except ModuleNotFoundError:
    yaml = None  # pylint: disable=invalid-name

PROVIDERS_YAML = (
    Path(__file__).parent.parent
    / "custom_components/city_visitor_parking/providers.yaml"
)
APP_ENV_PATH = "/DVSPortal/app.env.js"
LOGIN_PATH = "/login"
TIMEOUT = 10
FAKE_USERNAME = "123456"
FAKE_PASSWORD = "1234"
MAX_RESPONSE_CHARS = 240
DEFAULT_OUTPUT_FILE = Path(__file__).with_name("dvsportal_api_url_check_report.md")
HTTP_OK = 200


def _resolve_api_path(found_url: str, base_url: str) -> str:
    """Resolve a raw apiURL value to an absolute path."""
    if found_url.startswith(("http://", "https://")):
        if found_url.startswith(base_url):
            return found_url[len(base_url) :]
        return found_url
    if found_url.startswith("/"):
        return found_url
    return "/DVSPortal/" + found_url


def _parse_yaml_scalar(raw_value: str) -> str:
    """Parse a plain or quoted scalar from providers.yaml."""
    value = raw_value.strip()
    if not value:
        return ""
    if value[0] in {"'", '"'} and value[-1] == value[0]:
        return str(literal_eval(value))
    return value


def load_providers() -> dict[str, dict[str, str]]:
    """Load providers.yaml with PyYAML when available, else fallback parser."""
    if yaml is not None:
        with open(PROVIDERS_YAML, encoding="utf-8") as handle:
            loaded = yaml.safe_load(handle)
            if isinstance(loaded, dict):
                return loaded
            return {}

    providers: dict[str, dict[str, str]] = {}
    current_key: str | None = None
    with open(PROVIDERS_YAML, encoding="utf-8") as handle:
        for line in handle:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue

            if not line.startswith(" "):
                if not stripped.endswith(":"):
                    continue
                current_key = stripped[:-1]
                providers[current_key] = {}
                continue

            if current_key is None or not line.startswith("  "):
                continue
            if ":" not in stripped:
                continue
            field, raw_value = stripped.split(":", 1)
            providers[current_key][field.strip()] = _parse_yaml_scalar(raw_value)

    return providers


def _resolve_api_url(found_url: str, base_url: str) -> str:
    """Resolve apiURL to an absolute URL."""
    if found_url.startswith(("http://", "https://")):
        return found_url.rstrip("/")
    return base_url.rstrip("/") + _resolve_api_path(found_url, base_url).rstrip("/")


def _sanitize_response_text(text: str) -> str:
    """Compact response text for readable logs."""
    compact = " ".join(text.split())
    if len(compact) > MAX_RESPONSE_CHARS:
        return compact[: MAX_RESPONSE_CHARS - 3] + "..."
    return compact


def _sanitize_markdown_cell(value: str) -> str:
    """Escape markdown table separators and normalize whitespace."""
    return " ".join(value.replace("|", "\\|").split())


def _row_sort_key(row: dict[str, str], status_key: str) -> tuple[tuple[int, str], str]:
    """Build a sort key for report rows."""
    if status_key == "api_status":
        sort_key = _api_status_sort_key(row[status_key])
    else:
        sort_key = _http_status_sort_key(row[status_key])
    return sort_key, row["municipality"].lower()


def _build_markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    """Build a markdown table from headers and rows."""
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    lines.extend(
        [
            "| " + " | ".join(_sanitize_markdown_cell(value) for value in row) + " |"
            for row in rows
        ]
    )
    return "\n".join(lines) + "\n"


def _http_status_sort_key(status: str) -> tuple[int, str]:
    """Sort with HTTP 200 last; other HTTP codes first."""
    if status.startswith("HTTP "):
        code = status.removeprefix("HTTP ").strip()
        if code.isdigit():
            status_code = int(code)
            if status_code == HTTP_OK:
                return 2, status
            return 0, f"{status_code:04d}"
    return 1, status


def _api_status_sort_key(status: str) -> tuple[int, str]:
    """Sort API status with issues first and OK last."""
    if status == "ERROR":
        return 0, status
    if status == "MISMATCH":
        return 1, status
    if status == "OK":
        return 2, status
    return 3, status


def _write_report(
    output_path: Path,
    rows: list[dict[str, str]],
    mismatch_count: int,
    error_count: int,
) -> None:
    """Write results to a markdown report file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    api_rows = sorted(rows, key=lambda row: _row_sort_key(row, "api_status"))
    login_rows = sorted(rows, key=lambda row: _row_sort_key(row, "login_status"))

    summary = [
        "# DVSPortal API URL check report",
        "",
        f"- Checked municipalities: {len(rows)}",
        f"- API mismatches: {mismatch_count}",
        f"- API fetch errors: {error_count}",
        (
            "- Fake login credentials: "
            f"username='{FAKE_USERNAME}', password='{FAKE_PASSWORD}'"
        ),
        "",
        "## API status",
        "",
    ]
    api_table = _build_markdown_table(
        ["Municipality", "API Status", "Configured API", "Found API", "Base URL"],
        [
            [
                row["municipality"],
                row["api_status"],
                row["configured_api"],
                row["found_api"],
                row["base_url"],
            ]
            for row in api_rows
        ],
    )
    login_table_header = [
        "",
        "## Login status",
        "",
    ]
    login_table = _build_markdown_table(
        ["Municipality", "Login Status", "Login URL", "Login Response"],
        [
            [
                row["municipality"],
                row["login_status"],
                row["login_url"],
                row["login_response"],
            ]
            for row in login_rows
        ],
    )
    output_path.write_text(
        "\n".join(summary) + api_table + "\n".join(login_table_header) + login_table,
        encoding="utf-8",
    )


def _parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Check DVSPortal api_url values and perform fake logins."
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_FILE),
        help=f"Output markdown file path (default: {DEFAULT_OUTPUT_FILE})",
    )
    return parser.parse_args()


def _handle_network_error(err: URLError | SSLError | TimeoutError) -> str:
    """Normalize network exceptions to a readable message."""
    if isinstance(err, SSLError):
        return "SSL certificate error"
    if isinstance(err, TimeoutError):
        return "timeout"
    reason = getattr(err, "reason", err)
    if isinstance(reason, TimeoutError):
        return "timeout"
    if isinstance(reason, SSLError):
        return "SSL certificate error"
    return str(reason)


def _read_url(url_or_request: str | Request) -> tuple[int, str]:
    """Read an HTTP response body and return the status and decoded text."""
    with urlopen(url_or_request, timeout=TIMEOUT) as resp:
        return resp.status, resp.read().decode("utf-8", errors="replace")


def fetch_api_url(base_url: str) -> tuple[str | None, str | None]:
    """Fetch app.env.js and extract apiURL. Returns (api_url, error)."""
    url = base_url.rstrip("/") + APP_ENV_PATH
    try:
        _, body = _read_url(url)
    except HTTPError as err:
        return None, f"HTTP {err.code}"
    except (SSLError, TimeoutError, URLError) as err:
        return None, _handle_network_error(err)
    except Exception as err:  # pylint: disable=broad-exception-caught
        return None, str(err)
    match = re.search(r"window\.__env\.apiURL\s*=\s*['\"]([^'\"]+)['\"]", body)
    if match:
        return match.group(1), None
    return None, "apiURL not found in app.env.js"


def try_fake_login(api_url: str) -> tuple[str, str, str]:
    """Attempt login with fake credentials and return (status, login_url, response)."""
    login_url = api_url + LOGIN_PATH
    payload = dumps({"Identifier": FAKE_USERNAME, "Password": FAKE_PASSWORD}).encode(
        "utf-8"
    )
    request = Request(
        login_url,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        status_code, response_text = _read_url(request)
    except HTTPError as err:
        response_text = err.read().decode("utf-8", errors="replace")
        return (
            f"HTTP {err.code}",
            login_url,
            _sanitize_response_text(response_text) or "<empty body>",
        )
    except (SSLError, TimeoutError, URLError) as err:
        return "ERROR", login_url, _handle_network_error(err)
    except Exception as err:  # pylint: disable=broad-exception-caught
        return "ERROR", login_url, str(err)

    response_text = _sanitize_response_text(response_text)
    return f"HTTP {status_code}", login_url, response_text or "<empty body>"


def _build_provider_row(
    provider: dict[str, str],
    mismatches: list[tuple[str, str, str, str]],
    errors: list[tuple[str, str, str]],
) -> dict[str, str]:
    """Collect report data for one DVSPortal municipality."""
    name = provider["municipality_name"]
    base_url = provider["base_url"]
    configured_api = provider["api_url"]
    found_url, error = fetch_api_url(base_url)

    if error or found_url is None:
        found = error or "no apiURL found"
        errors.append((name, base_url, found))
        return {
            "municipality": name,
            "base_url": base_url,
            "configured_api": configured_api,
            "found_api": found,
            "api_status": "ERROR",
            "login_status": "SKIPPED",
            "login_url": "-",
            "login_response": "Skipped because api_url could not be resolved",
        }

    found_path = _resolve_api_path(found_url, base_url)
    resolved_api_url = _resolve_api_url(found_url, base_url)
    status = "OK"
    if found_path.rstrip("/") != configured_api.rstrip("/"):
        status = "MISMATCH"
        mismatches.append((name, base_url, configured_api, found_path))
    login_status, login_url, login_response = try_fake_login(resolved_api_url)
    return {
        "municipality": name,
        "base_url": base_url,
        "configured_api": configured_api,
        "found_api": found_path,
        "api_status": status,
        "login_status": login_status,
        "login_url": login_url,
        "login_response": login_response,
    }


def _sorted_rows(
    rows: list[dict[str, str]],
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    """Return rows sorted for API and login sections."""
    api_rows = sorted(rows, key=lambda row: _row_sort_key(row, "api_status"))
    login_rows = sorted(rows, key=lambda row: _row_sort_key(row, "login_status"))
    return api_rows, login_rows


def _print_results(
    api_rows: list[dict[str, str]],
    login_rows: list[dict[str, str]],
    mismatches: list[tuple[str, str, str, str]],
    errors: list[tuple[str, str, str]],
) -> None:
    """Print the collected API and login results."""
    print("API status table:")
    print(f"{'Municipality':<30} {'API Status':<10} {'Configured':<30} {'Found'}")
    print("-" * 100)
    for row in api_rows:
        print(
            f"{row['municipality']:<30} {row['api_status']:<10} "
            f"{row['configured_api']:<30} {row['found_api']}"
        )

    print("\nLogin status table:")
    print(f"{'Municipality':<30} {'Login Status':<12} {'Login URL'}")
    print("-" * 120)
    for row in login_rows:
        print(f"{row['municipality']:<30} {row['login_status']:<12} {row['login_url']}")
        print(f"  response: {row['login_response']}")

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


def main() -> int:
    """Check api_url for all DVSPortal providers and report mismatches."""
    args = _parse_args()
    output_path = Path(args.output).expanduser()
    dvsportal = {
        key: val
        for key, val in load_providers().items()
        if val.get("provider_id") == "dvsportal"
    }

    print(f"Checking {len(dvsportal)} DVSPortal providers...\n")
    print(
        "Fake login credentials used for all checks: "
        f"username={FAKE_USERNAME!r}, password={FAKE_PASSWORD!r}"
    )
    print()

    mismatches: list[tuple[str, str, str, str]] = []
    errors: list[tuple[str, str, str]] = []
    rows = [
        _build_provider_row(provider, mismatches, errors)
        for provider in sorted(dvsportal.values(), key=lambda v: v["municipality_name"])
    ]
    api_rows, login_rows = _sorted_rows(rows)
    _print_results(api_rows, login_rows, mismatches, errors)
    _write_report(
        output_path=output_path,
        rows=rows,
        mismatch_count=len(mismatches),
        error_count=len(errors),
    )
    print(f"\nReport written to: {output_path}")

    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
