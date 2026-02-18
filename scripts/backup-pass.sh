#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--" ]]; then
  shift
fi

STEP="${1:-${STEP:-manual}}"
STEP="${STEP// /_}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before backup."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Missing origin remote. Configure a backup remote first."
  exit 1
fi

pnpm run typecheck
pnpm run test
pnpm run build

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TAG="step-${STEP}-${STAMP}"

git tag -a "$TAG" -m "Green pass backup for step ${STEP} at ${STAMP}"
git push origin main
git push origin "$TAG"

echo "Backed up main and created tag ${TAG} on origin."
