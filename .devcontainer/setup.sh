#!/bin/bash
set -eu

REPO_DIR="/workspaces/ha_City-Visitor-Parking"
VENV_DIR="$HOME/.venv"

# ── Python venv ──────────────────────────────────────────────────
echo "Creating Python venv..."
uv venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

echo "Installing Home Assistant and dev tools..."
uv pip install homeassistant pytest-homeassistant-custom-component mypy pyright pre-commit
uv pip install -r "$REPO_DIR/requirements.txt"
uv tool install ruff

# ── HA config with custom component symlink ───────────────────────
echo "Setting up HA config directory..."
mkdir -p /workspaces/config/custom_components
ln -sf "$REPO_DIR/custom_components/city_visitor_parking" \
  /workspaces/config/custom_components/city_visitor_parking

# ── Frontend dependencies ─────────────────────────────────────────
echo "Installing frontend dependencies..."
corepack enable
yarn --cwd "$REPO_DIR/custom_components/city_visitor_parking/frontend" install

# ── Install pre-commit hooks ──────────────────────────────────────
echo "Installing pre-commit hooks..."
pre-commit install

echo ""
echo "Setup complete."
echo ""
echo "Start HA:  hass -c /workspaces/config"
echo "HA UI:     http://localhost:8123"
