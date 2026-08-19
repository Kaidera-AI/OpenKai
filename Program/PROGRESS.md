# OpenKai Program — Progress Ledger

**Program:** OpenKai v1 — standalone open-source agent harness + TUI with Cortex memory and fusion
**Product ADR:** `research/2026-08-14-openkai-harness-tui-ADR.md` (ratified 2026-08-14, D1–D5) · OK-9 `research/2026-08-18-shift-fusion-orchestration-ADR.md` (ratification requested 2026-08-18)
**Ledger owner:** kai@openkai (lead) · PM hygiene: beat@openkai
**Updated:** 2026-08-19 (ren@openkai — full inventory + E017 epic)

---

## Release plan

**Last shipped: E017 — v0.1.007 (2026-08-19).** Next: DeepSeek/Cordis plugin-architecture review (ADR parked in main's checkout: `research/2026-08-19-adr-ok9-deepseek-harness-cordis.md`) + OK-10 served-TUI increments 11.1–11.5. **Current epic: E017 — Orchestration Composition (v0.1.007).** Spec: `Program/Release_v0.1.007/E017_ORCHESTRATION_COMPOSITION/EPIC_SPEC.md` (opened 2026-08-19, ren@openkai). Goal: wire the composition the research proves — shift predicts, fusion multiplies, the gate verifies, outcomes teach the router — and make it visible in the TUI. 10 increments (TUI visibility slice → orchestration facade → operator priorities → cascade completion → compaction switch → reward loop → synthesis upgrade → calibration harness → release-key signing → release with adversarial gate).

| Sprint | Window | Contents | Exit | Status |
|---|---|---|---|---|
| S1 | 2026-08-15 | Inc 01 (P1 scaffold), Inc 02 (P2 agent loop) | Cortex client + single-lane loop live, sessions in Cortex | **DONE** |
| S2 | 2026-08-15 → 08-16 | Inc 03 (P4a TUI shell), Inc 04 (P3 fusion core) | TUI runs the loop; fusion panel+synthesis+gate offline-proven | **DONE** |
| S3 | 2026-08-17 | Inc 05 (P4b TUI ergonomics) | Permission engine, undo, attention, identity in TUI | **DONE** (landed early, 08-15) |
| S4 | 2026-08-18 | Inc 06 (P3b fusion telemetry + invocation policy) | Fusion measured, selectively invoked | **DONE** (landed early, `ae1f71d`) |
| S5 | 2026-08-19 | Inc 07 (P5 learning loops), Inc 08 (P6 packaging) | v1 release: npm + binaries + auto-upgrade + docs | **DONE** — superseded by the E002 line below |
| E002 | 2026-08-16 → 08-18 | Fusion-first UX (casts, shift router, welcome, parity, capability mgmt, brand) | v0.1.005 shipped | **DONE** |
| E012–E016 | 2026-08-18 | Adversarial reviews + fixes + research round 2 + release engineering | 0.1.6 on release/0.1.007 | **DONE** (below) |
| E017 | 2026-08-19 → 08-19 | Orchestration composition | v0.1.007 | **SHIPPED** (npm 0.1.7 ×2, signed GitHub release, brew, install.sh; upgrade channel proven end-to-end) |

## 2026-08-18 inventory (ren@openkai — what actually exists)

**Research base (all in `research/`):** round 1 six-findings + ratified ADR; round 1.5 droid bar; round 2 deep dive (34+ sources): what Switchyard is based on (arXiv:2603.20895 prefill router, unshipped; shipped routers are SWE-Bench-Pro-calibrated heuristics), the routing/fusion literature distilled to 10 laws; **OK-9 ADR** (shift/fusion composition + OK-9.7 operator priorities); E015 integration review (S1–S5 landing order); kai's KOS capability document.

**E012 adversarial review (0.1.5 surface) — 55 findings, all fixed** (`dc1aa32`, `b50232d`): hashline gate bypass; upgrade `.env` RCE chain; MCP merge+gate+scrubbed env; persistent OAuth store; session resume; error events; TUI sanitiser gaps; gate liveness (rejectAll, abort, timeouts); deny floor extension; hub/config/upgrade hardening. Pins: `security-repro-e012.test.ts`.

**E013 (CTO):** release-control SOP — no public release without explicit consent; `docs/RELEASE_SOP.md`.

**E014/E015 machinery (kai, on release/0.1.007):** Switchyard tier scorer port; routeWithTier; modality routing; task outputSchema + stage-routed children; connectors + bridge --listen; fusion dashboard; KOS capability doc.

**K3 adversarial review (ren, handoff b27bc40f) — 28 findings, all fixed** (`8089ec1..ea7176a`): bridge retry multiplication + full listener hardening; stage-resolution provider fix; tier-scorer calibration fidelity (5 sub-findings); task lifecycle races; telemetry dashboard + rotation; pins: `k3-e015-repro.test.ts`. 263/263 + audit PASSED.

**E016 (CTO):** signed release channel — SLSA provenance attestations on CI-built binaries; Homebrew trust documented.

**0.1.6 (ren, `fb41138`):** keyless boot contract (TUI never blocks on credentials; sign-in in-shell); single-key provider fallback; catalogue-derived model defaults; credential-store unification across all call sites.

**Composition gap (the reason E017 exists):** the machinery is certified but callerless — routeWithTier has no production caller, the bandit never reads gate outcomes back, compaction never re-evaluates, fusion halt doesn't escalate, and the TUI renders none of it. E017 inc 01–06 close exactly this.

## Historic ledger (E001 line, 2026-08-15/16)

| Sprint | Window | Contents | Exit | Status |
|---|---|---|---|---|
| S1 | 2026-08-15 | Inc 01 (P1 scaffold), Inc 02 (P2 agent loop) | Cortex client + single-lane loop live, sessions in Cortex | **DONE** |
| S2 | 2026-08-15 → 08-16 | Inc 03 (P4a TUI shell), Inc 04 (P3 fusion core) | TUI runs the loop; fusion panel+synthesis+gate offline-proven | **DONE** |
| S3 | 2026-08-17 | Inc 05 (P4b TUI ergonomics) | Permission engine, undo, attention, identity in TUI | **DONE** (landed early, 08-15) |
| S4 | 2026-08-18 | Inc 06 (P3b fusion telemetry + invocation policy) | Fusion measured, selectively invoked | **DONE** (landed early, `ae1f71d`) |
| S5 | 2026-08-19 | Inc 07 (P5 learning loops), Inc 08 (P6 packaging) | v1 release: npm + binaries + auto-upgrade + docs | **ACTIVE** — packaging shipped 08-16 ahead of the security gate; see below |

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
| 08 | P6 v1 packaging + release | kai | **PATCHED — 0.1.2 published 2026-08-16 carrying the certified fix-line** | LICENSE, metadata, binaries, info, auto-upgrade, docs all landed; `v0.01.001` tagged. `@kaidera/openkai@0.1.1` + `@kaidera/openkai-core@0.1.1` went live from `25cf1ef` **without the F4/F6b/F7 fixes**; Homebrew tap + `scripts/install.sh` + binaries (`6087bbc`). The certified fix-line (`8929d12` via `bb1f027`) is merged onto `main`, and **`@kaidera/openkai@0.1.2` + `@kaidera/openkai-core@0.1.2` are published** with the exact core pin moved in lockstep (`0.1.1`→`0.1.2`, or the patched CLI would still have resolved the vulnerable core). Verified by unpacking the tarball **downloaded from the registry**, not the local build: `dist/secrets.js` present, `matchesDenyFloor` walks ancestor prefixes, and `floorDeny` executed against the published dist denies `.env/production` + `server.pem/privkey` while still allowing `src/index.ts`. 0.1.1 left on the registry untouched — deprecation is a human/CTO call. **Standalone binaries + Homebrew still serve `v0.01.001` assets built from the vulnerable line** (open gap) |

Increment files: `Release_v0.1.0/E001_OPENKAI_V1/INCREMENTS/`.

## Standing risks (from ADR §7 + CPO amendments)

0. **Feature regression (learned 2026-08-19):** the brand splash was silently dropped by an unrelated edit (b50232d) and reached the user. Mitigation: `Program/FEATURE_REGISTRY.md` is the living inventory; every feature PR updates it; the release gate walks it. A call-site deletion compiles clean and passes every test — the registry is the check, not the suite.
1. Upstream pi namespace churn — mitigated: exact pins + lockfile.
2. Scope flood (more patterns than v1 holds) — mitigated: ADR do-NOT list + P4b backlog discipline.
3. ren A2: any v2 protocol change (approval channel) goes through CPO review BEFORE implementation.
4. Worker return-report discipline (tests/artifacts/followups mandatory) — enforced at review.
5. **Fabrication risk (learned 2026-08-16):** quill (docs) and cole (first security review) both fabricated returns; the amended admissibility rule (new + relevant + executing reproducers) is what changed lane behaviour. Treat any evidence-free claim as rework on sight.

## Security gate status

**CERTIFIED — cole@openkai pass 4 (2026-08-16), independently re-executed against the merged fix-line after the `f585d39` REOPEN.** Pass 3 (`10fe7f5`) filed six LIVE findings (2 HIGH + 4 MEDIUM); kai fixed all six (`04406b6`) and a seventh, F7b, surfaced by re-review (`9efd246`). The `f585d39` REOPEN correctly reset `main` to REWORK (the fix-line was never merged), and this pass merges it and re-certifies by **executing every reproducer in both directions**, not on report:

| Finding | Sev | Class | Status |
|---|---|---|---|
| F4 | HIGH | protected name as a *directory* component (`.env/production`) escapes the deny floor | **HELD** — `matchesDenyFloor` tests every ancestor prefix (`REPRO 4`) |
| F6b | HIGH | `PermissionOverlay` renders model-supplied escapes → spoofable consent surface | **HELD** — every field sanitised + newline-flattened (`REPRO 8`) |
| F5 / F5b | MED | `edit_file` pre-gate read = content/existence oracle (floor + outside cwd) | **HELD** — `guardPath` precedes any read (`REPRO 5`/`5b`) |
| F6c | MED | sanitiser residue: `tool_call` name/args + `/btw` header | **HELD** — card name + arg keys/values + btw header sanitised (`REPRO 9`) |
| F9 | MED (latent) | fusion `approveGate` fail-open → model-authored shell with inherited env | **HELD** — absent consent = refusal + scrubbed child env (`REPRO 9 (fusion)` + env-scrub) |
| F7 | MED | sessions store secrets verbatim, world-readable | **HELD** — span redaction at the write seam + `0700`/`0600` (`REPRO 7`) |
| F7b | MED (latent) | Cortex `/sessions/ingest` leg of F7 left open | **HELD** — redaction at the wire seam (`REPRO 10`) |
| #24 | — | fusion panel/synthesis prompt injection (role output → synthesiser/validator) | **HELD / NOT-EXPLOITABLE** — validator not reachable, synthesiser attribution enum-locked (`REPRO 13`), render sanitised (`REPRO 11`) |
| F10 | LOW | `list_files` on a `.ssh` *directory* node leaks filenames (content held) | **OPEN, non-blocking** — one-line `DENY_FLOOR` fix routed separately (`REPRO 12`, LIVE) |

Controls re-run this pass in a worktree with `@openkai/core` proved to resolve locally: **Direction A 110/110** + `security-audit.sh` PASSED; **Direction B (source reverted to `10fe7f5`, inverted tests kept) 100/109 — exactly the 9 fix reproducers fail, no tautologies**; render control (sanitiser neutered) fails `REPRO 6/8/9/11`. The three non-blocking hardening followups (`walkGrep` label, `ShadowGit.undo` lexical containment, `grep` model-RegExp) were re-probed and none became blocking. Superseded records: `eba8cb9` (3 exploited classes) fixed at `09b56ce`/`3f89a45`; ANSI/OSC + gate consent at `1d46b35`.

Per SECURITY.md §2, no open critical/high remains, so **Inc 08 is unblocked on the security gate**. kai reviews this certification per §4 (cole certified kai's fixes; kai reviews cole's output).

**Reconciliation addendum (kai, 2026-08-16) — the publish block was not honoured: 0.1.1 was published before the fix-line was merged, and 0.1.2 closes it.** cole's pass 4 certified on a branch (`8929d12`); `main` went on to rename, publish and release without it. Verified against the registry artifact rather than inferred: published `@kaidera/openkai-core@0.1.1` contains **no `dist/secrets.js`** (F7/F7b redaction absent) and its `matchesDenyFloor` is the pre-fix single-pass glob loop, not the ancestor-prefix walk (F4) — **both HIGH findings were live in the shipped 0.1.1**. The fix-line is now merged onto `main` (`bb1f027`, landed at `737bb6d`) so `git merge-base --is-ancestor 8929d12 main` is **true**, and **0.1.2 is published** carrying it. 0.1.1 stays on the registry untouched; deprecation/unpublish is a human/CTO decision and was not taken.

Direction-B control re-run at the release tip by kai (executed, not quoted): reverting the nine fix-mechanism sources to `10fe7f5` **and rebuilding** (the suite loads `../dist`, so a source-only revert is a false-green) gives **101/110 — exactly the nine fix reproducers fail** (REPRO 4, 5, 5b, 7, 8, 9, 9-fusion, 10, gate-env-scrub), no tautologies. Direction A at the same tip: 110/110 + `security-audit.sh` PASSED.

**Correction to an earlier draft of this entry (kai):** a first pass of this reconciliation recorded that F6b was still live at the merged tip, on the strength of the REOPENED finding filed against `c270b36`. That is **wrong for this line** and is retracted. The finding is real in its own lineage, but the certified fix-line closes both fields independently: `permission.ts:81` routes `rule` through `oneLine()` → `sanitizeTerminalText`, and `formatArgs` sanitises the arg **key** as well as the value. Executed at the merged tip, not read: `evaluateWithReason(TERM_PAYLOAD, …)` does return `ask` with the raw payload in the reason (the finding's premise holds), yet the rendered overlay frame contains neither the OSC 52 introducer nor CSI 2J — **F6b is CLOSED here**, and REPRO 9 already carries the arg-KEY case. bob's `81db392` was therefore *not* merged: it is a redundant second fix for the same two defects, not an additional one.

Superseded record: findings `eba8cb9` (3 exploited classes) fixed at `09b56ce`/`3f89a45`; ANSI/OSC injection + gate consent fixed at `1d46b35`; that pass accepted `d05ce2c8` at 102/102.
