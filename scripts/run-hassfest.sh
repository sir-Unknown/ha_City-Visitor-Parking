#!/bin/bash
# Wrapper for hassfest that dynamically resolves the homeassistant-core path
# relative to the repo root — works in both multi-repo and standalone devcontainers.
set -e

REPO_ROOT="$(git rev-parse --show-toplevel)"
HA_CORE="$(realpath "$REPO_ROOT/../homeassistant-core")"

exec env PYTHONPATH="$HA_CORE" python "$@"
