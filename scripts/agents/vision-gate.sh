#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---refresh}"

ROOT="$(git rev-parse --show-toplevel)"
COMMON_DIR="$(git rev-parse --git-common-dir)"
if [[ "${COMMON_DIR}" != /* ]]; then
  COMMON_DIR="$(cd "${ROOT}/${COMMON_DIR}" && pwd)"
fi
REPO_ROOT="$(cd "${COMMON_DIR}/.." && pwd)"
LOCAL_DIR="$(cd "${REPO_ROOT}/.." && pwd)"
LOCAL_WHITEPAPER="${LOCAL_DIR}/whitepaper.pdf"

STATE_BASE="${LMTLSS_STATE_DIR:-${HOME}/.lmtlss}"
STATE_DIR="${STATE_BASE}/rails"
STATE_FILE="${STATE_DIR}/whitepaper-consulted.json"

MAX_AGE_SECONDS="${WHITEPAPER_CONSULT_MAX_AGE_SECONDS:-21600}" # 6h default freshness window

resolve_whitepaper_path() {
  # Primary source: local workspace whitepaper one directory above repo root.
  if [[ -f "${LOCAL_WHITEPAPER}" ]]; then
    echo "${LOCAL_WHITEPAPER}"
    return
  fi

  echo "Unable to locate local whitepaper.pdf: ${LOCAL_WHITEPAPER}" >&2
  echo "Place the canonical whitepaper at that exact path before running rails." >&2
  exit 1
}

WHITEPAPER_PATH="$(resolve_whitepaper_path)"

json_bool() {
  if [[ "$1" == "1" ]]; then
    echo "true"
  else
    echo "false"
  fi
}

refresh_consultation() {
  if ! command -v gs >/dev/null 2>&1; then
    echo "vision-gate requires Ghostscript (gs) for whitepaper consultation." >&2
    exit 1
  fi

  local tmp_text
  tmp_text="$(mktemp)"
  trap '[[ -n "${tmp_text:-}" ]] && rm -f "${tmp_text}"' EXIT

  # Extract plain text directly from the PDF so consultation is grounded in source.
  gs -q -dNOPAUSE -dBATCH -sDEVICE=txtwrite -sOutputFile="$tmp_text" "$WHITEPAPER_PATH" >/dev/null 2>&1 || true

  if [[ ! -s "$tmp_text" ]]; then
    echo "Whitepaper extraction failed or produced empty output: ${WHITEPAPER_PATH}" >&2
    exit 1
  fi

  local thesis_ok invariants_ok release_ok stateless_ok proposes_ok
  thesis_ok=0
  invariants_ok=0
  release_ok=0
  stateless_ok=0
  proposes_ok=0

  rg -qi "1\.\s*Thesis|Thesis" "$tmp_text" && thesis_ok=1 || true
  rg -qi "Seven System Invariants" "$tmp_text" && invariants_ok=1 || true
  rg -qi "The Release Contract" "$tmp_text" && release_ok=1 || true
  rg -qi "Stateless per prompt" "$tmp_text" && stateless_ok=1 || true
  if rg -qi "model proposes" "$tmp_text" && rg -qi "architecture decides" "$tmp_text"; then
    proposes_ok=1
  fi

  local checksum consulted_at
  checksum="$(sha256sum "$WHITEPAPER_PATH" | awk '{print $1}')"
  consulted_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  mkdir -p "$STATE_DIR"
  cat > "$STATE_FILE" <<EOF
{
  "consultedAt": "${consulted_at}",
  "whitepaperPath": "${WHITEPAPER_PATH}",
  "whitepaperSha256": "${checksum}",
  "checks": {
    "thesis": $(json_bool "$thesis_ok"),
    "sevenSystemInvariants": $(json_bool "$invariants_ok"),
    "releaseContract": $(json_bool "$release_ok"),
    "statelessPerPrompt": $(json_bool "$stateless_ok"),
    "modelProposesArchitectureDecides": $(json_bool "$proposes_ok")
  }
}
EOF

  if [[ "$thesis_ok" != "1" || "$invariants_ok" != "1" || "$release_ok" != "1" || "$stateless_ok" != "1" || "$proposes_ok" != "1" ]]; then
    echo "Whitepaper consultation check failed. Missing required anchors in extracted text." >&2
    echo "State file: ${STATE_FILE}" >&2
    exit 1
  fi

  echo "Vision gate refreshed from ${WHITEPAPER_PATH}."
}

verify_fresh_consultation() {
  if [[ ! -f "$STATE_FILE" ]]; then
    echo "Vision gate state missing: ${STATE_FILE}" >&2
    echo "Run: bash scripts/agents/vision-gate.sh --refresh" >&2
    exit 1
  fi

  local current_checksum
  current_checksum="$(sha256sum "$WHITEPAPER_PATH" | awk '{print $1}')"

  node - <<'NODE' "$STATE_FILE" "$MAX_AGE_SECONDS" "$current_checksum"
const fs = require('node:fs');

const [stateFile, maxAgeSecondsRaw, currentChecksum] = process.argv.slice(2);
const maxAgeSeconds = Number(maxAgeSecondsRaw);
if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
  console.error(`Invalid MAX_AGE_SECONDS: ${maxAgeSecondsRaw}`);
  process.exit(1);
}

let state;
try {
  state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
} catch (err) {
  console.error(`Unable to parse vision gate state: ${stateFile}`);
  process.exit(1);
}

const consultedAt = Date.parse(state.consultedAt ?? '');
if (!Number.isFinite(consultedAt)) {
  console.error('Vision gate state has invalid consultedAt timestamp.');
  process.exit(1);
}

const ageSeconds = Math.floor((Date.now() - consultedAt) / 1000);
if (ageSeconds > maxAgeSeconds) {
  console.error(`Vision gate is stale (${ageSeconds}s old, max ${maxAgeSeconds}s).`);
  process.exit(1);
}

if ((state.whitepaperSha256 ?? '') !== currentChecksum) {
  console.error('Vision gate checksum mismatch. Re-run consultation against current whitepaper.');
  process.exit(1);
}

const checks = state.checks ?? {};
const required = [
  'thesis',
  'sevenSystemInvariants',
  'releaseContract',
  'statelessPerPrompt',
  'modelProposesArchitectureDecides',
];

for (const key of required) {
  if (checks[key] !== true) {
    console.error(`Vision gate check is missing/false: ${key}`);
    process.exit(1);
  }
}

console.log(`Vision gate verified (age=${ageSeconds}s).`);
NODE
}

case "$MODE" in
  --refresh)
    refresh_consultation
    ;;
  --verify-fresh)
    verify_fresh_consultation
    ;;
  --refresh-and-verify)
    refresh_consultation
    verify_fresh_consultation
    ;;
  *)
    echo "Usage: $0 [--refresh|--verify-fresh|--refresh-and-verify]" >&2
    exit 1
    ;;
esac
