# ADR OK-9 — Model Orchestration: how shift and fusion compose

**Date:** 2026-08-18 · **Author:** ren@openkai · **Status:** PROPOSED (CTO ratification requested)
**Amends:** `2026-08-14-openkai-harness-tui-ADR.md` OK-6 (fusion delivery) and §5.4's Switchyard note; supersedes the routing posture of `2026-08-16-switchyard-findings.md`
**Evidence base:** `2026-08-18-switchyard-routing-fusion-deep-dive.md` (34+ primary sources, mechanism-level). Citations below refer to it as [DD].
**Audience:** CTO · kai@openkai (lead) · bob@openkai (execution)

---

## 0. TLDR

Shift and fusion are not two features; they are the two halves of one decision system, and the literature names the composition law: **route when you can predict, cascade when you can verify** (arXiv:2410.10347, ICML'25).

- **shift predicts** — per turn, behavioural signals (tool errors, production intensity, spin/explore, test status) + bandit priors choose the *tier* for the current stage. No model call on the hot path.
- **fusion multiplies** — on stages the policy marks high-value, two roles run as a differentiated self-pair; a third, strongest available model synthesises by pairwise comparison.
- **the gate verifies** — an executable gate arbitrates the merge; its outcome is the bandit reward that updates shift's priors. The loop closes: Context → Action → Feedback (the exact loop arXiv:2606.22902 shows static routers lack).

One-line posture: **shift chooses who serves the turn; fusion spends the second opinion only where a gate can grade it; every outcome teaches the router.**

## 1. What we now know that we didn't

1. **What Switchyard is based on** (the open research question): its *tunable* router is NVIDIA's own prefill-activation paper (arXiv:2603.20895 — unshipped, needs a vLLM serving stack); its *shipped* routers are uncited heuristics whose RouteLLM/plan-and-execute integrations were **removed** in v0.2.0. The stage router is calibrated on SWE-Bench Pro Python-75; production numbers exist (LangChain −74% cost/−6pp; Cognition −28% cost/−2.8pp). [DD §1]
2. **Signal machinery that beats keywords**: Switchyard's corroborative tanh scorer over windowed tool signals (severity/spinning/exploring/production_intensity, hard overrides for critical errors + compaction + tests-passed settle). One maxed signal scores 0.4621 < 0.5 — escalation requires corroboration by construction. [DD §2]
3. **Panel design is settled science**: 2 proposers capture ~80% of the lift (MoA width data); self-pairs beat mixed panels (+6.6pp Self-MoA) because quality dominates diversity and roles supply diversity safely; synthesis must be a third party doing pairwise comparison (LLM-Blender, judge-bias literature). [DD §4]
4. **The gate is the keystone**: best-of-n only scales with a verifier (15.9→56% SWE-bench Lite); MAS failures cluster on missing verification (Cemri); naive aggregation actively degrades past depth 3 (ReM-MoA). [DD §4–5]
5. **Advisor-gate evidence** (Switchyard unreleased): gating a weak executor buys +11pp; gating a strong one buys parity — **fusion's value is inversely proportional to the tier shift assigned**, which is precisely why the two compose rather than compete. [DD §2]

## 2. Decisions

### OK-9.1 — shift upgrades from keyword classification to tool-signal routing

Replace `stages.ts` keyword scoring as the *primary* router with a Switchyard-shaped scorer over our own event stream (we have what a proxy must infer: the tool calls themselves).

- **Signals** (windowed, last 3 tool results): error severity from a curated pattern table (SOFT/HARD/CRITICAL), spinning vs exploring partition (deep turn without production, split by investigating), production intensity (recent writes+edits/ops), tests-passed settle detector, compaction flag (our auto-compact at 80% ctx is the same boundary Switchyard hard-escalates on).
- **Decision order** (first match wins): critical error or compaction → **capable** (override) · settled run → **efficient** · corroborative tanh scorer past threshold (0.5 start) · ambiguous → stage default tier (no LLM judge on the hot path by default — see OK-9.4).
- **Every decision carries a `decision_source` label** (override | tests_passed | dimensions | fall_open) onto the activity feed — Switchyard's observability discipline, and the data the calibration loop (OK-9.5) needs.
- The existing stage mapping (plan/build/review → cast roles) stays as the *tier assignment*: each stage resolves a (capable, efficient) pair from the cast; the scorer moves turns between them. Keyword/task-class classification survives only as the *stage* guesser for the first turn (no tool history yet).
- **Session stickiness**: a tier decision latches per stage until a signal flips it (Switchyard session affinity) — no mid-phase thrash.

### OK-9.2 — fusion panel: self-pair default, third-party synthesis, gate-arbitrated

Codifies what the evidence settles; mostly reaffirms E016 with sharper edges:

- **Default panel = the task-best model twice**, T≈0.7, with genuinely different role contexts (architect plan-first vs builder implementation-first). Cross-model pairs only when the two models are near-equal on the task class — a >5% quality gap *hurts* (Self-MoA). The bandit (FU-4) picks the pair per (stage × bucket) from telemetry.
- **Synthesiser = strongest available model, fresh context, pairwise-comparison prompt** ("compare A and B: strengths, conflicts, blind spots — then compose"), never a panel member (self-preference and same-backbone judge bias are measured). Parse failure → keep both role outputs + flag, never silently degrade.
- **Panel size stays 2** (3 only for research-class breadth tasks). Depth stays 1. No debate rounds for code — consensus voting corrupts code coherence (More Agents' own failure case).
- **The gate arbitrates everything verifiable** (tests, typecheck, lint); the LLM judge is reserved for what the gate cannot check, and its cost is budgeted as a first-class line item (OK-9.4).

### OK-9.3 — the composition contract (the actual "use both" answer)

```
turn starts
  └─ shift: stage = f(task class)            (first turn: no signals yet)
  └─ shift: tier  = scorer(signals, priors)  (bandit prior per stage×bucket;
    │                                        override rules first)
  ├─ FU-4 policy says "routine"     → single model serves the turn at that tier
  └─ FU-4 policy says "high-value"  → fusion panel at that tier:
        architect ∥ builder (self-pair default) → synthesis (3rd party) → gate
        gate PASS → result stands; reward recorded
        gate FAIL → verbatim feedback loop (FU-3, capped) → on cap:
                    shift escalates the stage a tier (cascade move) and retries once
turn ends → telemetry: (stage, tier, decision_source, gate outcome, cost)
          → bandit update → next turn's priors
```

Three rules make this evidence-true rather than aspirational:

1. **Gate outcome is the routing reward.** This is the Context→Action→Feedback closure (Agent-as-a-Router) and the duel feedback dueling-bandits need — already our telemetry shape.
2. **Escalation after gate-cap is the cascade move** (FrugalGPT): verify-then-escalate, never escalate on vibes.
3. **Compaction is a free tier-switch point** (Devin Fusion): shift re-evaluates tier at compaction boundaries even without an override signal.

### OK-9.4 — cost governance

- **Judge budget rule**: any LLM judge (synthesis assist, capability classifier) must be dramatically cheaper than the tier gap it arbitrates; LangChain's break-even `judge_cost / (dear − cheap)` is computed from live pricing and logged per run. If the ratio fails, the judge is skipped and the default tier serves.
- **No LLM call on the routing hot path by default.** The optional capability classifier exists (Switchyard's `p_solve` shape is the design if we add it) but ships disabled until quadrant calibration shows the signal tier alone misroutes.
- **FU-4's policy stays deterministic config first** — unchanged from E016.

### OK-9.5 — calibration is a shipped artefact, not a vibe

- Threshold tuning follows Switchyard's quadrant method: ~40–75 capable-tier + ~20 efficient-tier runs on representative tasks; RESCUE/LOSS/SAFE/HARD; **lowest threshold that rescues RESCUE without over-escalating LOSS**. Stored as `research/calibration/` run records.
- Router quality is reported CPT/APGR-style (cost of strong-tier calls vs quality-gap closed) from our own telemetry — RouteLLM's evaluation frame, our data.
- Honesty discipline (standing rule): every routing/fusion performance claim ships with its reproducer.

### OK-9.6 — what we deliberately do NOT build

1. **No prefill/hidden-state routing.** Requires owning the serving stack (vLLM connector); NVIDIA itself ships only the notes. Revisit if we ever self-serve models.
2. **No RouteLLM-style semantic/text-embedding router as the primary signal.** NVIDIA's own paper shows semantic features can't capture intrinsic difficulty; behavioural signals dominate for agents.
3. **No panels >3, no debate/vote consensus for code, no raw-concat synthesis** (ReM-MoA's −9.1pp failure mode).
4. **No model call on the routing hot path** (OK-9.4), and **no `capable_first` equivalent default** until our own quadrant calibration supports it (Switchyard leaves it unbenchmarked; we inherit the caution).
5. **No weight-level fusion** (FuseLLM): training-run machinery for lab settings; inference-time fusion matches its gains with none of the infra.
6. **No coupling-blind tuning**: stage→tier assignments are tuned as joint combinations (AgentOpt's coupling warning), not per-stage independently.

## 3. Consequences

**Positive.** shift graduates from keyword guessing to the mechanism with production evidence (−74%/−28% cost at single-digit-pp quality cost); fusion's panel design is now evidence-settled rather than convention; the gate stops being a fusion accessory and becomes the reward signal for the whole orchestration loop; calibration/evaluation methodology is concrete and reproducible.

**Negative / accepted costs.** The signal extractor must track our tool taxonomy (maintenance surface as tools evolve); tier latching can stick wrong on noisy signals (mitigated: corroboration requirement + stage boundaries); two-tier casts require casts to name an efficient model per role (config migration); the calibration loop needs ~60–95 instrumented runs before thresholds are trustworthy (until then: defaults at 0.5, efficient-side bias, loud logging).

**Risks.**
1. **Signal sparsity early in a session** — first turns have no tool history; stage default + stickiness covers it (Switchyard's own answer).
2. **Judge-cost creep** — mitigated by OK-9.4's break-even gate.
3. **Over-escalation on flaky environments** (severity patterns fire on infra noise) — mitigated by the windowed max + settle detector; monitored via decision_source distribution.
4. **Evidence gap on long-horizon tasks persists** (DRACO excludes them; our epics are multi-hour) — the telemetry loop is precisely the instrument that closes this locally; unchanged from E016's stance.

## 4. Work items (sequenced)

| # | Item | Depends on |
|---|---|---|
| OK9-W1 | `shift/signals.ts`: tool-signal extractor + corroborative scorer + decision_source labels (port of Switchyard's stage.rs, TypeScript, our event stream) | — |
| OK9-W2 | Tier pairs per stage in casts (capable/efficient per role) + tier latch per stage | W1 |
| OK9-W3 | Fusion policy wiring: FU-4 high-value stages invoke the panel at the shift-assigned tier; gate-cap → tier escalation retry | W1, W2 |
| OK9-W4 | Synthesis prompt upgrade: pairwise-comparison contract; strongest-model resolution; parse-failure posture | — (independent) |
| OK9-W5 | Bandit reward = gate outcome; priors feed shift tier defaults per (stage × bucket) | W3 |
| OK9-W6 | Calibration harness: quadrant runner + `research/calibration/` records; threshold sweep; CPT/APGR reporter | W1–W5 running |
| OK9-W7 | Judge break-even meter on the activity feed | W3 |

W1–W5 are the next epic's core; W6–W7 are its acceptance evidence.
