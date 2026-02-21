#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree must be clean before ship-check."
  exit 1
fi

bash scripts/agents/run-gates.sh

TMP_DIR="/tmp/lmtlss-ship-check"
mkdir -p "$TMP_DIR"
OUT_FILE="${TMP_DIR}/pack.out"
pnpm pack --pack-destination "$TMP_DIR" > "$OUT_FILE"

if ! rg -q "terminalart/art\.9\.py" "$OUT_FILE"; then
  echo "Packed tarball missing terminalart/art.9.py"
  exit 1
fi

if ! rg -q "terminalart/assets/verified_sigils/index\.json" "$OUT_FILE"; then
  echo "Packed tarball missing verified sigil index"
  exit 1
fi

echo "Ship-check passed."
