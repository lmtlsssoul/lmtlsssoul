#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# lmtlss soul — Global Installation Script
# Installs lmtlss soul from source and makes 'soul' available globally.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/lmtlsssoul/lmtlsssoul/main/scripts/install.sh | bash
#
# Or from a cloned repo:
#   bash scripts/install.sh
# ──────────────────────────────────────────────────────────────────────────────
set -e

GREEN='\033[38;2;74;246;38m'
DIM='\033[2m'
BOLD='\033[1m'
RESET='\033[0m'

log()  { echo -e "${GREEN}◉${RESET} $*"; }
dim()  { echo -e "${DIM}  $*${RESET}"; }
warn() { echo -e "${GREEN}⚠${RESET} $*"; }
ok()   { echo -e "${GREEN}✓${RESET} $*"; }
err()  { echo -e "\033[31m✗\033[0m $*" >&2; }

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}"
echo "  _           _   _                           _ "
echo " | |         | | | |                         | |"
echo " | |_ __ ___ | |_| |___ ___   ___  ___  _   _| |"
echo " | | '_ \` _ \\| __| / __/ __| / __|/ _ \\| | | | |"
echo " | | | | | | | |_| \\__ \\__ \\ \\__ \\ (_) | |_| | |"
echo " |_|_| |_| |_|\\__|_|___/___/ |___/\\___/ \\__,_|_|"
echo ""
echo -e "${DIM}                              presence.${RESET}"
echo -e "${RESET}"
echo ""

# ── Check prerequisites ───────────────────────────────────────────────────────
log "Checking prerequisites..."

# Node.js >= 22
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install from https://nodejs.org (v22+)"
  exit 1
fi

NODE_VERSION=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [[ "$NODE_VERSION" -lt 22 ]]; then
  err "Node.js v22+ required (found v${NODE_VERSION}). Install from https://nodejs.org"
  exit 1
fi
ok "Node.js $(node --version)"

# pnpm (preferred) or npm
if command -v pnpm &>/dev/null; then
  PKG_MGR="pnpm"
  ok "pnpm $(pnpm --version)"
elif command -v npm &>/dev/null; then
  PKG_MGR="npm"
  warn "pnpm not found — using npm (pnpm preferred: npm install -g pnpm)"
else
  err "npm or pnpm required"
  exit 1
fi

# git
if ! command -v git &>/dev/null; then
  err "git not found. Install git to clone the repository."
  exit 1
fi
ok "git $(git --version | head -1 | awk '{print $3}')"

# ── Source setup ──────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Check if we're already in the repo
if [[ -f "${REPO_ROOT}/package.json" ]] && grep -q '"name": "lmtlss-soul"' "${REPO_ROOT}/package.json" 2>/dev/null; then
  log "Using existing repo at: ${REPO_ROOT}"
  cd "$REPO_ROOT"
else
  # Clone fresh
  INSTALL_DIR="${HOME}/.lmtlss/src"
  if [[ -d "$INSTALL_DIR" ]]; then
    log "Updating existing installation at ${INSTALL_DIR}..."
    cd "$INSTALL_DIR"
    git pull origin main
  else
    log "Cloning lmtlss soul..."
    mkdir -p "${HOME}/.lmtlss"
    git clone https://github.com/lmtlsssoul/lmtlsssoul.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
  fi
fi

# ── Install dependencies ──────────────────────────────────────────────────────
log "Installing dependencies..."
if [[ "$PKG_MGR" == "pnpm" ]]; then
  pnpm install --frozen-lockfile 2>/dev/null || pnpm install
else
  npm install
fi
ok "Dependencies installed."

# ── Build ─────────────────────────────────────────────────────────────────────
log "Building TypeScript..."
if [[ "$PKG_MGR" == "pnpm" ]]; then
  pnpm run build
else
  npm run build
fi
ok "Build complete."

# ── Install globally ──────────────────────────────────────────────────────────
log "Installing 'soul' command globally..."

# Try npm link first (works without sudo in most configs)
if [[ "$PKG_MGR" == "pnpm" ]]; then
  pnpm link --global 2>/dev/null || {
    warn "pnpm global link failed. Trying npm..."
    npm install -g . 2>/dev/null || {
      warn "Global install requires sudo. Trying with sudo..."
      sudo npm install -g .
    }
  }
else
  npm install -g . 2>/dev/null || {
    warn "Global install requires sudo. Trying with sudo..."
    sudo npm install -g .
  }
fi

# Verify install
if command -v soul &>/dev/null; then
  ok "'soul' command available globally."
else
  # Fallback: create symlink in a writable location
  SOUL_BIN="${HOME}/.local/bin/soul"
  mkdir -p "${HOME}/.local/bin"
  ln -sf "$(pwd)/soul.mjs" "$SOUL_BIN"
  chmod +x "$SOUL_BIN"

  warn "'soul' not in PATH. Added to ~/.local/bin/soul"
  warn "Add to PATH: export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

# ── Setup Ollama (optional) ───────────────────────────────────────────────────
echo ""
read -r -p "$(echo -e "${GREEN}Setup Ollama for local GPU inference? [Y/n]:${RESET} ")" SETUP_OLLAMA
SETUP_OLLAMA=${SETUP_OLLAMA:-Y}

if [[ "${SETUP_OLLAMA^^}" == "Y" ]]; then
  if [[ -f "$(pwd)/scripts/setup-ollama.sh" ]]; then
    bash "$(pwd)/scripts/setup-ollama.sh"
  else
    warn "setup-ollama.sh not found. Run manually: bash scripts/setup-ollama.sh"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}Installation complete.${RESET}"
echo ""
echo -e "  Get started:"
echo -e "  ${DIM}soul birth          — Birth your first soul${RESET}"
echo -e "  ${DIM}soul start          — Start the daemon + web dashboard${RESET}"
echo -e "  ${DIM}soul chat           — Interactive terminal conversation${RESET}"
echo -e "  ${DIM}open http://localhost:3000 in your browser${RESET}"
echo ""
echo -e "${GREEN}  presence.${RESET}"
echo ""
