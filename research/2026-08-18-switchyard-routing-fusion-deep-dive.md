# Deep dive — Switchyard lineage, LLM routing, and model fusion (E012 research round 2)

**Date:** 2026-08-18 · **Author:** ren@openkai · **Status:** LANDED
**Supersedes:** `2026-08-16-switchyard-findings.md` (kai's one-pager — correct headlines, no mechanism depth)
**Feeds:** `2026-08-18-shift-fusion-orchestration-ADR.md` (the design decisions this evidence supports)
**Method:** three parallel research agents (Switchyard source-read, routing literature, fusion literature); 34+ primary sources fetched live; every number below carries a URL or repo path. [INFERENCE] marks synthesis, not source.

---

## 1. What Switchyard is based on — the definitive answer

kai's pass never answered this. The answer, source-verified:

**Switchyard has TWO router families with different provenance:**

1. **The tunable (learned) router is NVIDIA's own published research:** *"LLM Router: Rethinking Routing with Prefill Activations"* (HTML title: *"LLM Router: Prefill is All You Need"*), **arXiv:2603.20895** (2026-03-21), Varshney, Surla, Xu, Venkata Krishnan, Jeblick, Austin, Vaidya, Onofrio (NVIDIA). The launch blog (developer.nvidia.com, 2026-08-11, same lead authors) names it the basis of the "Prefill router". **It is NOT shipped in the repo** — what ships is the serving-side enabler (`docs/vllm-serve-hidden-state.md`: vLLM `ExampleHiddenStatesConnector` dumping residual-stream activations). LangChain calls it "research stage rather than production ready."
   - Mechanism: an open-weight encoder's **prefill residual-stream activations** predict every candidate model's correctness probability simultaneously (SharedTrunkNet MLP; layer selected by Fisher Separability; PCA to 50–300 dims). Encoder-Target Decoupling lets an open encoder score closed-source targets.
   - Numbers: closes **45.58% of the best-model→oracle gap**, **74.31% cost saving vs the costliest model in the pool**, +10.9pp over the best single model (frontier pool); mean per-target AUC 0.856. >400 semantic baselines (kNN, XGBoost, DeBERTa-LoRA, GNN, IRT) all lose.
   - **Negative result that matters for us:** semantic text embeddings can't capture intrinsic task difficulty — behavioural signals win. Justifies shift routing on tool outcomes, not prompt similarity.

2. **The shipped tuning-free routers (stage router, LLM classifier, escalation router, advisor gate) cite no paper.** They are NVIDIA heuristics calibrated on **SWE-Bench Pro Python-75** and benchmarked on Terminal-Bench (Lite/2.0/2.1). Traceable ancestry: v0.1.0 (2026-06-30) **literally integrated RouteLLM** plus a plan-and-execute router and an NVIDIA Inference Hub latency router; v0.2.0 (2026-08-10) **removed all three** (CHANGELOG: "Legacy routing integrations — plan-and-execute routing, RouteLLM, and the external OSS-router plugin path are removed") and renamed `cascade` → `stage_router` when the native Rust server landed. The escalation router is the FrugalGPT cascade re-cut for multi-turn trajectories.
   - **No NeMo Guardrails lineage.** Relay/Dynamo appear only as session-header conventions (`x-nemo-relay-session-id`, `x-dynamo-session-id`, `crates/protocol/src/metadata.rs`).

**Maturity (their words):** "pre-alpha… expected to change significantly before v1.0", "Not for production use." `capable_first` picker is unbenchmarked — every published threshold comes from `efficient_first`.

**Production evidence it works:**
- **LangChain** (independent, 2026-08-11): 145 multi-turn agentic tasks (τ²-bench, BFCL, FRAMES, Nexus); escalation router, Nemotron 3.5 Lightning 30B ↔ Claude Opus 4.8, judge Gemini 3.1 Flash-Lite: **86.0% @ $11.45 → 80.0% @ $3.00 (−74% cost, −6pp), 7% frontier calls**. Judge ate **21.2%** of routed spend; break-even formula `min offload = judge cost / (expensive − cheap)`; frontier share ranged 4.1–9.1% across 5 runs (bill variance is real). Their honest caveat: routing beat cheap-only by 2.3pp < 2.7pp noise — on a saturated suite, routing is **cost insurance**, not accuracy.
- **Cognition**: "implemented the NeMo Switchyard staged-routing methodology in Devin Desktop" — FrontierCode Main, Opus 5 ↔ Kimi K2.7: **50.6% @ $3.11 — within 2.8pp of Opus 5 at ~28% lower cost.**

---

## 2. The Switchyard stage router, mechanism-level (from source)

`crates/libsy/src/algorithms/util/stage.rs` + `tool_signals.rs` — pure, deterministic, no I/O.

**Signals** (extracted per request from the normalised conversation, window = last 3 tool results):
- `severity` — max over window from a curated substring table: SOFT 0.3 (nonzero exit), HARD 0.7 (traceback, import/value/syntax errors, command-not-found, timeout, "file does not exist" — the last trace-mined across 1006 local trajectories at 22 TP / 2 FP), CRITICAL 1.0 (OOM, connection refused).
- `spinning` vs `exploring` — partition of the not-producing case at `turn_depth ≥ 8`: spinning = no production AND not investigating; exploring = no production AND recent reads/plans.
- `production_intensity` — recent (writes+edits)/recent ops; `tests_passed` — pass phrase AND no failure literal AND no nonzero failure count ("0 failed" guarded); `compacted` — Claude Code's "session is being continued" marker, self-latching.

**Decision** (`pick_tier`, ordered, first match wins):
1. **Hard escalate → capable**: critical severity OR compacted context ("a context big enough to overflow belongs capable"). `DecisionSource::Override`.
2. **Hard de-escalate → efficient**: tests_passed AND ≥1 recent write/edit AND zero windowed severity (settled run). `DecisionSource::TestsPassed`.
3. **Corroborative scorer**: `raw = 0.10·(severity/0.7 + spinning + exploring − production_intensity)`; `score = tanh(5·raw)`; `confidence = |score|`. Constants sized so **one maxed signal scores ≈0.4621 < 0.5** — escalation takes ~1.5 corroborating signals. confidence ≥ threshold → route by sign. `DecisionSource::Dimensions`.
4. **Fall-through**: below threshold → optional LLM capability judge → else picker default (`fall_open`).

**Calibration method (the most transferable artefact):** ~40–75 pure-capable + ~20 pure-efficient counterfactual runs, stratified; build **RESCUE** (capable-fail ∩ efficient-pass) / **LOSS** (capable-pass ∩ efficient-fail) / SAFE / HARD quadrants; pick the **lowest threshold rescuing RESCUE without over-escalating LOSS**. Caveat they print: in-router efficient outcomes inherit capable-arm context, so pure-efficient RESCUE is a conservative lower bound.

**The other routers:** LLM classifier (capability mode) — judge returns `{crux, primary_rule, capability_boundary, p_solve}`, weak iff `p_solve ≥ base + steps·step`, **fail-open to STRONG**; session affinity pins the first decision. Escalation router — judge reads each completed weak turn (anchors + trailing 28 messages × 500 chars), **2 consecutive escalate verdicts latch the session to strong one-way**; judge failure serves the buffered weak reply (fail-WEAK). Advisor gate (unreleased on main) — executor serves every turn; strong advisor gates terminal moments (first no-tool-call turn after ≥3 tool results, stall checkpoints): APPROVE replays verbatim, REDO discards the turn and injects the advisor's plan; **+11pp on a weak executor (43.8→54.7% Terminal-Bench 2.1, k=3), parity on a strong one**; unparseable verdict = APPROVE with refunded budget.

**Fail-open directions differ per algorithm and are easy to get wrong:** capability → strong; escalation → weak; advisor → approve; stage router → picker default.

---

## 3. The routing literature, distilled (34 sources in agent report; the load-bearing ones)

| Work | Mechanism | Headline number | What shift takes |
|---|---|---|---|
| **RouteLLM** arXiv:2406.18665 (ICLR'25) | P(strong win \| query) from 80k Arena preferences; matrix factorisation generalises sparse cells | >85% cost cut MT-Bench at 95% GPT-4; **routers transfer when model pair is swapped** | Win-probability threshold = tier policy; CPT/APGR is how we evaluate shift on our own telemetry |
| **FrugalGPT** arXiv:2305.05176 | Cascade: cheap→dear, tiny learned scorer gates acceptance | 98% cost cut at GPT-4 parity | Escalation = post-hoc verification; scorer must be far cheaper than the tier it gates |
| **Unified routing+cascading** arXiv:2410.10347 (ICML'25) | Proves both are one decision problem; **combination beats either** | "route when you can predict, cascade when you can verify" | **The composition law for shift+fusion** (see ADR) |
| **Static-policy caution** arXiv:2602.09902 | Decision-theoretic: optimal routing is almost always static unless models are *complementary* | per-query routing gains modest when one model dominates | Measure the oracle gap on our traces before adding machinery |
| **BaRP** arXiv:2510.07429 | Contextual bandit over prompt features: deployment sees only the chosen arm's outcome | +12.46% over offline routers | Offline supervision mismatches deployment; our bandit approach is the right frame |
| **Dueling bandits** arXiv:2510.00841 | Pairwise (duel) feedback suffices; Thompson sampling explores | SOTA regret on RouterBench | Gate outcomes (pass/fail per pair) are exactly duel feedback |
| **StageRoute** arXiv:2506.17254 | Non-stationary model inventory; UCB/LCB with provable regret | Õ(T^{2/3}) with matching lower bound | Models churn under us; online selection isn't optional |
| **Avengers-Pro** arXiv:2508.12631 | Embed→cluster→score per cluster; performance-efficiency blend | +7% over GPT-5-medium at −27% cost | Per-(stage × task-cluster) win tables from telemetry |
| **MasRouter** arXiv:2502.11133 (ACL'25) | Multi-Agent System Routing: collab mode → role allocation → per-role model | −17–28% overhead as MAS plug-in | The academic frame for role-granular routing |
| **AgentOpt** arXiv:2604.06296 | Role→model assignments are **coupled** — per-call routing insufficient | optimise whole combinations | Don't tune plan-tier and build-tier independently |
| **Agent-as-a-Router** arXiv:2606.22902 | Static routers suffer *information deficit*; +15.3% from per-task-dimension stats alone | Context→Action→Feedback loop | Close the loop: telemetry → router priors |
| **Prefill router** arXiv:2603.20895 (NVIDIA) | §1 above — residual-stream routing | 45.6% oracle gap closed, −74.3% cost | Parked: needs owning the serving stack (vLLM connector) |
| **CogRouter** arXiv:2602.12662 | Per-STEP cognitive-depth adaptation | 7B +40.3% over GPT-4o on ALFWorld, −62% tokens | Field is moving query→stage→step; our stage level is the right granularity today [INFERENCE] |
| **Devin Fusion** (Cognition blog 2026-06) | Switch models **at compaction boundaries** — the cache miss is already being paid | up to −60% cost | Compaction = zero-cost tier-switch point for shift |

---

## 4. The fusion literature, distilled

| Work | Mechanism | Headline number | What fusion takes |
|---|---|---|---|
| **MoA** arXiv:2406.04692 | Layered aggregate-and-synthesise | 65.1 vs GPT-4o 57.5 AlpacaEval; **width: 1→2 +11pp, 2→6 +2.5pp**; layer 1→2 dominates; best proposer ≠ best aggregator (skills anti-correlated) | Panel = 2, maybe 3; depth = 1; synthesiser is a distinct role choice |
| **Self-MoA** arXiv:2502.00674 | Same-model proposers at T=0.7 vs mixed panel | **+6.6 over mixed MoA**; quality coef ≫ diversity coef (biggest on code/math); a 5%-weaker member **costs** 1.5pp | **Default self-pair with differentiated contexts**; cross-pair only near-equal models |
| **LLM-Blender** arXiv:2306.02561 | PairRanker → GenFuser; rank-then-fuse | selection ≈ 75% of the gain; pairwise > pointwise | Synthesiser **compares** the two outputs pairwise, doesn't score separately; pre-filter if panel grows |
| **Debate (Du et al.)** arXiv:2305.14325 | Symmetric multi-round debate | arithmetic +14.8; **reflection DEGRADED MMLU −6.2**; rounds plateau at 4; conformity collapse | No debate machinery for code; asymmetric roles + judge beat symmetric consensus |
| **MAD critiques** arXiv:2311.17371, arXiv:2502.08788 | Debate often loses to self-consistency at matched compute; heterogeneity is the fix | — | Panel diversity via *role/context*, which doesn't dilute quality |
| **Judge bias** arXiv:2404.13076, arXiv:2305.19118 | Self-preference scales with self-recognition; judges favour their own backbone | measured, linear | **Neither role may synthesise its own lane**; synthesiser should differ from both, or gate arbitrates |
| **LLM-as-judge** arXiv:2306.05685 | GPT-4 judge ≈ human agreement >80%; position/verbosity biases | — | LLM judges OK for prose; **code/math verdicts belong to the executable gate** |
| **LLM Monkeys** arXiv:2407.21787 | Best-of-n coverage log-linear; **with a verifier gains translate directly** | SWE-bench Lite 15.9% → 56% (250 samples); without verifier, voting plateaus | **The gate is what converts panel multiplicity into wins** — the keystone citation for FU-3 |
| **ReM-MoA** arXiv:2606.24437 | Naive concat aggregation **degrades past L=3** (−9.1pp MMLU); diversity collapse from identical context | — | Give the two roles genuinely different context/lenses; never raw-concat into synthesis |
| **Cemri et al.** arXiv:2503.13657 | 1600+ MAS traces: failures are coordination + **missing verification**, not agent count | — | Our gate-first posture addresses the #1 MAS failure cluster |
| **Aider leaderboard** (live, 2025-11) | architect/editor pays ∝ reasoner's edit-format unreliability | R1+Sonnet +7.1pp (format 94.6→100%); o3 +1.3pp (already clean) | Route edit-apply stages by format-compliance, reasoning stages by strength |
| **AgentCoder** arXiv:2312.13010 | programmer + separate test-designer | HumanEval 96.3% at **half the tokens** of prior SOTA | Test/gate design must not belong to the builder (our invariant, independently validated) |
| **Agentless** arXiv:2407.01489 | Dumb 3-phase pipeline beat all open agents (SWE-bench Lite 32% @ $0.70) | — | Complexity must pay rent: localise → repair → **validate**; the roles that mattered were localisation + patch validation |
| **SWE-Edit** arXiv:2604.26102 | Viewer/Editor subagent split | +2.1% resolved at −17.9% cost | Role-split's 2026 value is context hygiene + cost, not raw capability |
| **Cognition "Don't Build Multi-Agents"** (2025-06) | Parallel agents with unsynchronised decisions produce irreconcilable merges | Flappy Bird example | Their own evolution: Devin Fusion (2026) = two roles, separate contexts, explicit merge — the tension resolves through the synthesis artifact |

---

## 5. Cross-cutting laws the evidence supports

1. **Route when you can predict; cascade when you can verify** (2410.10347). Shift predicts from behavioural signals; the gate verifies; fusion multiplies verified attempts.
2. **The verifier is the keystone.** Every scaling success (Monkeys 15.9→56%, AgentCoder 96.3%, Agentless 32%) runs through executable feedback; every degradation story (ReM-MoA, MAD, Cognition's warning) lacks one.
3. **Two is the panel.** 1→2 proposers: +11pp; 2→6: +2.5pp; aggregation degrades past depth 3; N=5 plateau. Beyond two roles you buy tokens, not accuracy.
4. **Self-pair by default; cross-pair when near-equal.** Quality dominates diversity; role/context differentiation supplies the useful kind of diversity for free.
5. **The synthesiser is a third party.** Aggregator skill ≠ generator skill; self-grading bias is measured; pairwise compare beats independent scoring; strongest available model synthesises.
6. **Behavioural signals beat semantic signals for agents** (NVIDIA's own negative result on embeddings; Switchyard's entire stage router; Agent-as-a-Router's information-deficit fix). A harness sees tool outcomes — richer than any prompt embedding.
7. **Fail-open direction is a per-algorithm decision** (Switchyard ships four different answers). Ours: gate errors fail CLOSED on mutations (existing posture), routing judges fail to the cheaper tier, synthesis parse failure keeps both role outputs + flags.
8. **Budget the judge.** LangChain: judge = 21.2% of routed spend; break-even `judge/(dear−cheap)`. If the judge isn't dramatically cheaper than the tier gap, routing loses money.
9. **Calibrate with quadrants, not vibes.** RESCUE/LOSS/SAFE/HARD on 40–75 + ~20 runs; pick the lowest threshold rescuing RESCUE without over-escalating LOSS.
10. **Compaction is the free switch point** (Devin Fusion; Switchyard's `compacted` hard-escalate). Our auto-compact (80% ctx) is already that boundary.
