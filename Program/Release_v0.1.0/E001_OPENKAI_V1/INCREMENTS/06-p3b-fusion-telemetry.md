# Inc 06 — P3b fusion telemetry + invocation policy

**Status:** PLANNED · **Owner:** unassigned · **Sprint:** S4 · **Depends:** Inc 04

**Goal:** Fusion is measured and selectively invoked — never default, never judgement-delegating.
**Deliverable:** FU-5 telemetry store (every fusion run = controlled A/B: same task, per-role model/latency/tokens/cost/gate outcome; queryable via CLI report); FU-4 deterministic invocation policy (config-first: handoff priority, task class, files breadth — no model call on the dispatch path); head-to-head comparison report (`openkai fusion report`).
**Acceptance:** telemetry row per fusion run persisted (Cortex artifact when attached, local otherwise); policy unit tests; report renders from real rows.
**References:** E016 FU-4/FU-5; ADR OK-6 upgrades (bandit routing is Inc 07).
