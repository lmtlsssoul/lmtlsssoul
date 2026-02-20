# Gemini 3.1 Pro Deep Audit (Read-Only)

## Paths
1. Repo Root: `/home/eebee/lmtlss_soul/lmtlss_soul`
2. Audit Rail: `/home/eebee/lmtlss_soul/lmtlss_soul/scripts/agents/deep-audit-readonly.sh`
3. Report File: `/home/eebee/lmtlss_soul/report.md`
4. Art Lock File: `/home/eebee/lmtlss_soul/lmtlss_soul/terminalart/ART_LOCK.sha256`

## Mission
Run a full deep audit in read-only mode and write findings into `/home/eebee/lmtlss_soul/report.md`.

## Hard Constraints
1. Do not edit repository files.
2. Do not run git write actions (`commit`, `rebase`, `merge`, `reset`, `clean`, `stash`).
3. Keep findings evidence-based with exact file paths and reproducible commands.
4. Refer to the human only as Author.

## Entry Commands
1. `cd /home/eebee/lmtlss_soul/lmtlss_soul`
2. `git status --short`
3. `pnpm run agents:deep-audit-readonly`
4. `bash scripts/agents/verify-art-lock.sh`

## Required Audit Scope
1. Protocol flow and invariants in `src/soul/`, `src/agents/`, `src/gateway/`.
2. Substrate adapters in `src/substrate/`.
3. Treasury policy and spend controls in `src/treasury/` and `src/cli/treasury.ts`.
4. Ship rails in `scripts/agents/`, `docs/MULTI_AGENT_SHIP.md`, and package scripts.
5. Terminal art packaging and lock integrity in `terminalart/` and `package.json`.

## Report Format
1. Severity: `critical`, `high`, `medium`, `low`
2. Finding title
3. Evidence:
   - command
   - output summary
   - impacted path(s)
4. Minimal fix recommendation (no edits)
5. Residual risk

## Exit Criteria
1. `pnpm run agents:deep-audit-readonly` passes.
2. Art lock verification passes.
3. Working tree state is unchanged pre/post audit.
