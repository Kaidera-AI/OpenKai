# ADR: OpenKai — Harness + TUI Module Architecture

**Date:** 2026-08-14
**Author:** kai@kaidera-os
**Status:** RATIFIED 2026-08-14 (CTO) — see §8.1 for the decision record; droid TUI-design amendment pending (round 1.5 research)
**Audience:** CTO (Amad) · ren@kaidera-os (CPO, adversarial review) · bob@kaidera-os (research lead)
**Product name:** **OpenKai** (CTO, 2026-08-14) — kaidera's own **open-source**, standalone installable harness + TUI module. Supersedes the "K-∏" working name.
**Home:** dedicated repository `~/DevVault/OpenKai` + dedicated Cortex project `openkai` (split executed 2026-08-14; research corpus moved here from kaidera-os — provenance copies remain anchored in kaidera-os Cortex entries). KOS itself gains **only the control/use/manage lane layer**, same as for any other harness.
**Complements:** E015 (`docs/research/2026-08-14-recursive-context-continual-harness-ADR.md`) · E016 (`docs/research/2026-08-14-model-fusion-multi-model-collaboration-ADR.md`) · E017 (Harness Intelligence Upgrade epic) · `docs/research/2026-08-14-agentic-os-visibility-research-findings.md` (visibility/DX)

**Evidence base (all research executed this session, six parallel agents, primary sources only):**
- `research/2026-08-14-ruflo-findings.md` — ruvnet/ruflo, MIT
- `research/2026-08-14-ruvector-findings.md` — ruvnet/RuVector, MIT
- `research/2026-08-14-ruvllm-findings.md` — RuVector examples/ruvLLM, MIT
- `research/2026-08-14-prime-agent-findings.md` — PrimeIntellect-ai/prime-agent @ `9f95011`, MIT
- `research/2026-08-14-opencode-tui-findings.md` — anomalyco/opencode @ `4643e65` + docs, MIT
- `research/2026-08-14-pi-omp-findings.md` — earendil-works/pi (pi-mono) + can1357/oh-my-pi, both MIT

---

## 0. TLDR

The question "how far behind omp/pi is our harness, and how do we ship our own" has a surprising answer uncovered this round: **omp and prime-agent are both forks of the same ancestor — pi-mono (`earendil-works/pi`) — and that ancestor publishes its provider layer (`pi-ai`, 30+ providers) and TUI library (`pi-tui`) as MIT npm packages with supported embedder surfaces.** We do not need to fork anything, wrap anything, or build anything from scratch to stand OpenKai up.

**Decision: OpenKai is a standalone, open-source TypeScript product that imports `pi-ai` + `pi-tui` as npm dependencies (build-on-top option 2), keeps its own TUI, and treats KOS's Python orchestrator + Cortex (Postgres/pgvector) as its memory and orchestration plane.** It lives in its own repository, ships as an npm package + binaries, and KOS consumes it as an automatically-upgraded component through the same lane shape it uses for every other harness. Fusion (E016 FU-*) is delivered *through* OpenKai, not around it.

The three findings that make this cheap:

1. **Memory is our moat, and nobody else has it.** opencode (~197k★), pi (90.4k★), and prime-agent (15.9k★) all ship **zero** vector/retrieval memory — verified by source inspection this round. Cortex's lessons/decisions/work_products/run_span store is genuinely ahead. OpenKai pairs the best commodity substrate (pi lineage) with the one thing none of them have.
2. **The TUI quality bar is a known, enumerated list.** opencode's TUI docs + source give 22 concrete UX patterns (leader-key, command palette, permission engine with inline diffs, subagent-tree navigation with permission bubbling, shadow-git undo, attention notifications). pi-tui provides the renderer (differential rendering, CSI 2026, overlays, alt-screen). "Friendlier than omp/pi" is an engineering checklist, not a design risk.
3. **The fusion machinery E016 designed has better parts available now.** ruflo's per-complexity Beta-bandit routing (ADR-142) upgrades FU-4; prime-agent's admission-handle subagent protocol + child-usage attribution entries are the correct shape for FU-1/FU-2 panels and FU-5 cost accounting; ruvllm's SONA loop schedule and RuVector's temporal-decay scoring upgrade Cortex's unmined-trajectory problem (E015 KL-2) without new dependencies.

## 1. The landscape, one paragraph each

**pi-mono → `earendil-works/pi` (90.4k★, MIT).** The lineage root. TS monorepo: `pi-ai` (30+ providers, OAuth, unified usage/cost, cross-provider handoff), `pi-agent-core` (Agent loop, steer/follow-up queues, compaction hooks), `pi-tui` (standalone differential-rendering TUI library), `pi-coding-agent` (the `pi` CLI + supported embedder SDK: `createAgentSession`, `AgentSessionRuntime`). Deliberate non-features: no subagents, no MCP, no permissions — all delegated to extensions.

**omp (24.8k★, MIT) — our runtime.** A hard **source fork** of pi-mono, not an extension pack: ~80k lines of Rust N-API natives, subagents, LSP/DAP, browser, marketplace. Consequence stated plainly: tracking upstream pi means merge-from-fork, so OpenKai must not build *on omp's source*; but omp retains pi's ExtensionAPI, so an omp extension remains a valid **prototyping** surface (§3, option 1).

**prime-agent (15.9k★, MIT).** Also a pi fork. Its value-add over the ancestor: a three-process **daemon topology** (supervisor → resident worker per session tree → IPython kernels), generation-fenced event cursors, idempotent command journal, admission-handle subagents that survive detachment, and a dill-snapshotted Python kernel as durable context. Its harness "memory" is an mtime-polled JSON ledger — weaker than Cortex.

**opencode (~197k★, MIT).** Separate ecosystem (Bun/Effect-TS, OpenTUI Zig core + Solid). Client/server split with transport-abstracted fetch+SSE (worker-RPC in-process, real HTTP+SSE external), models.dev catalogue, a genuinely excellent permission engine, shadow-git undo, and the best-documented TUI UX in the field. Zero memory infrastructure — deliberate scope.

**ruflo (67.9k★, MIT).** claude-flow v3 rebranded. A **meta-harness**: injects hooks/MCP/CLAUDE.md into Claude Code/Codex rather than running its own agent loop. 323 MCP tools, learning-wired hooks, ReasoningBank RETRIEVE→JUDGE→DISTILL loop, Beta-bandit per-complexity model routing, Ed25519 install witness. Also: shipped fabricated benchmarks and publicly retracted them (audit 2026-05-29) — a governance lesson, not just a parts bin.

**RuVector (4.4k★, MIT) + ruvLLM (example-grade).** A Rust agent-memory substrate (~176 crates): HNSW, temporal decay + coherence gating (ADR-211), hash-linked witness logs, copy-on-write memory branches, capability-gated ANN, and `ruvector-postgres` (pgrx, 143 SQL functions, in-DB embeddings, Cypher+SPARQL). ruvLLM adds SONA three-loop learning (MicroLoRA per-request / hourly K-means++ pattern extraction / weekly EWC++ consolidation), federated quality-gated trajectory aggregation, and a semantic tool-result cache. Both repos carry honest "known boundaries" lists and one retracted fabricated benchmark set — treat as a **parts catalogue, not a product**.

## 2. What KOS already has (the floor OpenKai stands on)

From the E015/E016 surveys, restated briefly: four harness lanes with one normalised event contract; deterministic 8-gate dispatch; handoff leases + watchdog; Cortex 6-layer memory with pgvector; `run_span` append-only trajectory capture (currently pruned unmined — E015 §3.2); per-run token/cost telemetry; E014 persona registry (design); E016 FU-1..FU-7 fusion capability set (ratified as plan). KOS runs on omp today, and E017 already sequences the Pi-to-OMP cutover.

## 3. Decision: build surface

**Chosen: option 2 — OpenKai as a TypeScript app importing pi-mono libraries.** Verdicts from the pi/omp findings (each with evidence there):

| Option | Verdict | Why |
|---|---|---|
| 1. omp extension/pack | HIGH feasibility, **LOW product identity** — prototype only | omp's ExtensionAPI supports tools/commands/providers/full custom TUI components and marketplace distribution, so fusion can be *prototyped* there today. But the chrome stays omp's, extensions run in-process with no isolation, and "friendlier TUI than omp" is unreachable inside overlay boundaries. |
| **2. Import `pi-ai` / `pi-tui` (± `pi-agent-core`, coding-agent SDK) as npm libraries** | **HIGH — adopted** | Published packages with explicit exports maps and a supported embedder SDK. OpenKai keeps its own TUI (on pi-tui), its own orchestration (KOS), its own memory (Cortex). Version pinning is normal npm practice. |
| 3. Ponytail-thin subprocess wrapper (`--mode json`/`rpc`) | PROVEN — **kept as a KOS lane, rejected as OpenKai's surface** | This is exactly KOS's existing pi lane (`docs/design/research/stream-pi-wiring-design.md`). Right answer for KOS driving foreign harnesses; cannot deliver a friendlier TUI (inherits the host's wholesale) and pays process-per-session + flag-drift costs. |
| 4. Full custom harness + TUI | **Rejected** | Re-implements 30+ provider integrations + OAuth + cost tables, a differential renderer, session tree/compaction, extension runtime — i.e. repeats omp's fork decision without its Rust-natives justification. MIT makes copying legal; it doesn't make it valuable. |

**The ponytail reading, stated honestly:** the laziest thing that actually works *for KOS's lanes* is option 3, and it already exists. The laziest thing that actually works *for OpenKai-the-product* is option 2 — libraries, not a fork. Anything "simpler" either can't ship its own TUI (1, 3) or is maximal work masquerading as control (4).

## 4. Decision: architecture

```
┌─────────────────────────────────────────────────────────┐
│ OpenKai module (TypeScript, npm package + binaries)      │
│                                                         │
│  TUI (pi-tui substrate) ──► transport-abstracted client │
│       (opencode pattern: fetch + EventSource interface, │
│        in-process tunnel OR real HTTP+SSE)              │
│                                                         │
│  Agent loop (pi-agent-core pattern / omp-lineage)       │
│       │                                                 │
│  Provider layer: @earendil-works/pi-ai (30+ providers,  │
│       OAuth, unified usage/cost) + models.dev catalogue │
│       │                                                 │
│  Fusion layer (E016 FU-*): role-split, synthesis,       │
│       gate-first validation, bandit panel selection     │
└──────────────┬──────────────────────────────────────────┘
               │ Cortex API (existing HTTP surface)
┌──────────────▼──────────────────────────────────────────┐
│ KOS (Python, unchanged): deterministic dispatch, lanes, │
│ watchdog, handoffs, Cortex Postgres+pgvector memory,    │
│ run_span trajectories, lessons/decisions/work_products  │
└─────────────────────────────────────────────────────────┘
```

Component decisions:

**OK-1 — Provider layer: adopt `@earendil-works/pi-ai` as a dependency.** 30+ providers with OAuth, unified `Usage` with cost, per-provider subpath imports, cross-provider context handoff. Kills per-provider auth juggling on the OpenKai side. Pin a version (namespace migration to `prime-agent-*` is in flight upstream — watch it). Augment with the **models.dev catalogue pattern** (5-min TTL cache + cross-process flock; opencode/prime both do this) so model metadata (cost tiers, reasoning options, status) is data, not code.

**OK-2 — TUI: build on `@earendil-works/pi-tui`, feature bar = omp-grade, design bar = droid (RATIFIED Q2, §8.1 D2).** pi-tui is the ratified substrate: differential rendering, CSI 2026 synchronised output, overlays with focus management, alt-screen layouts, xterm-headless testability — proven at pi/omp scale, lineage-consistent. **The feature/UX bar is omp's TUI, not bare pi's** (CTO: "omp tui is better actually"): Agent Hub for live subagent transcripts/steering/kill, structured option-picker cards, tool-call cards with edit previews, time-travelling stream rules, snapcompact — these are omp fork-code, so they are *re-implemented patterns* on pi-tui, not imports. **The visual-design bar is Factory droid's TUI** (CTO: "best from a design point of view") — round 1.5 research mines it; the OK-5 pattern list will be amended with its design language. OpenTUI (opencode's Zig+Solid stack) remains rejected: Bun/Solid/Effect ecosystem for no capability pi-tui lacks.

**OK-3 — Client/server with transport abstraction (opencode pattern), one documented session contract (droid pattern).** The TUI codes against a `fetch` + `EventSource`-shaped interface; in-process tunnelling when embedded, real HTTP+SSE when attached to a headless KOS/Cortex server. Adopt opencode's SSE hygiene wholesale: `server.connected` first frame, 10s heartbeat, ascending event IDs, directory/workspace filtering, `disposed` sentinel, field-addressed deltas (`{partID, field, delta}` — unify KOS's `delta`/`thinking` behind one event with a `field` discriminator), 16ms client-side batching. From droid: **one documented session-control protocol** that the TUI, KOS lanes, and future SDKs all speak — droid's daemon contract (`initialize_session`/`add_user_message`/`session_notification`/`request_permission`) is the documented-shape prior art; we keep SSE/HTTP (KOS's existing surface) rather than adopting their WebSocket/JSON-RPC wire. KOS's console+SSE already exists; this hardens it into the protocol.

**OK-4 — Memory: Cortex is the differentiator; augment it with RuVector patterns, no new dependency.**
- **Temporal decay + coherence gating** (RuVector ADR-211): `score = cos × exp(-λ·age) × gate` — three formulae, portable to SQL over existing pgvector tables. Supersedes hourly unmined pruning with graded decay.
- **Witness-log hash chaining** (AgenticDB) for `run_span` trajectory audit.
- **Learning-from-outcomes-only discipline** (SONA trigger model): retrieval never mutates learned state; only gated outcomes do. Adopt as an invariant.
- **SONA loop schedule as Cortex jobs** (ruvllm): per-request adaptation / hourly pattern extraction / weekly consolidation — the concrete shape for E015 KL-2 trajectory mining. Port the schedule, not the crate.
- **Semantic tool-result cache** (cos ≥ 0.85, TTL, LRU) against pgvector.
- **`ruvector-postgres` = benchmark candidate only** (open thread R2-1). No commitment pre-benchmark; the vendor's head-to-head numbers were retracted as fabricated.
- **Session persistence:** adapt pi's session JSONL v3 tree + `retainedTail` compaction entries — branchable, checkpointed trajectories are the battle-tested answer to KOS's unmined-pruning problem.

**OK-5 — TUI UX: opencode's enumerated patterns as the feature floor, droid's design discipline as the design bar (amended 2026-08-14, round 1.5).** The droid finding that reframes the TUI work: **droid's stack is boring (Ink/React + jotai) yet it is the field's design leader — the ceiling is set by design process, not rendering framework.** So the pi-tui substrate is no excuse: what we copy is discipline, not components.

*Design bar (droid, from `2026-08-14-factory-droid-findings.md` §2/§6 — 9 ADOPT items):*
- **Design-token system with enforcement passes** — `surface-1/2/3`, `text.muted`, `highlight`/`highlightDanger` (danger encoded in the highlight of risky approval rows, not just the label), muted-left-border code blocks; ad-hoc colour banned from day one; recurring "migrate hardcoded colours to the theme system" passes are the habit to copy.
- **One interaction grammar everywhere** — every overlay carries the same footer line (`↑/↓ Navigate · Enter Select · 1-N Quick select · ESC Cancel`).
- **Clean-by-default transcript, density on demand** — verbose details hidden behind one toggle (droid's `Ctrl+O`); "no pixel moves unless it means something" (fixed-width chips so state cycles don't reflow the composer; spinner reflects true turn state).
- **Persistent, visible state** — mode/autonomy/model/effort/MCP/token-usage in chrome, each single-key cyclable; **modes have visual identity** (spec mode keeps its own colour across repaints); autonomy is one coarse visible axis (off/low/med/high) layered over the fine-grained permission rules.
- **Flow-preserving ergonomics** — `!` bash-mode toggle with prompt-glyph state (`>`→`$`); `/btw` side channel for clarifying questions without polluting the main transcript; double-Esc clears the draft, third Esc opens the rewind menu (rewind discoverable from the panic key); background `/fork` that prints a paste-able resume receipt; `/tree` fork navigation; `droid search` local full-text session index (OpenKai's version searches sessions *and* Cortex memory through one verb).
- **Mermaid→ASCII inline + in-terminal charts**, theme-tinted per element (omp already renders mermaid ASCII; add theming + fallback rule).
- **Onboarding that teaches the approval loop as the product**; animated logo exactly once; in-product changelog (`Ctrl+J`) wired to the auto-upgrade channel ("what just changed").
- **`tui-test` headless-xterm e2e frame-diff testing (ADOPT outright)** — makes the entire TUI bar enforceable in CI; TUI refactors become safe.

*Feature floor (opencode, unchanged from round 1):* leader-key namespace + command palette + which-key; permission engine (allow/ask/deny, last-match-wins globs, `external_directory`, `doom_loop`, `.env` deny-by-default, once/always/reject) with inline syntax-highlighted diffs; subagent session tree with permission/question bubbling to the parent (fixes KOS's stranded-approval failure mode); shadow-git undo; focus-aware attention notifications (refined by droid's two-channel sound design); `@` file references, prompt stash, frecency history. Plus bob's visibility research: per-agent visual identity (colour per authority tier, role pills).

**OK-6 — Fusion is delivered through OpenKai (E016 FU-*), with three upgrades found this round.**
- **FU-4 upgrade:** ruflo's Beta-bandit routing with **per-complexity-bucket priors** (ADR-142) — failures on one task type don't suppress a model globally. E016 specified deterministic-config-first invocation; the bandit is the learned layer above it, fed by FU-5 telemetry.
- **FU-1/FU-2 shape:** prime-agent's **admission-handle subagent protocol** — spawn returns a handle immediately, results arrive via rate-limited `agent_message` replies — is the correct shape for fusion panels that outlive a turn, and matches KOS's handoff-filed dispatch better than call/await.
- **FU-5 accounting:** prime-agent's `child_usage_attributed` transcript entries solve fusion cost attribution at the persistence level.
- **FU-6 offline option:** `ruvllm serve` (or Ollama — equivalent shape) as an optional OpenAI-compatible local lane behind the provider interface. Subprocess + HTTP cost, small-GGUF quality ceiling. Open thread R2-2.
- E016's invariants stand unchanged: self-pairing first, gate-first validation (FU-3) before any self-modification, never replay one model's turns as another's history, never fuse everything, never delegate judgment.
- **Amended 2026-08-18 by OK-9** (`2026-08-18-shift-fusion-orchestration-ADR.md`): shift and fusion are one decision system — shift predicts (tool-signal routing), fusion multiplies (evidence-settled panel rules), the gate verifies (its outcome is the router's reward). Panel rules hardened by the literature (self-pair default, third-party pairwise synthesis, panel of 2); shift graduates from keyword classification to Switchyard's corroborative signal scorer; calibration via the RESCUE/LOSS quadrant method.

**OK-7 — Orchestrator-driven TUI.** Adopt opencode's `/tui/*` remote-control endpoints pattern so KOS dispatch can drive the operator's TUI: prefill a handoff prompt, toast on gate failure, open a diff on completion. This is where fusion stops being invisible.

**OK-8 — Packaging: standalone open-source product, npm package + per-platform binaries, installed into KOS as an auto-upgraded component (RATIFIED Q3/Q4/Q5, §8.1 D3–D5).** OpenKai is **not integrated into the KOS platform or core**. KOS builds only the **control/use/manage layer** — the same lane-driver shape it already has for pi (`docs/design/research/stream-pi-wiring-design.md`): argv/env scrub/parser, plus a component manager that installs and **automatically upgrades** the OpenKai binary. Auto-upgrade mechanics: **droid's dual-channel pattern is the primary template** (round 1.5) — an auto-updating standalone channel (with env kill-switch and org policy, `update --check/--version` including **rollback**) plus an npm build **pinned at build time** for reproducible environments; SHA256-verified binaries on a CDN. prime-agent's channel-aware manifest (`latest.json`/`beta.json` `{version, package, tarball}`, two-phase coordinated update) and ruflo's Ed25519 `verify` (hash installed files, check manifest signature) complete it — witness verification ships **with** the auto-upgrader, since an auto-upgrading component without it is an attack surface. Also adopted from droid: **one config namespace** (`.openkai/` + `~/.openkai/`, documented precedence, legacy migration — never spread), Claude-Code/opencode-format **ecosystem import** as the bootstrap strategy for a late entrant, and droid's hooks wire contract (JSON stdin, typed `permissionDecision`/`updatedInput`, `suppressOutput`) as the documented hooks shape. pi/omp/prime all ship npm + `bun build --compile` per-platform binaries; RuVector adds the per-platform optional-dependency + wasm-fallback + `info` self-check pattern worth copying. Licence: open source (§8.1 D5).

## 5. What we explicitly do NOT do

1. **Do not fork omp or pi source.** Forks are how you inherit 80k lines of someone else's Rust and a permanent merge burden. Libraries or nothing.
2. **Do not adopt ruflo's meta-harness posture** (hook injection into Claude Code). KOS deliberately chose lane-wrapping orchestration with durable dispatch; ruflo's own demo stalled on a completion event. Mine its learning mechanisms, reject its runtime model.
3. **Do not replace Cortex's Postgres store pre-benchmark.** `ruvector-postgres` is intriguing (in-DB embeddings, Cypher, hybrid fusion) but unproven against our workload, its vendor's comparison numbers are retracted fabrications, and pgrx adds a Rust toolchain to every install. Benchmark thread R2-1 first.
4. **Do not add a hard Rust/WASM dependency for v1** (ruvllm crates, WASM kernels, ESP32, OpenTUI's Zig core). All patterns, no linkage.
5. **Do not ship fusion as default.** E016: opt-in per persona/handoff class; 2–3× wall-clock when invoked; children count against the concurrency cap.
6. **Do not claim sandboxing.** prime-agent's honest posture is the model: execution is not a security sandbox; say so.
7. **Do not ship a performance claim without its reproducer script.** Both ruvnet repos were burned by fabricated numbers and retracted publicly. OpenKai's rule from day one.
8. **Do not build remote fleets / federation / cloud sync for v1** (ruflo federation, opencode share service). Single-machine scope; note ruflo's `maxHops` circuit breaker as prior art if this changes.

## 6. Sequencing

| Phase | Contents | Depends on |
|---|---|---|
| **P0** | This ADR + research index; CTO ratification | — |
| **P1** | OpenKai scaffold in its **dedicated repository** (D4): npm workspace, pi-ai + pi-tui deps pinned, Cortex API client, minimal TUI attached to KOS console SSE (read-only observer first). In kaidera-os: only the lane-driver skeleton (control/use/manage) | P0 |
| **P2** | Single-lane agent loop through pi-ai with one provider; session persistence into Cortex (OK-4 trajectory tree); transport abstraction (OK-3) | P1 |
| **P3** | Fusion slice: E016 P1+P2 — gate-first validation (FU-3) then self-pairing + synthesis (FU-1/FU-2) on subscription lanes, delivered via OpenKai runs; admission-handle subagents | P2 |
| **P4** | TUI ergonomics wave: permission engine, subagent tree + bubbling, shadow-git undo, attention system, visual identity | P2 (parallel with P3 possible) |
| **P5** | Learning loops: temporal-decay scoring, trajectory mining (SONA schedule), bandit routing over FU-5 telemetry, lane eval matrix (E015 KL-7) | P3 |
| **P6** | v1 packaging: npm + binaries, channel-aware auto-upgrade manifest + witness verification (OK-8), `info` self-check, install docs, KOS component-manager integration | P3+P4 |

Cross-epic note: OpenKai does not fork E015/E016/E017 — it is the **delivery surface** E017's harness-intelligence slices land on. FU-3 still supersedes E015 KL-1 as previously decided; E017 sequencing (v0.2.002 target) is unchanged by this ADR until CTO ratifies otherwise.

## 7. Consequences

**Positive.** No fork maintenance. Provider matrix and renderer are free and MIT. Memory/fusion differentiation is real and verified absent from every competitor surveyed. The TUI quality bar is a checklist with working prior art. Every adopted mechanism has a cited, production-proven source.

**Negative / accepted costs.** A TypeScript module alongside Python KOS — two toolchains (mitigated: OpenKai talks to KOS over the existing Cortex HTTP API; no Python is rewritten). pi upstream is mid namespace migration (pin versions; watch). pi-tui is a bespoke framework — if it stalls, OpenTUI is the fallback (Q2). Fusion's 2–3× wall-clock and concurrency-cap accounting (E016 §3.4) are inherited unchanged.

**Risks.** (1) Building on fast-moving upstreams (pi 0.84.2, namespace churn) — mitigated by pinning + shrinkwrap. (2) Scope: the research surfaced more patterns than v1 can hold — mitigated by the do-NOT list and P-phases. (3) ruvnet ecosystems' research-grade maturity — mitigated by the patterns-not-dependencies rule. (4) The ADR's P3 fusion slice depends on E014 persona registry landing (currently design-only) for role→model mapping — unchanged from E016.

## 8. Open questions for CTO ratification

All five questions were ratified 2026-08-14. Record kept for provenance.

### 8.1 Ratification record (CTO, 2026-08-14)

- **D1 (was Q1 — language split): ACCEPTED.** OpenKai is a TypeScript module; KOS stays Python; they talk over the Cortex API / lane interface. No Python rewrite.
- **D2 (was Q2 — TUI substrate): pi-tui.** Substrate ratified as `@earendil-works/pi-tui`. Two bars set: **feature bar = omp's TUI** ("omp tui is better actually" — Agent Hub, tool-call cards, option-picker cards, time-travelling stream rules, re-implemented on pi-tui as patterns); **design bar = Factory droid's TUI** ("best from a design point of view" — mined in round 1.5, `2026-08-14-factory-droid-findings.md`). OpenTUI rejected.
- **D3 (was Q3 — product posture): BOTH.** The KOS lane exists regardless — KOS drives OpenKai exactly like its other harness lanes. *And* OpenKai is a standalone, open-source product: not integrated into the KOS platform/core, installed as a component, **upgraded automatically**, usable outside KOS by anyone.
- **D4 (was Q4 — repo split): SPLIT RATIFIED.** OpenKai's codebase lives in a dedicated repository from first scaffold. In kaidera-os, only `research/` remains, plus the KOS-side control/use/manage lane layer (same ownership shape as the pi/codex/claude-code lanes).
- **D5 (was Q5 — licence): OPEN SOURCE.** Flavour presumed MIT (every borrowed component is MIT); confirm the exact licence text at first public push.

### 8.2 Still open

- **R2-3 (bake-off) is closed by D2** — pi-tui ratified, no bake-off.
- ~~Droid TUI design amendment~~ — **landed** (round 1.5): OK-5 rewritten with the droid design bar, OK-3/OK-8 amended with the documented session contract and dual-channel auto-upgrade. See `2026-08-14-factory-droid-findings.md`.

## 9. Sources

The six findings files in `research/` (each with full URL/path citations), the E015/E016 ADRs, the visibility findings doc, and the four local pi-lane research docs listed in `2026-08-14-pi-omp-findings.md` §6. No claim in this ADR rests on memory; every mechanism traces to a cited file or URL in those documents.
