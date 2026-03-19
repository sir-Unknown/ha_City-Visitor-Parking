#!/usr/bin/env bash
# Wrapper for hassfest that runs through the shared Python tool launcher.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
exec "$REPO_ROOT/scripts/run-python-tool.sh" script.hassfest "$@"
