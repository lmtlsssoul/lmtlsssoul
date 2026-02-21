#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <agent_id> [base_ref]"
  echo "Example: $0 compiler-agent main"
  exit 1
fi

AGENT_ID="$1"
BASE_REF="${2:-main}"

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ ! "$AGENT_ID" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "agent_id may only contain letters, digits, dot, underscore, or dash"
  exit 1
fi

WORKTREE_ROOT="${ROOT}/.worktrees"
WORKTREE_PATH="${WORKTREE_ROOT}/${AGENT_ID}"
BRANCH="agent/${AGENT_ID}"

mkdir -p "$WORKTREE_ROOT"

if git worktree list --porcelain | rg -n "^worktree ${WORKTREE_PATH}$" >/dev/null 2>&1; then
  echo "Worktree already exists: ${WORKTREE_PATH}"
else
  if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    git worktree add "$WORKTREE_PATH" "$BRANCH"
  else
    git worktree add -b "$BRANCH" "$WORKTREE_PATH" "$BASE_REF"
  fi
fi

cat <<OUT
Prepared agent worktree.
- branch: ${BRANCH}
- path:   ${WORKTREE_PATH}

Next:
1) cd "${WORKTREE_PATH}"
2) pnpm install
3) bash scripts/agents/vision-gate.sh --refresh-and-verify
4) bash scripts/agents/run-gates.sh
OUT
