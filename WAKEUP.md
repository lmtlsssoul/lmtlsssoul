# Wake-Up Handoff (2026-02-18)

This file is a fast recovery snapshot for any new chat or new agent session.

## Canonical Paths

- Workspace root: `/home/eebee/lmtlss_soul`
- Git repo: `/home/eebee/lmtlss_soul/lmtlss_soul`
- Design authority: `/home/eebee/lmtlss_soul/whitepaper.pdf`

## Current Operational Snapshot

- Current commit: `ddb3641`
- Branch: `main`
- Working tree status at handoff: clean
- Last completed roadmap milestone: `3.06`
- Next roadmap milestone: `3.07` (`src/agents/dialogue.ts`)

## Git Remotes and Publish Rail

- `origin` (private backup): `https://github.com/lmtlsssoul/lmtlss-soul-backup.git`
- `release` (public release): fetch enabled, push URL intentionally set to `DISABLED`
- Policy: publish to `release` only when final ship is complete, tested, and explicitly approved

## Verified Commands

Run from `lmtlss_soul/`:

```bash
pnpm run typecheck
pnpm run test
pnpm run build
pnpm soul --help
pnpm run release:ready
pnpm run backup:pass -- <step>
```

## Known Behavior

- `pnpm soul ...` is now the canonical CLI route (wired through `soul.mjs`).
- `soul gateway ...` host flag is `-H` (not `-h`).
- `lint` currently maps to `typecheck`.
- `format` and `format:fix` are placeholders until formatter tooling is introduced.
- Birth flow naming is canonicalized as `Birth Portal` and `Soul Birth`.

## Network Caveat

If GitHub commands fail with `Could not resolve host: github.com` inside sandbox, rerun with escalated permissions.

## Resume Procedure (Next Chat)

1. Read `/home/eebee/lmtlss_soul/STATUS.md`
2. Read `/home/eebee/lmtlss_soul/ROADMAP.md`
3. Read `/home/eebee/lmtlss_soul/lmtlss_soul/WAKEUP.md`
4. Implement milestone `3.07` only
5. Run green gates
6. Stamp backup: `pnpm run backup:pass -- 3.07`
