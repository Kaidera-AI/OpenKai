# Inc 07 — P5 learning loops

**Status:** PLANNED · **Owner:** unassigned · **Sprint:** S5 · **Depends:** Inc 06

**Goal:** Cortex learns from OpenKai trajectories — the memory moat compounds.
**Deliverable:** temporal-decay + coherence-gated scoring (RuVector ADR-211 as SQL over pgvector: `score = cos × exp(-λ·age) × gate`); trajectory mining on the SONA loop schedule (per-request / hourly pattern extraction / weekly consolidation) as Cortex jobs; semantic tool-result cache (cos ≥ 0.85, TTL, LRU); Beta-bandit model routing with per-complexity-bucket priors over FU-5 telemetry (FU-4 upgrade, ruflo ADR-142).
**Acceptance:** decay affects search ranking measurably; mining job emits pattern rows from real sessions; cache hit-rate reported; bandit converges on synthetic telemetry fixture.
**References:** ADR OK-4; ruvector/ruvllm findings; E015 KL-2. Invariant: retrieval never mutates learned state — only gated outcomes do.

**Security:** E001 gate applies — `scripts/security-audit.sh` green + cole Strix-pattern review of the new surface (SECURITY.md).
