# Multi-Agent Compile/Ship Rails

This repository supports concurrent implementation by multiple agents with isolated worktrees and deterministic gates.

For read-only Gemini debugging, use `gemini.md` in repo root.

## 1) Create an isolated worktree per agent

```bash
bash scripts/agents/prepare-worktree.sh <agent_id> [base_ref]
```

Example:

```bash
bash scripts/agents/prepare-worktree.sh compiler-agent main
```

This creates:
- branch `agent/<agent_id>`
- path `.worktrees/<agent_id>`

## 2) Run deterministic gates in each worktree

```bash
bash scripts/agents/run-gates.sh
```

This enforces:
1. terminal art lock integrity (`terminalart/ART_LOCK.sha256`)
2. `pnpm run typecheck`
3. `pnpm run test`
4. `pnpm run build`

## 2.5) Read-only debug rail (Gemini)

```bash
pnpm run agents:read-only-debug
```

This enforces:
1. clean working tree pre-check
2. terminal art lock integrity
3. no-emit typecheck
4. clean working tree post-check

## 3) Validate ship payload

From a clean tree:

```bash
bash scripts/agents/ship-check.sh
```

This runs gates, packs the tarball, and verifies that terminal art payload files are present.

## 4) Final ship

Use existing release gate:

```bash
pnpm run release:ready
```

For publish, follow the release acknowledgment flow in `scripts/release-ship.sh`.
