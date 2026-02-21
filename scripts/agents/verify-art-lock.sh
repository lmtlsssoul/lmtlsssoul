#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

LOCK_FILE="terminalart/ART_LOCK.sha256"
ART_FILE="terminalart/art.9.py"

if [[ ! -f "$LOCK_FILE" ]]; then
  echo "Missing ${LOCK_FILE}"
  exit 1
fi

if [[ ! -f "$ART_FILE" ]]; then
  echo "Missing ${ART_FILE}"
  exit 1
fi

EXPECTED="$(awk '{print $1}' "$LOCK_FILE")"
ACTUAL="$(sha256sum "$ART_FILE" | awk '{print $1}')"

if [[ "$EXPECTED" != "$ACTUAL" ]]; then
  echo "Art lock mismatch."
  echo "expected: ${EXPECTED}"
  echo "actual:   ${ACTUAL}"
  exit 1
fi

echo "Art lock verified: ${ACTUAL}"
