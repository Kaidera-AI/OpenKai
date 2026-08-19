# EPIC SPEC — E017: Orchestration Composition (v0.1.007)

**Epic:** E017_ORCHESTRATION_COMPOSITION
**Release:** v0.1.007 (0.1.7 — ships on the release rule: explicit CTO consent, per docs/RELEASE_SOP.md)
**Owner:** kai@openkai (lead) · **TUI lane: ren@openkai (design + implementation + review, CTO directive 2026-08-19 — the TUI is not a split task)** · adversarial gate: ren@openkai (CPO)
**Opened:** 2026-08-19
**Inputs:** OK-9 ADR (`research/2026-08-18-shift-fusion-orchestration-ADR.md`, ratification requested) · ren's integration review (`research/2026-08-18-e015-research-match-integration-review.md`, S1–S5) · the K3-fixed E014/E015 machinery on release/0.1.007 · deep-dive evidence base (`research/2026-08-18-switchyard-routing-fusion-deep-dive.md`)

---

## 1. Goal

Make the orchestration real. 0.1.6 ships the *machinery* (tier scorer, routeWithTier, bandit, telemetry, gate) — correct, K3-certified, and **callerless**. E017 wires the composition the research proves out: **shift predicts, fusion multiplies, the gate verifies, and every outcome teaches the router** (OK-9.3). At release, an operator can watch a task shift tiers and duet a stage *from the TUI*, and the system gets measurably better per run because gate outcomes feed the priors.

The composition law (arXiv:2410.10347): **route when you can predict, cascade when you can verify.** E017 is that sentence, shipped.

## 2. Where we start (inventory truth, 2026-08-19)

**Done and certified:** tier scorer (OK-9.1, K3-fixed); routeWithTier preview seam (per-stage defaults); bandit with per-bucket posteriors; fusion panel/synthesis/gate; telemetry with redaction/rotation; FU-4 policy; modality filter; connectors + hardened bridge; keyless boot; 263/263 + audit green.

**Built but not wired:** routeWithTier has no production caller; the bandit never reads gate outcomes back; compaction never re-evaluates tier; a fusion halt just halts (no cascade retry); the TUI renders nothing of any of it.

**Not started:** tier latch, orchestration facade, posture/pins (OK-9.7), pairwise synthesis prompt, calibration harness, judge break-even meter, release-key signing.

## 3. Increments

| # | Increment | Deliverable | Acceptance |
|---|---|---|---|
| 01 | **TUI visibility slice (S1)** | Tier chip in the status line with transitions logged; fusion runs render role-pilled blocks ([ARCHITECT]/[BUILDER] tokens); gate pass/halt notices; `/shift` ledger command reading the activity feed (OK-9.7 trust surface) | headless frame tests: chip transition on override event; fusion blocks carry role pills; `/shift` lists decisions with sources |
| 02 | **Orchestration facade (S2)** | `packages/core/src/orchestrate.ts`: one entry — stage classify → latched tier (per-stage latch map, stickiness per OK-9.1) → posture-aware default → FU-4 panel/single → gate → reward writeback. `fuse`, `task`, and the session transport migrate; routeWithTier becomes an internal preview | all consumers on the facade; ShiftRouter budget/fallback retained; tier latch unit-tested (no flap under noise) |
| 03 | **Operator priorities (OK-9.7 / W8)** | `shift.posture` (quality/balanced/saver) in config + `/settings`; floor/ceiling pins + denylists; precedence per ADR | posture changes the fall-open tier live; pins beat bandit; ceiling pin suppresses overrides (documented) |
| 04 | **Cascade completion (S4 + OK-9.3 rule 2)** | fusion halt at cap → facade escalates the stage one tier → one retry; escalation recorded on the feed | a halted run retries at the next tier exactly once, labelled |
| 05 | **Compaction switch point (S3)** | auto-compact (80% ctx) triggers facade tier re-evaluation — the Devin free-switch boundary | a compaction event with fresh signals can flip the tier; test with scripted signals |
| 06 | **Reward loop closure (OK-9 W5)** | gate outcomes update bandit posteriors per (stage × bucket); priors feed facade tier defaults; `fusion advise` reflects learned state | a scripted pass/fail sequence shifts the prior measurably; report shows it |
| 07 | **Synthesis upgrade (OK-9 W4)** | pairwise-comparison synthesis contract (compare-then-compose), strongest-model resolution, parse-failure keeps both outputs + flags | synthesis prompt asks for comparison; failure posture tested |
| 08 | **Calibration harness (OK-9 W6/W7)** | quadrant runner (RESCUE/LOSS/SAFE/HARD over ~60–95 instrumented runs), threshold sweep, CPT/APGR report, judge break-even meter on the feed | `openkai fusion calibrate` produces the quadrant table + recommended threshold; records in research/calibration/ |
| 09 | **Release-key signing** | Ed25519 keypair generated (CTO custody); `OPENKAI_RELEASE_KEY` pinned at build; manifests signed; `<asset>.sha256` sidecars published | unsigned/tampered manifest refused by a pinned build; install.sh verifies sidecar |
| 10 | **v0.1.007 release** | version bump (0.1.7 lockstep + core pin), CHANGELOG, K3-style adversarial gate on the epic diff, **feature-registry audit** (Program/FEATURE_REGISTRY.md — every ✅/🔁 row verified against the build, evidence in the release notes), binaries, brew, npm | full channel verification; adversarial return accepted; registry audit recorded |
| 11 | **Served TUI (OK-10)** | `openkai serve` hosts the TUI against a headless terminal and streams frames over a token-gated WS attach channel (read-only watch + read-write attach, settled-frame replay on connect) — KOS's multi-agent grid consumes it; OpenKai stays fully independent (independence invariants pinned). ADR: `research/2026-08-19-served-tui-attach-ADR.md` | attach hello replays the settled frame; ro/rw token scopes enforced; terminal TUI untouched; contract doc `docs/attach-protocol.md` |

## 4. Standing invariants

- **No model call on the routing hot path.** The LLM capability judge stays off by default until calibration shows the signal tier misrouting (OK-9.4; judge cost is a budget line, break-even enforced).
- **Panel = 2, self-pair default, third-party synthesis, gate arbitrates.** The evidence is settled (Self-MoA, LLM-Blender, judge-bias line); do not relitigate without new data.
- **Gate errors fail closed on mutations; routing judges fail cheap; synthesis parse failure keeps both role outputs.** Fail-direction is per-algorithm and deliberate.
- **Every routing decision carries a rationale** to the activity feed. Operators tolerate routing they can see.
- **Honesty discipline:** every performance claim ships with its reproducer; calibration numbers quote the quadrant table they came from.
- **ren A2 stands:** protocol changes go through CPO review first. K3-style adversarial gate is this epic's release gate (inc 10).

## 5. Explicitly not here (parked, with reasons)

- Prefill-activation routing (arXiv:2603.20895) — needs a vLLM serving stack we don't own.
- Panels >2, debate rounds, weight-level fusion — the literature says they degrade or don't apply (OK-9.6).
- `capable_first` global default — unbenchmarked at Switchyard; our calibration loop earns the right to set postures.
- KOS-side decay/mining jobs — KOS epic, not standalone.

## 6. Risks

1. **Facade scope creep** — S2 touches every consumer; keep it a composition layer, not a rewrite. Mitigation: migrate one consumer at a time, suite green between steps.
2. **Calibration data starvation** — the quadrant method needs ~60–95 runs; until then thresholds stay at the borrowed 0.5 with loud logging. Accepted.
3. **Tier-latch stickiness vs legit phase change** — mitigated by override rules bypassing the latch (critical error always escalates).
4. **Coupling-blind tuning** (AgentOpt) — stage→tier assignments tuned as joint combinations in inc 08, not per-stage.
