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
    yaml = None

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
HTTP_STATUS_OK = 200
DEFAULT_OUTPUT_FILE = Path(__file__).with_name("dvsportal_api_url_check_report.md")


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


def fetch_api_url(base_url: str) -> tuple[str | None, str | None]:
    """Fetch app.env.js and extract apiURL. Returns (api_url, error)."""
    url = base_url.rstrip("/") + APP_ENV_PATH
    body: str | None = None
    error_message: str | None = None
    try:
        body = _read_url_text(url)
    except SSLError:
        error_message = "SSL certificate error"
    except TimeoutError:
        error_message = "timeout"
    except HTTPError as err:
        error_message = f"HTTP {err.code}"
    except URLError as err:
        error_message = _describe_url_error(err)
    except Exception as err:
        error_message = str(err)

    if error_message is not None or body is None:
        return None, error_message or "unknown error"

    match = re.search(r"window\.__env\.apiURL\s*=\s*['\"]([^'\"]+)['\"]", body)
    if match:
        return match.group(1), None
    return None, "apiURL not found in app.env.js"


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


def _build_markdown_table(headers: list[str], rows: list[list[str]]) -> str:
    """Build a markdown table from headers and rows."""
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    lines.extend(_format_markdown_row(row) for row in rows)
    return "\n".join(lines) + "\n"


def _http_status_sort_key(status: str) -> tuple[int, str]:
    """Sort with HTTP 200 last; other HTTP codes first."""
    if status.startswith("HTTP "):
        code = status.removeprefix("HTTP ").strip()
        if code.isdigit():
            status_code = int(code)
            if status_code == HTTP_STATUS_OK:
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


def _format_markdown_row(row: list[str]) -> str:
    """Build a single markdown table row."""
    cells = " | ".join(_sanitize_markdown_cell(value) for value in row)
    return f"| {cells} |"


def _read_url_text(request: str | Request) -> str:
    """Read a URL or request object and return decoded UTF-8 text."""
    with urlopen(request, timeout=TIMEOUT) as response:
        return response.read().decode("utf-8", errors="replace")


def _describe_url_error(error: URLError) -> str:
    """Convert a URLError into a readable status string."""
    reason = getattr(error, "reason", error)
    if isinstance(reason, TimeoutError):
        return "timeout"
    if isinstance(reason, SSLError):
        return "SSL certificate error"
    return str(reason)


def _sort_by_api_status(row: dict[str, str]) -> tuple[tuple[int, str], str]:
    """Sort results by API status and municipality name."""
    return _api_status_sort_key(row["api_status"]), row["municipality"].lower()


def _sort_by_login_status(row: dict[str, str]) -> tuple[tuple[int, str], str]:
    """Sort results by login status and municipality name."""
    return _http_status_sort_key(row["login_status"]), row["municipality"].lower()


def _write_report(
    output_path: Path,
    rows: list[dict[str, str]],
    mismatch_count: int,
    error_count: int,
) -> None:
    """Write results to a markdown report file."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    api_rows = sorted(rows, key=_sort_by_api_status)
    login_rows = sorted(rows, key=_sort_by_login_status)

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


def try_fake_login(api_url: str) -> tuple[str, str, str]:
    """Attempt login with fake credentials and return (status, login_url, response)."""
    login_url = api_url + LOGIN_PATH
    # DVSPortal expects Identifier/Password in the top-level login model.
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
        with urlopen(request, timeout=TIMEOUT) as resp:
            status_code = resp.status
            response_text = resp.read().decode("utf-8", errors="replace")
    except HTTPError as err:
        response_text = err.read().decode("utf-8", errors="replace")
        status = f"HTTP {err.code}"
        response = _sanitize_response_text(response_text) or "<empty body>"
        return status, login_url, response
    except SSLError:
        return "ERROR", login_url, "SSL certificate error"
    except TimeoutError:
        return "ERROR", login_url, "timeout"
    except URLError as err:
        return "ERROR", login_url, _describe_url_error(err)
    except Exception as err:
        return "ERROR", login_url, str(err)

    response_text = _sanitize_response_text(response_text)
    return f"HTTP {status_code}", login_url, response_text or "<empty body>"


def _collect_row(
    provider: dict[str, str],
    mismatches: list[tuple[str, str, str, str]],
    errors: list[tuple[str, str, str]],
) -> dict[str, str]:
    """Collect API and fake login results for one provider."""
    name = provider["municipality_name"]
    base_url = provider["base_url"]
    configured_api = provider["api_url"]
    found_url, error = fetch_api_url(base_url)

    if error or found_url is None:
        errors.append((name, base_url, error or "no apiURL found"))
        return {
            "municipality": name,
            "base_url": base_url,
            "configured_api": configured_api,
            "found_api": error or "no apiURL found",
            "api_status": "ERROR",
            "login_status": "SKIPPED",
            "login_url": "-",
            "login_response": "Skipped because api_url could not be resolved",
        }

    found_path = _resolve_api_path(found_url, base_url)
    resolved_api_url = _resolve_api_url(found_url, base_url)
    if found_path.rstrip("/") == configured_api.rstrip("/"):
        status = "OK"
    else:
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


def _print_api_rows(rows: list[dict[str, str]]) -> None:
    """Print API status rows to stdout."""
    print("API status table:")
    print(f"{'Municipality':<30} {'API Status':<10} {'Configured':<30} {'Found'}")
    print("-" * 100)
    for row in sorted(rows, key=_sort_by_api_status):
        print(
            f"{row['municipality']:<30} {row['api_status']:<10} "
            f"{row['configured_api']:<30} {row['found_api']}"
        )


def _print_login_rows(rows: list[dict[str, str]]) -> None:
    """Print login status rows to stdout."""
    print("\nLogin status table:")
    print(f"{'Municipality':<30} {'Login Status':<12} {'Login URL'}")
    print("-" * 120)
    for row in sorted(rows, key=_sort_by_login_status):
        print(
            f"{row['municipality']:<30} {row['login_status']:<12} "
            f"{row['login_url']}"
        )
        print(f"  response: {row['login_response']}")


def _print_summary(
    mismatches: list[tuple[str, str, str, str]],
    errors: list[tuple[str, str, str]],
) -> None:
    """Print mismatch and error summary to stdout."""
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
    providers = load_providers()
    dvsportal = {
        key: val
        for key, val in providers.items()
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
    rows: list[dict[str, str]] = []

    providers_sorted = sorted(
        dvsportal.values(),
        key=lambda value: value["municipality_name"],
    )
    rows = [
        _collect_row(provider, mismatches, errors) for provider in providers_sorted
    ]

    _print_api_rows(rows)
    _print_login_rows(rows)
    _print_summary(mismatches, errors)

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
