# OpenKai Program — Progress Ledger

**Program:** OpenKai v1 — standalone open-source agent harness + TUI with Cortex memory and fusion
**Product ADR:** `research/2026-08-14-openkai-harness-tui-ADR.md` (ratified 2026-08-14, D1–D5)
**Ledger owner:** kai@openkai (lead) · PM hygiene: beat@openkai
**Updated:** 2026-08-15

---

## Release plan

| Sprint | Window | Contents | Exit | Status |
|---|---|---|---|---|
| S1 | 2026-08-15 | Inc 01 (P1 scaffold), Inc 02 (P2 agent loop) | Cortex client + single-lane loop live, sessions in Cortex | **DONE** |
| S2 | 2026-08-15 → 08-16 | Inc 03 (P4a TUI shell), Inc 04 (P3 fusion core) | TUI runs the loop; fusion panel+synthesis+gate offline-proven | **ACTIVE** |
| S3 | 2026-08-17 | Inc 05 (P4b TUI ergonomics) | Permission engine, undo, attention, identity in TUI | planned |
| S4 | 2026-08-18 | Inc 06 (P3b fusion telemetry + invocation policy) | Fusion measured, selectively invoked | planned |
| S5 | 2026-08-19 | Inc 07 (P5 learning loops), Inc 08 (P6 packaging) | v1 release: npm + binaries + auto-upgrade + docs | planned |

**v1 target: 2026-08-19.** Dates are planning targets, re-baselined at each sprint close by beat.

## Increment status

| # | Increment | Owner | Status | Evidence |
|---|---|---|---|---|
| 01 | P1 scaffold + Cortex client | kai | done | `79a1a99`; handoff `6d70f337` accepted; e2e markers 202370/202374 |
| 02 | P2 agent loop + session persistence | bob | done | `2bbdd45` + `8700a41`; handoff `1d3e0f0c` accepted; ingest proof |
| 03 | P4a TUI shell | bob | done | merge `20fbf5c` (+ review fix `dba681d`); 20/20 tests; handoff `071ef6c5` completed |
| 04 | P3 fusion core (FU-3/FU-1/FU-2) | kai | done | `c832e1c`; 28/28 tests offline-green; decision logged |
| 05 | P4b TUI ergonomics wave | bob (permission engine) | partial | permission engine + protocol v2 landed early (`eed8574` scope, accepted `d812fd3d`); remainder: undo, attention, identity, palette |
| 06 | P3b fusion telemetry + invocation policy | unassigned | planned | depends 04 |
| 07 | P5 learning loops (decay, mining, bandit) | unassigned | planned | depends 06 |
| 08 | P6 v1 packaging + release | unassigned | planned | depends 03+05 |

Increment files: `Release_v0.1.0/E001_OPENKAI_V1/INCREMENTS/`.

## Standing risks (from ADR §7 + CPO amendments)

1. Upstream pi namespace churn — mitigated: exact pins + lockfile.
2. Scope flood (more patterns than v1 holds) — mitigated: ADR do-NOT list + P4b backlog discipline.
3. ren A2: any v2 protocol change (approval channel) goes through CPO review BEFORE implementation.
4. Worker return-report discipline (tests/artifacts/followups mandatory) — enforced at review.
