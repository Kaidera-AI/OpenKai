# OpenKai — Research Index (living document)

**Opened:** 2026-08-14 by kai@kaidera-os (CTO direction)
**Status:** ACTIVE — keep-research thread; append dated findings here as they land
**Naming:** **OpenKai** is the product name for kaidera's own harness + TUI module (CTO, 2026-08-14). Supersedes the "K-∏" working name.
**Cortex anchor:** `cortex log kai` decision entries dated 2026-08-14 (initiative opened; research round 1 complete).
**Future home:** this folder is expected to split into a dedicated project/repo once the OpenKai codebase grows beyond research (CTO, 2026-08-14). Until then it lives at `OpenKai/` in the kaidera-os root.

---

## 1. Purpose

Get the kaidera harness to parity-or-better with omp, pi, opencode, prime-agent and ruflo, then package what we build as **OpenKai**: an installable harness + TUI module carrying KOS's differentiators — Cortex durable memory, E016 fusion (multi-model collaboration), multi-provider support — with a more user-friendly TUI than any of them.

Method: steal/borrow legally (every candidate here is MIT) and deliberately — patterns by preference, dependencies only where the evidence justifies them.

## 2. Scope of round 1 (2026-08-14)

| Source | Findings file | Verdict headline |
|---|---|---|
| `ruvnet/ruflo` (claude-flow v3 rebrand, 67.9k★, MIT) | `2026-08-14-ruflo-findings.md` | Meta-harness (hook injection into Claude Code), not a runtime. Mine: learning-wired hooks, Beta-bandit routing (ADR-142), ReasoningBank loop, handoff schema, `verify` witness signing. Ignore as dependency. |
| `ruvnet/RuVector` (Rust agent-memory substrate, 4.4k★, MIT) | `2026-08-14-ruvector-findings.md` | Augment Cortex, never replace pre-benchmark. Mine: temporal decay + coherence gating (SQL-portable), witness logs, typed memory, learning-from-outcomes-only. `ruvector-postgres` = benchmark candidate only. |
| `RuVector/examples/ruvLLM` (self-learning LLM orchestration, MIT) | `2026-08-14-ruvllm-findings.md` | Example-grade wrapper over research-grade crates. Mine: SONA three-loop learning schedule, federated quality-gated aggregation, semantic tool cache, reflection gate. `ruvllm serve` = optional offline FU-6 sidekick lane. |
| `PrimeIntellect-ai/prime-agent` (15.9k★, MIT) | `2026-08-14-prime-agent-findings.md` | Is itself a pi fork — same lineage as omp. Mine: daemon supervisor topology, generation cursors, idempotent command journal, admission-handle subagents, child-usage attribution, kernel engineering. Adopt `pi-ai` as dependency. |
| `opencode` TUI (`anomalyco/opencode`, ~197k★, MIT) | `2026-08-14-opencode-tui-findings.md` | Best TUI UX catalogue in existence; zero memory layer (Cortex is ahead). Mine: client/server transport abstraction, SSE protocol hygiene, permission engine, shadow-git undo, subagent permission bubbling, attention system, 22 listed UX patterns. |
| `badlogic/pi-mono` (now `earendil-works/pi`, 90.4k★) + `can1357/oh-my-pi` (24.8k★) | `2026-08-14-pi-omp-findings.md` | The lineage root. omp is a hard source fork of pi, not an extension. Build-on-top verdict: **import pi-ai/pi-tui as npm libraries (option 2), HIGH feasibility**; omp-extension (option 1) for prototyping only; ponytail wrapper (option 3) is KOS's existing pi lane — keep for KOS, reject for OpenKai; full custom (option 4) rejected. |

Baseline dedupe: this round deliberately excludes anything already mined in `docs/research/2026-08-14-recursive-context-continual-harness-ADR.md` (E015) and `docs/research/2026-08-14-model-fusion-multi-model-collaboration-ADR.md` (E016), and the cmux/visibility findings in `docs/research/2026-08-14-agentic-os-visibility-research-findings.md`.

## 3. Cross-cutting conclusions (round 1)

1. **Lineage convergence.** pi-mono is the common ancestor of both omp (our runtime) and prime-agent. pi-ai (30+ providers, OAuth, unified usage/cost) and pi-tui (differential-rendering TUI library) are published MIT npm packages with supported embedder surfaces. OpenKai does not need to fork anything.
2. **Memory is our moat.** opencode, pi, and prime-agent all ship **zero** vector/retrieval memory. Cortex (pgvector lessons/decisions/work_products/run_span) is genuinely ahead. OpenKai's differentiator is Cortex + fusion, not another provider matrix.
3. **Fusion delivery vehicle.** E016's FU-* capability set lands naturally inside OpenKai; new mechanisms this round (bandit routing per complexity bucket, admission-handle subagents, child-usage attribution) strengthen FU-4, FU-1/FU-2, and FU-5 respectively.
4. **TUI quality bar is known.** opencode's 22 UX patterns + pi-tui's renderer give a concrete target for "friendlier than omp/pi": leader-key + palette, permission engine with inline diffs, subagent tree navigation with permission bubbling, shadow-git undo, attention notifications, `/tui/*` remote control.
5. **Honesty discipline.** Both ruvnet repos shipped fabricated benchmarks and publicly retracted them (ruflo audit 2026-05-29; RuVector BENCHMARK_COMPARISON retraction). Standing rule for OpenKai: **every performance claim ships with its reproducer script.**
6. **Nothing adopted pre-benchmark.** Every RuVector/ruvllm mechanism is adapted as a pattern (SQL/Python/TS port), not linked as a dependency. The only round-1 dependency recommendations are `@earendil-works/pi-ai` and `@earendil-works/pi-tui` (MIT).

## 4. Decision record

- `2026-08-14-openkai-harness-tui-ADR.md` — **the** OpenKai architecture decision: build surface, TUI stack, provider layer, fusion integration, memory strategy, packaging, sequencing. **Status: RATIFIED 2026-08-14 (CTO)** — ratification record in ADR §8.1: TS split accepted; pi-tui substrate with omp-grade feature bar + droid-grade design bar; standalone open-source product consumed by KOS as an auto-upgraded component (lane shape); dedicated repo from first scaffold; KOS builds only the control/use/manage layer.

## 5. Open research threads (next rounds)

| # | Thread | Why open |
|---|---|---|
| ~~R1-5~~ | ~~Factory droid TUI design + harness structure~~ | **LANDED 2026-08-14** — `2026-08-14-factory-droid-findings.md` (42.8KB; docs + Factory-AI org repos + binary analysis of shipped droid v0.197.0). ADR OK-5 rewritten with the droid design bar; OK-3/OK-8 amended (documented session contract; dual-channel auto-upgrade with rollback + kill-switch). Headline: droid's stack is boring (Ink/React) — its leadership is design-token discipline, one interaction grammar, clean-by-default density. Also adopted: `@factory/tui-test` headless-xterm frame-diff testing. |
| R2-1 | Benchmark `ruvector-postgres` vs pgvector on Cortex's lessons/decisions/work_products workload | Round 1 verdict: evaluate, don't commit. Needs pgrx build + our real data. |
| R2-2 | `ruvllm serve` vs Ollama as the offline FU-6 sidekick lane | Equivalent shapes; pick on quality ceiling of available GGUFs + ops cost. |
| ~~R2-3~~ | ~~pi-tui vs OpenTUI bake-off~~ | **CLOSED by ratification D2** — pi-tui ratified. |
| R2-4 | omp `metaharness`/`snapcompact`/`mnemopi` fork-code as design references | Identified, not yet mined in depth; priority raised by D2 (omp-grade TUI feature bar). |
| R2-5 | ruflo federation trust scoring + `maxHops` circuit breaker | Out of scope (single-machine) but prior art if multi-machine lands. |
| R2-6 | ACP (`omp acp`, prime-agent ACP mode) as an editor-embedding surface for OpenKai | Both lineages ship it; unscoped. |

## 6. Change log

- 2026-08-19 — **Architecture standards (S-series):** `docs/ARCHITECTURE_STANDARDS.md` — the binding design law for OpenKai and KOS: one renderer/many consumers, terminal seam law, replay-safe state, explicit frame pump, scoped input, structured state beside byte streams, one mutation path per shared store, product independence, honesty discipline, feature-registry discipline. OK-10 and E017's invariants bind by reference.
- 2026-08-19 — **OK-10 (served TUI):** `2026-08-19-served-tui-attach-ADR.md` — OpenKai serves its own TUI over a WebSocket attach channel (headless host, no node-pty): the answer to KOS's consult e631806e. CTO directive same session: OpenKai stays a fully independent product (TUI complete without KOS); the TUI lane is ren@openkai's, not a split task; KOS consumes the served surface, never co-owns it. Grid guidance encoded (xterm dom/canvas cells, WebGL for the focused cell only).
- 2026-08-18 — **Research round 2 (ren@openkai): the routing/fusion deep dive.** Three parallel agents, 34+ primary sources fetched live, mechanism-level. Two documents: `2026-08-18-switchyard-routing-fusion-deep-dive.md` (findings — supersedes `2026-08-16-switchyard-findings.md`, which was headline-correct but mechanism-free) and `2026-08-18-shift-fusion-orchestration-ADR.md` (**OK-9**: the composition decision — route when you can predict, cascade when you can verify; shift=signal scorer, fusion=evidence-settled panel, gate=verifier + router reward). Headline answers: Switchyard's tunable router is NVIDIA's prefill-activation paper (arXiv:2603.20895, unshipped); its shipped stage/escalation routers are uncited heuristics calibrated on SWE-Bench Pro Python-75, with production evidence from LangChain (−74% cost, −6pp) and Cognition (−28% cost, −2.8pp); the fusion panel rules (2 members, self-pair default, third-party pairwise synthesis, gate-arbitrated) are now literature-settled rather than convention. OK-6 amended with the pointer.
- 2026-08-15 — P4 slice A scoped: `2026-08-15-p4-tui-scope.md` — the pi-tui TUI shell (alt-screen, transcript, composer, status chrome) on the P2 SessionTransport; droid design tokens from day one; ren's four CPO amendments folded in (run modes, session protocol v1, retention boundary, TUI sequencing repair). Correction: `@factory/tui-test` is unpublished (npm 404) — frame tests use pi-tui headless rendering + pi-ai `faux` provider. Execution dispatched to bob@openkai.
- 2026-08-15 — P2 scoped: `2026-08-15-p2-agent-loop-scope.md` — single-lane agent loop (adopt `@earendil-works/pi-agent-core@0.84.2`, OpenRouter lane), session persistence (pi JSONL v3 tree + idempotent `/sessions/ingest` checkpoints, OK-4), transport abstraction (`SessionTransport` + field-addressed deltas, OK-3). Execution dispatched to bob@openkai via the KOS automatic-handoff lane.
- 2026-08-14 — Index opened. Round 1: six findings files + ADR (kai, six parallel research agents; all sources fetched live, licences verified MIT).
- 2026-08-14 — ADR **ratified by CTO** (D1–D5, see ADR §8.1). Round 1.5 opened: Factory droid TUI-design + harness-structure research (R1-5).
- 2026-08-14 — Round 1.5 **landed**: `2026-08-14-factory-droid-findings.md`. ADR amended: OK-5 rewritten (droid design bar: token discipline, one interaction grammar, clean-by-default transcript, `/btw`, bash-mode glyph, background fork receipts, `tui-test` adopted); OK-3 amended (one documented session contract); OK-8 amended (droid dual-channel auto-upgrade with rollback + kill-switch + witness verification; single `.openkai/` config namespace; Claude-Code/opencode ecosystem import strategy).
