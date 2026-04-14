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

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack is not available. Install Node.js first." >&2
  exit 127
fi

# cd into the frontend directory so corepack dispatches to the yarn version
# declared in packageManager (yarn@4.12.0) instead of any globally-installed
# classic yarn (e.g. from nvm).
cd "$FRONTEND_DIR"

# Bootstrap or reinstall when node_modules is missing or lockfile/manifest changed.
if [[ ! -d "node_modules" ]] \
   || [[ "yarn.lock" -nt "node_modules" ]] \
   || [[ "package.json" -nt "node_modules" ]]; then
  corepack yarn install --immutable
fi

exec corepack yarn "$FRONTEND_CMD" "$@"
