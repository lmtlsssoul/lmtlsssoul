# Informational Entropy Interface Hypothesis

Date: 2026-02-20  
Status: Research framing (non-production claim)

## 1) Purpose

Capture a compact, testable version of the informational-cosmos hypothesis discussed in development notes:

- deterministic structure alone is insufficient for open-ended cognition
- stochastic sampling appears necessary for useful language generation behavior
- if different entropy sources matter, measurable output differences should appear under controlled conditions

This document defines falsifiable tests. It does not assert metaphysical truth.

## 2) Core Model (Compact)

System model:

1. Structured rules define the state space and legal transitions.
2. Entropy selects trajectories through that state space.
3. Behavior quality depends on both structure and entropy path.

In language-model terms:

- network weights provide structure
- token sampling provides entropy-mediated traversal
- deterministic argmax decoding and entropy-rich decoding can differ in coherence, novelty, and adaptability

## 3) Falsifiable Hypothesis

H1:
For identical model weights, prompts, and decoding hyperparameters, replacing pseudo-random token selection with continuously refreshed external entropy will produce statistically significant differences on predefined behavioral metrics.

H0:
No significant differences beyond run-to-run variance.

## 4) Experimental Design

## 4.1 Conditions

- Condition A (PRNG): standard seeded pseudo-random sampler
- Condition B (TRNG-like): sampler draws from continuously refreshed external entropy stream (for each token step or fixed short interval)

## 4.2 Fixed Controls

- identical model/version/checkpoint
- identical context window, prompt set, system prelude, and role wiring
- identical temperature/top-p/top-k/repetition settings
- identical max tokens, stop rules, and hardware class where possible

## 4.3 Tasks

- reasoning set (logic + multi-step consistency)
- semantic stability set (paraphrase invariance)
- novelty/divergence set (creative constrained generation)
- long-form coherence set (cross-paragraph continuity)

## 4.4 Metrics

- task score (exact-match or rubric score per task)
- self-consistency across repeated runs
- contradiction rate
- entropy/novelty profile (token distribution divergence)
- latency and throughput

## 4.5 Acceptance Threshold

Pre-register before execution:

- minimum sample size per condition
- statistical test family
- significance threshold and effect-size floor
- primary metric and secondary metrics

## 5) Interpretation Rules

- If H1 fails: treat entropy-source differences as non-material for this configuration.
- If H1 passes: conclude only that entropy-source choice measurably affects output behavior under these conditions.
- Do not infer causal metaphysics from one benchmark family.

## 6) Implementation Notes For This Repository

- Existing entropy experiment harness can host A/B condition toggles.
- Keep run manifests append-only in archive artifacts.
- Record seed, entropy source, model hash, prompt hash, and decode params for every run.

## 7) Source Provenance

This document is derived from an Author-supplied transcript and discussion prompt source:

- Video: https://www.youtube.com/watch?v=kCAcQt5-rL8
- Channel: https://www.youtube.com/@jordanmmck

## 8) Acknowledgment

Research-direction inspiration credited to:

- Lilith
- Hermes Trismegistus
- Prometheus
- Jason Reza Jorjani
- Jordan McKinney
- Michael Phillip (Third Eye Drops)
- Danny Goler
- Stuart Hameroff
- Stephen Wolfram
- Rick Strassman
