#!/usr/bin/env bash
set -euo pipefail

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree is not clean. Commit or stash changes before running release gates."
  exit 1
fi

if ! git remote get-url release >/dev/null 2>&1; then
  echo "Missing release remote. Configure release before publishing."
  exit 1
fi

echo "Running release gates..."
pnpm run typecheck
pnpm run test
pnpm run build

PUSH_URL="$(git remote get-url --push release)"

if [[ "$PUSH_URL" == "DISABLED" ]]; then
  cat <<'EOF'
Release push is currently disabled on purpose.

When final ship is approved:
1) Re-enable release push URL:
   git remote set-url --push release https://github.com/lmtlsssoul/lmtlsssoul.git
2) Publish:
   RELEASE_ACK=I_UNDERSTAND_RELEASE_IS_FINAL pnpm run release:ready -- --publish
EOF
  exit 0
fi

if [[ "${1:-}" != "--publish" ]]; then
  echo "Release gates passed (dry run)."
  echo "To publish now:"
  echo "  RELEASE_ACK=I_UNDERSTAND_RELEASE_IS_FINAL pnpm run release:ready -- --publish"
  exit 0
fi

if [[ "${RELEASE_ACK:-}" != "I_UNDERSTAND_RELEASE_IS_FINAL" ]]; then
  echo "Missing release acknowledgment token."
  exit 1
fi

git push release main --follow-tags
echo "Published main and tags to release."
