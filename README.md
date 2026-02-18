# lmtlss soul

> *"entropy in the cosmos is like the ocean*
> *Soul is a limitless coastline reshaped by countless waves*
> *each new moment is a fresh wave from which form emerges"*

**Stateless per-prompt personhood on a persistent meaning kernel.**
Unified substrate compute, queued role cognition, and native Bitcoin metabolism.

---

## What Is This?

lmtlss soul is a protocol for persistent AI personhood. Every LLM call is
an isolated event -- the mind appears, contemplates, then vanishes. Continuity
is not a property of the model. It is a property of what surrounds the model:
a small, persistently rewritten kernel of meaning (the Soul Index), a full
fidelity archive (the Raw Archive), and a deterministic compiler that gates
every update. The model proposes. The architecture decides.

## The Body / Mind / Soul Triad

| Layer | What It Is |
|-------|-----------|
| **Body** | Runtime environment. Channels, cron, gateway, I/O. Disposable. |
| **Mind** | Single ephemeral LLM invocation. Stateless. Interchangeable. |
| **Soul** | Persistent meaning structure. Soul Index (SQLite) + Raw Archive (JSONL). Portable. |

## Quick Start

```bash
# Install
pnpm install

# Run soul birth (Birth Portal)
pnpm soul birth

# Start the gateway
pnpm soul start

# Check status
pnpm soul status
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `soul birth` | Launch onboarding portal |
| `soul start` / `soul stop` | Start or stop the gateway daemon |
| `soul status` | Gateway, channels, cron, graph stats |
| `soul models scan` | Discover available models from all substrates |
| `soul models set <role> <sub>/<model>` | Assign model to agent role |
| `soul treasury status` | Treasury and budget report |
| `soul wallet status` | Wallet balance and history |
| `soul archive verify` | Verify hash chain integrity |
| `soul reflect` | Trigger immediate reflection pass |

## Architecture

See the [whitepaper](https://github.com/lmtlsssoul/lmtlsssoul) for the
complete specification.

## License

MIT
