#!/bin/bash
set -eu

WORKSPACE="/workspaces"
REPO_DIR="$WORKSPACE/ha_City-Visitor-Parking"
HA_CORE_DIR="$WORKSPACE/homeassistant-core"
VENV_DIR="$HA_CORE_DIR/venv"

# ── System dependencies ──────────────────────────────────────────
echo "Installing system dependencies..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq
sudo apt-get install -y -qq \
  curl \
  ffmpeg \
  git \
  libffi-dev \
  libjpeg-dev \
  liblapack-dev \
  liblapack3 \
  libopenjp2-7 \
  libssl-dev \
  libtiff6 \
  libturbojpeg0-dev \
  node-corepack \
  zlib1g-dev

# Some images do not ship every optional package. Install them separately so a
# single missing package does not hide failures in the required dependency set.
for optional_package in autoconf libatlas-base-dev; do
  if ! sudo apt-get install -y -qq "$optional_package"; then
    echo "Skipping unavailable optional package: $optional_package"
  fi
done

# ── Clone homeassistant-core (shallow) ──────────────────────────
if [ ! -d "$HA_CORE_DIR/.git" ]; then
  echo "Cloning homeassistant-core (shallow)..."
  git clone --depth=1 https://github.com/home-assistant/core.git "$HA_CORE_DIR"
else
  echo "homeassistant-core already present"
fi

# ── uv bootstrap ─────────────────────────────────────────────────
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# ── Python venv ──────────────────────────────────────────────────
PYTHON_VERSION="$(cat "$HA_CORE_DIR/.python-version")"
echo "Installing Python $PYTHON_VERSION..."
uv python install "$PYTHON_VERSION"
uv venv "$VENV_DIR" --python "$PYTHON_VERSION" --clear

source "$VENV_DIR/bin/activate"

echo "Installing homeassistant-core..."
uv pip install -e "$HA_CORE_DIR/"

echo "Installing test and dev tools..."
uv pip install pytest-homeassistant-custom-component mypy pyright pre-commit
uv tool install ruff

# ── Activate venv in shell profiles ──────────────────────────────
for profile in ~/.bashrc ~/.zshrc; do
  if [ -f "$profile" ] && ! grep -q "$VENV_DIR/bin/activate" "$profile"; then
    echo "source $VENV_DIR/bin/activate" >> "$profile"
  fi
done

# ── Frontend dependencies ─────────────────────────────────────────
FRONTEND_DIR="$REPO_DIR/custom_components/city_visitor_parking/frontend"
if [ -f "$FRONTEND_DIR/package.json" ]; then
  echo "Installing frontend dependencies..."
  if ! command -v yarn &>/dev/null; then
    corepack enable
    corepack prepare yarn@stable --activate
  fi
  yarn --cwd "$FRONTEND_DIR" install
fi

# ── Install pre-commit hooks ──────────────────────────────────────
echo "Installing pre-commit hooks..."
cd "$REPO_DIR"
pre-commit install

echo ""
echo "Setup complete."
echo ""
echo "Start HA:  source $VENV_DIR/bin/activate && hass -c /workspaces/config"
echo "HA UI:     http://localhost:8123"
