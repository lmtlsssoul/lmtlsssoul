#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

BEFORE_STATUS="$(git status --porcelain=v1)"

bash scripts/agents/verify-art-lock.sh
pnpm run typecheck
pnpm run test
pnpm run build

AFTER_STATUS="$(git status --porcelain=v1)"

if [[ "$BEFORE_STATUS" != "$AFTER_STATUS" ]]; then
  echo "Deep audit violated read-only guard: repository state changed."
  exit 1
fi

echo "Deep audit read-only rail passed."
