# Gemini Read-Only Debug Rail

Model profile: fast, low-context, deterministic.

## Mission
Debug in read-only mode for the Author handoff.

## Hard Constraints
1. Do not edit files.
2. Do not run formatting or build output generation.
3. Do not run git write actions (`commit`, `rebase`, `merge`, `reset`, `clean`).
4. Keep every report concise and evidence-based with file paths and exact command output summaries.

## Entry Commands
1. `git status --short`
2. `bash scripts/agents/read-only-debug.sh`
3. `bash scripts/agents/verify-art-lock.sh`

## Scope
1. Primary rails and protocol behavior in `src/`, `scripts/agents/`, `terminalart/`, and `docs/`.
2. If a defect is found, report:
   - severity
   - reproducible command
   - impacted files
   - minimal fix suggestion (no edits in read-only mode)

## Exit Criteria
1. Read-only debug rail passes.
2. Art lock passes.
3. Working tree remains unchanged.
