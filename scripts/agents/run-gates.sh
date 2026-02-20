#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

bash scripts/agents/verify-art-lock.sh
pnpm run typecheck
pnpm run test
pnpm run build

echo "All gates passed."
