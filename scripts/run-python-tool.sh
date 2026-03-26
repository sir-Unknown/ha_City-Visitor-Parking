#!/usr/bin/env bash
# Run Python-based tools through a predictable interpreter so pre-commit can
# execute checks consistently in local/devcontainer setups.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
GIT_COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_REPO_ROOT="$(dirname "$GIT_COMMON_DIR")"
HA_CORE_DIR="${HA_CORE_DIR:-$MAIN_REPO_ROOT/../homeassistant-core}"
HA_VENV_PY="${HA_VENV_PY:-$HA_CORE_DIR/venv/bin/python}"

select_python_bin() {
  local candidate
  local bin

  if [[ -x "$HA_VENV_PY" ]] && "$HA_VENV_PY" -c "import sys; sys.exit(0)" >/dev/null 2>&1; then
    echo "$HA_VENV_PY"
    return 0
  fi

  for candidate in python python3; do
    if ! command -v "$candidate" >/dev/null 2>&1; then
      continue
    fi
    bin="$(command -v "$candidate")"
    if "$bin" -c "import sys; sys.exit(0)" >/dev/null 2>&1; then
      echo "$bin"
      return 0
    fi
  done

  return 1
}

PYTHON_BIN="$(select_python_bin)" || {
  echo "No usable Python interpreter found. Install Python or configure HA_VENV_PY." >&2
  exit 127
}
export PATH="$(dirname "$PYTHON_BIN")${PATH:+:$PATH}"

TOOL_MODULE="${1:-}"
if [[ -z "$TOOL_MODULE" ]]; then
  echo "Usage: scripts/run-python-tool.sh <module> [args...]" >&2
  exit 2
fi
shift

cd "$REPO_ROOT"

if [[ "$TOOL_MODULE" == "script.hassfest" ]]; then
  export PYTHONPATH="$HA_CORE_DIR${PYTHONPATH:+:$PYTHONPATH}"
fi

exec "$PYTHON_BIN" -m "$TOOL_MODULE" "$@"
