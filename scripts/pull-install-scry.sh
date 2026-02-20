#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${SOUL_REPO_URL:-https://github.com/lmtlsssoul/lmtlsssoul.git}"
REPO_REF="${SOUL_REPO_REF:-main}"
INSTALL_DIR="${SOUL_INSTALL_DIR:-$HOME/.lmtlss/src}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_cmd git
require_cmd node

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  echo "Node.js 22+ required (found $(node --version))." >&2
  exit 1
fi

PKG_MGR=""
if command -v pnpm >/dev/null 2>&1; then
  PKG_MGR="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
  corepack prepare pnpm@latest --activate >/dev/null 2>&1 || true
  if command -v pnpm >/dev/null 2>&1; then
    PKG_MGR="pnpm"
  fi
fi

if [[ -z "$PKG_MGR" ]]; then
  if command -v npm >/dev/null 2>&1; then
    npm install -g pnpm >/dev/null 2>&1 || true
  fi
  if command -v pnpm >/dev/null 2>&1; then
    PKG_MGR="pnpm"
  else
    echo "pnpm is required. Install with: npm install -g pnpm" >&2
    exit 1
  fi
fi

if [[ -d "$INSTALL_DIR/.git" ]]; then
  git -C "$INSTALL_DIR" fetch origin "$REPO_REF" --depth=1
  git -C "$INSTALL_DIR" checkout -B "$REPO_REF" "origin/$REPO_REF"
  git -C "$INSTALL_DIR" reset --hard "origin/$REPO_REF"
  git -C "$INSTALL_DIR" clean -fdx
else
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone --depth=1 --branch "$REPO_REF" "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

if [[ "$PKG_MGR" == "pnpm" ]]; then
  pnpm install --frozen-lockfile || pnpm install
  pnpm run build
else
  npm install
  npm run build
fi

# Reattach to the interactive terminal when invoked via `curl | bash`.
# Without this, curses input cannot receive keypresses from stdin.
if [[ -r /dev/tty && -w /dev/tty ]]; then
  exec node soul.mjs birth </dev/tty >/dev/tty 2>/dev/tty
fi

echo "Install complete."
echo "Run manually: node soul.mjs birth"
