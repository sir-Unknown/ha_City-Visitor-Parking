#!/bin/bash
set -eu

REPO_DIR="/workspaces/ha_City-Visitor-Parking"

# ── HA config with custom component symlink ───────────────────────
echo "Setting up HA config directory..."
mkdir -p /workspaces/config/custom_components
# Do not dereference an existing symlinked directory target on reruns.
ln -sfn "$REPO_DIR/custom_components/city_visitor_parking" \
  /workspaces/config/custom_components/city_visitor_parking

# ── GitHub CLI auth hint ──────────────────────────────────────────
if ! gh auth status &>/dev/null; then
  echo ""
  echo "⚠  Not logged in to GitHub. Run the 'GitHub: Login' task in VSCode"
  echo "   (Ctrl+Shift+P → Tasks: Run Task → GitHub: Login)"
fi
