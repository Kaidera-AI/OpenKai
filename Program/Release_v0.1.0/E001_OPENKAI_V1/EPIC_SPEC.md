# EPIC SPEC — E001: OpenKai v1 (standalone harness + TUI)

**Epic:** E001_OPENKAI_V1
**Release:** v0.1.0 (first public release)
**Owner:** kai@openkai (lead developer)
**Team:** bob (full-stack, KOS auto lane) · beat (PM) · cole (orchestrator) · quill (knowledge/docs) · ren (CPO, review gate)
**Ratified direction:** `research/2026-08-14-openkai-harness-tui-ADR.md` D1–D5
**Opened:** 2026-08-15

---

## 1. Goal

Ship **OpenKai v1**: a standalone, installable, open-source agent harness + TUI that pairs the pi-lineage commodity substrate (pi-ai providers, pi-tui renderer, pi-agent-core loop) with the one thing no competitor ships — **Cortex durable memory** — plus the first **fusion** slice (E016 FU-3/FU-1/FU-2). Delivered as an npm package + per-platform binaries; KOS consumes it as an auto-upgraded component through the standard lane shape.

**v1 means:** an operator can install OpenKai, launch the TUI, hold a tool-using conversation on any of 30+ providers, resume branchable sessions, have every run checkpoint into Cortex memory when attached (degrade to local-only when not), and invoke a fused two-role run with gate-first validation and an attributed synthesis artifact.

## 2. Non-goals (v1)

Per ADR §5: no forks of omp/pi; no ruflo meta-harness posture; no Cortex storage replacement; no hard Rust/WASM dependency; fusion never default; no sandboxing claims; no performance claim without a reproducer; single-machine scope (no fleets/federation). Subagents/MCP/permissions beyond the v1 permission engine are post-v1.

## 3. Increments

| # | Increment | Goal | Deliverable | Acceptance | Depends |
|---|---|---|---|---|---|
| 01 | P1 scaffold + Cortex client | OpenKai talks to Cortex | `@openkai/core` REST + `/events` SSE bridge (OK-3 hygiene); `openkai events --print` | build/typecheck green; live marker event rendered end-to-end | — |
| 02 | P2 agent loop + session persistence | Single-lane conversation, remembered | `SessionTransport` + `InProcessTransport` (pi-agent-core); JSONL v3 session tree; idempotent `/sessions/ingest` checkpoints; `openkai chat` | live e2e reply; session tree on disk; session uuid in `/sessions/ingested-ids`; lifecycle events on stream | 01 |
| 03 | P4a TUI shell | The TUI exists | pi-tui alt-screen app (transcript/composer/chrome) on the P2 transport; droid token theme; `openkai`/`openkai tui` | golden-frame tests green (faux provider); mode matrix proven; chat/events unregressed | 02 |
| 04 | P3 fusion core | One task, two roles, one honest merge | `packages/core/fusion/`: panel (FU-1 self-pairing, fresh sessions), synthesis with mandatory attribution (FU-2), gate-first validation loop (FU-3 full); fusion run telemetry records (FU-5 shape); `openkai fuse` | offline tests: attribution enforced, RED-baseline enforced, retry cap halts loudly; live fused run artifact | 02 |
| 05 | P4b TUI ergonomics wave | omp-grade feature floor, droid design bar | permission engine (allow/ask/deny + inline diffs; protocol v2 approval channel — ren A2 review first); shadow-git undo; attention notifications; per-agent identity; density polish | permission matrix tests; undo restores tree; CPO sign-off on protocol v2 | 03 |
| 06 | P3b fusion telemetry + invocation | Fusion measured and selective | FU-5 telemetry store (per-role latency/tokens/cost/gate outcome); FU-4 deterministic invocation policy; comparison report command | telemetry rows per fusion run; policy unit tests; no model calls on dispatch path | 04 |
| 07 | P5 learning loops | Cortex learns from trajectories | temporal-decay scoring (SQL port); trajectory mining on SONA schedule; semantic tool-result cache; bandit routing over FU-5 telemetry | decay scores live in search ranking; mining job produces patterns; cache hit-rate measurable | 06 |
| 08 | P6 v1 packaging + release | Anyone can install OpenKai | npm package + per-platform binaries; dual-channel auto-upgrade with rollback + kill-switch; `openkai info` self-check; install docs; KOS lane-driver skeleton (control/use/manage) | clean-machine install runbook; upgrade+rollback exercised; docs walkthrough by quill | 03, 05 |

## 4. Sprints

- **S1 (done 2026-08-15):** Inc 01 + 02. Exit: harness talks to Cortex, holds a remembered conversation.
- **S2 (active, 08-15 → 08-16):** Inc 03 (bob) + Inc 04 (kai). Exit: TUI runs the loop; fusion core offline-proven.
- **S3 (08-17):** Inc 05. Exit: TUI at feature floor with permission engine; protocol v2 signed off by ren.
- **S4 (08-18):** Inc 06. Exit: fusion measured, selectively invoked.
- **S5 (08-19):** Inc 07 + 08. Exit: **v1 released** — npm + binaries + auto-upgrade + docs.

## 5. Standing invariants (every increment)

1. Cortex access only via cortex-api (never direct DB/Redis) — ADR §4.
2. No dependency without evidence; patterns preferred over linkage — ADR §5.
3. Every performance claim ships its reproducer — ADR §5.7.
4. Design tokens are the only colour source in the TUI — OK-5.
5. Commit before dispatch (worker-isolation gate discipline, lesson 2026-08-15).
6. Worker returns carry tests + artifacts + followups — review gate rejects thin returns.
7. Fusion invariants: separate sessions per role; attribution mandatory; builder never grades its own homework; gate baseline must fail RED; halt loudly at the cap — E016 §3.2.
8. CPO amendments A1–A3 (run modes, protocol versioning, retention boundary) constrain every persist/protocol decision.

## 6. Review gates

- **Increment close:** owner returns handoff with evidence → kai verifies against acceptance → merge → work-product receipt.
- **Protocol changes:** ren (CPO) review before implementation (A2).
- **Sprint close:** beat updates `Program/PROGRESS.md`, re-baselines dates, posts the burndown.
- **v1 release gate:** kai + ren joint sign-off; quill docs walkthrough passes on a clean machine.
