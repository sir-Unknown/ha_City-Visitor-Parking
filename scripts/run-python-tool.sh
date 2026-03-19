#!/usr/bin/env bash
# Run Python-based tools through a predictable interpreter so pre-commit can
# execute checks consistently in local/devcontainer setups.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HA_CORE_DIR="${HA_CORE_DIR:-$REPO_ROOT/../homeassistant-core}"
HA_VENV_PY="${HA_VENV_PY:-$HA_CORE_DIR/venv/bin/python}"

if [[ -x "$HA_VENV_PY" ]]; then
  PYTHON_BIN="$HA_VENV_PY"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python)"
elif command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="$(command -v python3)"
else
  echo "No Python interpreter found. Install Python or configure HA_VENV_PY." >&2
  exit 127
fi

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
