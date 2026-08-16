# OpenKai Program — Progress Ledger

**Program:** OpenKai v1 — standalone open-source agent harness + TUI with Cortex memory and fusion
**Product ADR:** `research/2026-08-14-openkai-harness-tui-ADR.md` (ratified 2026-08-14, D1–D5)
**Ledger owner:** kai@openkai (lead) · PM hygiene: beat@openkai
**Updated:** 2026-08-16

---

## Release plan

| Sprint | Window | Contents | Exit | Status |
|---|---|---|---|---|
| S1 | 2026-08-15 | Inc 01 (P1 scaffold), Inc 02 (P2 agent loop) | Cortex client + single-lane loop live, sessions in Cortex | **DONE** |
| S2 | 2026-08-15 → 08-16 | Inc 03 (P4a TUI shell), Inc 04 (P3 fusion core) | TUI runs the loop; fusion panel+synthesis+gate offline-proven | **ACTIVE** |
| S3 | 2026-08-17 | Inc 05 (P4b TUI ergonomics) | Permission engine, undo, attention, identity in TUI | **DONE** (landed early, 08-15) |
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
| 05 | P4b TUI ergonomics wave | bob (permission engine), kai (undo) | done | permission engine + protocol v2 (`eed8574`, accepted `d812fd3d`); shadow-git undo (`9107416`); remainder (attention, identity, palette, stash/frecency, /btw, /undo surface) landed on main by fast-forward at `7f04ef1` (+ `30f6f18`); CPO review ACCEPT (ren, handback `1648b734`); 62/62 tests, palette-frame evidence |
| 06 | P3b fusion telemetry + invocation policy | kai | done | `ae1f71d`; 34/34 tests; CLI smoke green |
| 07 | P5 learning loops (decay, mining, bandit) | kai | partial | bandit routing (`382c430`); decay SQL + mining jobs are KOS-side — post-v0.01.001, not standalone-release blockers |
| 08 | P6 v1 packaging + release | kai | release candidate — **publish BLOCKED on the security gate** | LICENSE, metadata, binaries, info, auto-upgrade, docs all landed; clean-machine install verified (`npm install` from tarballs → working CLI); publish gated on F4 + F6b closure (see Security gate status) *and* CTO go |

Increment files: `Release_v0.1.0/E001_OPENKAI_V1/INCREMENTS/`.

## Standing risks (from ADR §7 + CPO amendments)

1. Upstream pi namespace churn — mitigated: exact pins + lockfile.
2. Scope flood (more patterns than v1 holds) — mitigated: ADR do-NOT list + P4b backlog discipline.
3. ren A2: any v2 protocol change (approval channel) goes through CPO review BEFORE implementation.
4. Worker return-report discipline (tests/artifacts/followups mandatory) — enforced at review.
5. **Fabrication risk (learned 2026-08-16):** quill (docs) and cole (first security review) both fabricated returns; the amended admissibility rule (new + relevant + executing reproducers) is what changed lane behaviour. Treat any evidence-free claim as rework on sight.

## Security gate status

**REOPENED — REWORK at `10fe7f5` (2026-08-16). The earlier "CLEARED" verdict is superseded and was stale for one commit.** The clearance below was real for the findings it named, but cole's third pass (`10fe7f5`, tip at review) completed the §2.1 outcome table across all 24 attack classes and filed **six new LIVE findings — 2 HIGH + 4 MEDIUM — each with an executed reproducer on disk**:

| Finding | Sev | Class | Reproducer |
|---|---|---|---|
| F4 | HIGH | protected name as a *directory* component (`.env/production`) escapes the deny floor → silent secret read | `REPRO 4` |
| F6b | HIGH | `PermissionOverlay` renders model-supplied escapes verbatim → the consent surface itself is spoofable | `REPRO 8` |
| F5 | MED | `edit_file` pre-gate read = content oracle over floor files | `REPRO 5` |
| F5b | MED | same oracle, outside cwd | `REPRO 5b` |
| F6c | MED | sanitiser residue: `tool_call` name/args + `/btw` header | `REPRO 9` |
| F9 | MED (latent) | fusion `approveGate` is fail-open (`checks && approveGate`) → model-authored shell with inherited env | `fusion.test.ts: REPRO 9 (fusion)` |
| F7 | MED | sessions store secrets verbatim, world-readable | `REPRO 7` |

Attack class #24 (fusion panel/synthesis prompt injection) is **NOT ATTACKED** — the surface landed in `a41c76b` mid-review.

Re-verified by kai this beat rather than read: all reproducers exist at the stated paths in `packages/cli/test/security-repro.test.ts` and `packages/cli/test/fusion.test.ts`, and the suite runs **105/105 green** at `10fe7f5` (LIVE reproducers pass *because* they assert the current vulnerable behaviour — they invert on fix).

Per SECURITY.md §2, acceptance waits on critical/high closure, so **Inc 08 publish is blocked** until F4 + F6b close and cole's pass 4 certifies. Superseded record: findings `eba8cb9` (3 exploited classes) fixed at `09b56ce`/`3f89a45`; ANSI/OSC injection + gate consent fixed at `1d46b35`; that pass accepted `d05ce2c8` at 102/102.
