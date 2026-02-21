# Multi-Agent Compile/Ship Rails

This repository supports concurrent implementation by multiple agents with isolated worktrees and deterministic gates.

For Gemini handoff, use `gemini.md` in repo root.

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
1. whitepaper consultation gate (`../whitepaper.pdf`, canonical local source)
2. terminal art lock integrity (`terminalart/ART_LOCK.sha256`)
3. `pnpm run typecheck`
4. `pnpm run test`
5. `pnpm run build`

Manual whitepaper check:

```bash
pnpm run agents:vision-gate
```

## 2.5) Read-only debug rail (Gemini)

```bash
pnpm run agents:read-only-debug
```

This enforces:
1. repository state snapshot pre-check
2. whitepaper consultation gate
3. terminal art lock integrity
4. no-emit typecheck
5. repository state equality post-check

## 2.6) Deep audit rail (Gemini 3.1 Pro, read-only)

```bash
pnpm run agents:deep-audit-readonly
```

Primary references:
1. `/home/eebee/lmtlss_soul/lmtlss_soul/gemini.md`
2. `/home/eebee/lmtlss_soul/lmtlss_soul/scripts/agents/deep-audit-readonly.sh`
3. `/home/eebee/lmtlss_soul/report.md`

This enforces:
1. whitepaper consultation gate
2. terminal art lock integrity
3. typecheck
4. tests
5. build
6. unchanged git status before/after

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
