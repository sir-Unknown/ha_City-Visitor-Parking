#!/bin/bash
set -eu

REPO_DIR="/workspaces/ha_City-Visitor-Parking"

# ── Python venv ──────────────────────────────────────────────────
echo "Syncing Python dependencies..."
cd "$REPO_DIR"
uv sync --group dev --group test --group perf

# ── Frontend dependencies ─────────────────────────────────────────
if [ -f "$REPO_DIR/custom_components/city_visitor_parking/frontend/package.json" ]; then
  echo "Installing frontend dependencies..."
  corepack enable
  yarn --cwd "$REPO_DIR/custom_components/city_visitor_parking/frontend" install
fi

# ── Install pre-commit hooks ──────────────────────────────────────
echo "Installing pre-commit hooks..."
uv run pre-commit install

echo ""
echo "Setup complete."
echo ""
echo "Start HA:  hass -c /workspaces/config"
echo "           or via Ctrl+Shift+P → Tasks: Run Task → Start Home Assistant"
echo "HA UI:     http://localhost:8123"
