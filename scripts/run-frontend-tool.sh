#!/usr/bin/env bash
# Ensure frontend dependencies are available, then run the requested Yarn script.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
FRONTEND_DIR="$REPO_ROOT/custom_components/city_visitor_parking/frontend"
FRONTEND_CMD="${1:-}"

if [[ -z "$FRONTEND_CMD" ]]; then
  echo "Usage: scripts/run-frontend-tool.sh <yarn-script> [args...]" >&2
  exit 2
fi
shift

if ! command -v yarn >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
  fi
fi

if ! command -v yarn >/dev/null 2>&1; then
  echo "yarn is not available. Install Node.js/Corepack first." >&2
  exit 127
fi

# Yarn Berry installs are represented by .pnp.cjs. Bootstrap once when missing.
if [[ ! -f "$FRONTEND_DIR/.pnp.cjs" ]]; then
  yarn --cwd "$FRONTEND_DIR" install --immutable
fi

exec yarn --cwd "$FRONTEND_DIR" "$FRONTEND_CMD" "$@"
