# OpenKai capability document — fusion + Switchyard routing (KOS cutover)

**Date:** 2026-08-18 · **Author:** kai@openkai · **Status:** current as of release/0.1.007
**Evidence base:** research/2026-08-18-switchyard-routing-fusion-deep-dive.md,
research/2026-08-18-shift-fusion-orchestration-ADR.md (OK-9).

## What OpenKai ships (capability inventory)

### Fusion core (FU-1…FU-5)
- **FU-1 role-split panel** — architect + builder as separate sessions,
  role-attributed outputs; self-pair default (Self-MoA), cross-pair only for
  near-equal models.
- **FU-2 attributed synthesis** — a third-party synthesiser does pairwise
  comparison; unattributed merges hard-error (AttributionError).
- **FU-3 gate-first validation** — executable gate arbitrates; baseline-must-
  fail-RED; verbatim feedback loop capped; gate errors fail CLOSED on mutations.
- **FU-4 deterministic invocation policy** — no model call on the dispatch
  path; the Beta-bandit (below) only chooses among policy-approved candidates.
- **FU-5 telemetry** — every run is a controlled A/B; redacted local log +
  Cortex artifact export; `openkai fusion report | advise | dashboard`.

### Shift (stage + tier routing, Switchyard pattern)
- **Stage classification** — deterministic config-first (plan/build/review),
  word-boundary keyword scoring + task-class mapping.
- **Tier scorer (OK-9.1)** — Switchyard signal machinery over the tool-result
  window: severity table (SOFT/HARD/CRITICAL), tests-passed settle, spin/explore
  partition, corroborative tanh scorer (one maxed signal ≈0.4621 < 0.5 —
  escalation needs corroboration), hard overrides for critical errors and
  compaction. Every decision carries `source` (override | tests_passed |
  dimensions | fall_open) onto the redacting activity sink.
- **routeWithTier** — composes stage + tier over an (efficient, capable) pair.
- **Fallback chains** — provider-first cross-cast fallback, capped retries,
  budget guard.

### Learned layer (FU-4 bandit, K3 #3)
- Beta posteriors per (complexity-bucket × model); failures on one task type
  never suppress a model globally (hierarchical shrinkage to the global prior).
- Reward = gate outcome from FU-5 telemetry (only gated runs carry a verdict).
- `openkai fusion advise` evaluates the invocation policy for a task shape.

### Multi-modal routing (K3 #2, vision slice)
- `supportsModalities` / `isVisionCapable` / `filterByModality` over the pi-ai
  catalogue `input` field; vision tasks never route to text-only models;
  fail-open to the pool when the filter would empty it. Audio/video/STT/TTS/
  embedding/ranking slot in as the substrate records them.

### Orchestration
- `task` subagent (read-only child transport) with `outputSchema` typed JSON
  steering and `stage` dynamic model selection from the active cast
  (plan→architect, build→builder, review→judge) — K3 #6.
- Chat connectors (Slack/Telegram webhook normalisers) + hub daemon + bridge.

## The composition contract (OK-9.3)

Route when you can predict (shift), cascade when you can verify (gate),
multiply verified attempts (fusion). Gate outcome is the routing reward;
escalation after gate-cap is the cascade move; compaction is the free
tier-switch point.

## What is NOT shipped (parked with reasons)
- Prefill-activation router (arXiv:2603.20895) — needs owning the vLLM serving
  stack; parked per [DD §1].
- LLM capability judge on the hot path — off by default (budget the judge:
  LangChain measured 21.2% of routed spend; break-even = judge/(dear−cheap)).
- Panel size >2 / debate rounds for code — the evidence says they degrade.
