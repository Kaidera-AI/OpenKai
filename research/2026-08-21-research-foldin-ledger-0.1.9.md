# Research fold-in ledger — 0.1.9 consolidation

**Date:** 2026-08-21 · **Author:** ren@openkai (CPO) · **Status:** CURRENT
**Method:** every research doc's "mine/take/adopt" list cross-referenced against the
shipped tree (Program/FEATURE_REGISTRY.md + packages/cli/src + packages/core/src).
"Shipped" claims verified against code, never assumed.
**The two 0.1.9 folds from this ledger LANDED at `505c630`** (doom-loop guard +
session-log invariant test).

| research doc | recommendation | status | evidence / parking note | 0.1.9-fit? |
|---|---|---|---|---|
| README (index) | R2-1: benchmark ruvector-postgres vs pgvector | PARKED | "evaluate, don't commit. Needs pgrx build + our real data" (README §5); ADR §5.3 "Do not replace Cortex's Postgres store pre-benchmark" | no — research task, KOS-side |
| README | R2-2: ruvllm serve vs Ollama offline FU-6 lane | SHIPPED | resolved via Ollama: core/ollama.ts + registry row 0.1.7 | — |
| README | R2-4: mine omp metaharness/snapcompact/mnemopi fork-code | OPEN | "Identified, not yet mined in depth" (README §5) | no — research only |
| README | R2-5: ruflo federation trust scoring + maxHops | PARKED | "Out of scope (single-machine) but prior art if multi-machine lands" | no |
| README | R2-6: ACP as editor-embedding surface | OPEN | "Both lineages ship it; unscoped" | no — new surface |
| ruflo-findings §5 | ruflo as a dependency | REJECTED | host-integrated plugin ecosystem, not embeddable | — |
| ruflo-findings §5 | Hook-registry pattern (priority bands, route/explain/metrics) | PARTIAL | transparency half shipped (/shift ledger + decision_source, 0.1.7); the middleware chain itself = OK-11 waterfall events → E020 | no — E020 |
| ruflo-findings §5 | ReasoningBank RETRIEVE→JUDGE→DISTILL | PARKED | registry: "SONA mining — KOS-side, post-v1 by design (E001 Inc 07)" | no |
| ruflo-findings §5 | Beta-bandit routing, per-complexity priors | SHIPPED | fusion/bandit.ts 0.1.1; gate→bandit writeback in orchestrate.ts 0.1.7 | — |
| ruflo-findings §5 | Task-handoff payload schema | OPEN | KOS-side handoff lane; no in-tree surface | no |
| ruflo-findings §5 | Federation trust scoring + budget circuit breaker | PARKED | "out of OpenKai's current scope" | no |
| ruflo-findings §5 | verify-style witness signing for builds | SHIPPED | signed standalone channel + sidecars + rollback (0.1.8) | — |
| ruflo-findings §5 | Mode A/B benchmark methodology + mandated reproducers | SHIPPED | standing rule ADR §5.7; OK-9.5 calibration discipline | — |
| ruflo-findings §5 | WASM sandbox / 323-tool MCP / marketplace / web UIs | REJECTED | weight without payoff | — |
| ruvector-findings §5 | ruvector-postgres as pgvector replacement | PARKED | benchmark candidate only (R2-1); vendor numbers retracted as fabricated | no |
| ruvector-findings §5 | Temporal decay + coherence gating over pgvector | PARKED | registry: KOS-side, post-v1 | no |
| ruvector-findings §5 | AgenticDB typed memory + witness-log hash chaining | PARKED | same row | no |
| ruvector-findings §5 | Learning-from-outcomes-only | PARTIAL | honoured in the fusion loop (gate outcome = only reward); memory-side KOS/parked | no |
| ruvector-findings §5 | ruvector-core embedded store | REJECTED | Cortex is Postgres-centralised | — |
| ruvector-findings §5 | SONA MicroLoRA/GNN rerank/RVF/Raft/mcp-brain | PARKED | revisit at v2 | no |
| ruvector-findings §5 | npm/napi distribution + readonly MCP profile + env allow/deny | PARTIAL | npm+binaries+channels shipped 0.1.8; readonly-profile/env-policy MCP surface not built | no |
| ruvllm-findings §5 | SONA three-loop learning as Cortex jobs | PARKED | KOS-side post-v1 | no |
| ruvllm-findings §5 | Federated quality-gated trajectory aggregation | PARKED | same | no |
| ruvllm-findings §5 | Semantic tool-result cache | PARKED | same | no |
| ruvllm-findings §5 | LlmBackend trait | REJECTED | pi-ai adopted instead | — |
| ruvllm-findings §5 | Reflection wrapper + ErrorPatternLearner | PARTIAL | retry-with-error-context shipped (FU-3 gate verbatim feedback); learned error-pattern→routing not built | no — learned half later |
| ruvllm-findings §5 | FastGRNN 5-head session-persistent router | PARKED | idea partially realised by bandit routing | no |
| ruvllm-findings §5 | lattice-embed / WASM browser inference / ESP32 / Metal-ANE | REJECTED | scope/MSRV/kernel R&D | — |
| prime-agent-findings §5 | Adopt @earendil-works/pi-ai | SHIPPED | provider substrate 0.1.1 | — |
| prime-agent-findings §5 | models.dev catalogue generation | SHIPPED | via pi-ai catalogue; provider completeness diff 0.1.7 | — |
| prime-agent-findings §5 | Adopt pi-agent-core loop (steer/follow-up/hooks) | SHIPPED | pinned 0.84.2; steer-while-busy 0.1.7 | — |
| prime-agent-findings §5 | pi-tui | SHIPPED | P4a substrate | — |
| prime-agent-findings §5 | Daemon supervisor topology (leases, generation cursors, command journal) | PARTIAL | sessions-outlive-terminal via `openkai serve` + WS attach (0.1.7); cursors + journal not built | no — later |
| prime-agent-findings §5 | Kernel host-bridge (ZeroMQ/dill/fork-server) | REJECTED | no Python kernel lane | — |
| prime-agent-findings §5 | Admission-handle subagents + child-usage attribution | OPEN | P3 §5: arrives when fusion panels outlive a turn; none in tree | no — fusion epic |
| prime-agent-findings §5 | Extension system (jiti, registerProvider, npm/git) | OPEN | skills/mcp management shipped 0.1.5; full runtime = E022/E023 | no |
| prime-agent-findings §5 | Extension SDK surface | PARTIAL | SessionTransport v2 + serve/attach is our contract; no published SDK package | no |
| prime-agent-findings §5 | prime-agent-runtime Python shim / harness ledger | REJECTED | Cortex exceeds the JSON-ledger | — |
| prime-agent-findings §5 | Telemetry opt-out / R2 self-update | REJECTED | Prime-Intellect-specific plumbing | — |
| opencode-tui-findings §5 | Client/server transport abstraction | SHIPPED | SessionTransport + InProcessTransport + WS attach | — |
| opencode-tui-findings §5 | SSE hygiene (connected/heartbeat/ascending IDs/sentinel) | SHIPPED | protocol v1→v2; attach hello replay | — |
| opencode-tui-findings §5 | Field-addressed deltas | SHIPPED | SessionEvent delta with field discriminator | — |
| opencode-tui-findings §5 | Client mirror store + 16ms batching | SHIPPED | headless-host coalesced pump | — |
| opencode-tui-findings §5 | OpenTUI as dependency | REJECTED | ratification D2: pi-tui | — |
| opencode-tui-findings §5 | models.dev catalogue + config-loaded provider packages | PARTIAL | catalogue shipped; provider-as-npm-config loader not built | no |
| opencode-tui-findings §5 | Permission engine wholesale | **SHIPPED (0.1.9)** | engine + deny floor + persisted approvals + session/project always-stops (0.1.7); **doom_loop landed 505c630**; external_directory deliberately NOT (deny-by-containment stays) | — |
| opencode-tui-findings §5 | Shadow-git snapshot undo | SHIPPED | core/undo + /undo /diff 0.1.1 | — |
| opencode-tui-findings §5 | Child-session tree nav + permission bubbling | OPEN | task children are read-only; nothing to bubble yet | no — needs tool-using children |
| opencode-tui-findings §5 | /tui/* remote-control endpoints | PARTIAL | rw attach covers drive; REST verbs (prefill/toast/open-dialog) not built | no |
| opencode-tui-findings §5 | Attention/notification system | SHIPPED | attention.ts focus-aware bell/OSC | — |
| opencode-tui-findings §5 | Session sharing via hosted service | REJECTED | hosted sync + privacy posture out of scope | — |
| opencode-tui-findings §5 | Markdown agents with permission frontmatter | PARTIAL | skills shipped 0.1.5; frontmatter uniformity not built | no |
| opencode-tui-findings §5 | --mini degraded terminal mode | OPEN | never scoped | no — new surface |
| opencode-tui-findings §4 | The 22-pattern UX floor | SHIPPED | P4/P4b/remainder + E017 waves; residuals as own rows | — |
| pi-omp-findings §5 | pi-ai / pi-tui / pi-agent-core as deps | SHIPPED | ratified ADR §3 option 2 | — |
| pi-omp-findings §5 | pi-coding-agent SDK wholesale | REJECTED | P2 chose pi-agent-core only | — |
| pi-omp-findings §5 | Session JSONL v3 tree + retainedTail compaction | SHIPPED | session-store v3 trees + forkAtEntry; LLM compaction 0.1.7 | — |
| pi-omp-findings §5 | pi/omp extension API shape | OPEN | folds into E022/E023 | no |
| pi-omp-findings §5 | omp marketplace pattern | OPEN | plugin distribution = E023 | no |
| pi-omp-findings §5 | omp fork code as dependency | REJECTED | mine as design reference (R2-4) | — |
| pi-omp-findings §5 | pi-protocol CBOR remote sessions | REJECTED | handoff-filed dispatch covers it | — |
| factory-droid §6 | #1–#9, #11, #12, #15–#20 (tokens, grammar, density, chrome, modes, /btw, esc-tiers, bash mode, mermaid, changelog, tui-test, distribution, daemon contract, autonomy axis, tier subagent routing, config namespace) | SHIPPED | registry rows across 0.1.x waves | — |
| factory-droid §6 | #9 background /fork + resume receipt | PARTIAL | /fork picker + /tree shipped; background fork + receipt line not built | no — small new UX |
| factory-droid §6 | #10 droid search verb | REJECTED | retired by CTO 2026-08-19 | — |
| factory-droid §6 | #13 two-channel sound packs | PARTIAL | focus-aware bell/OSC shipped; per-event packs not built | no |
| factory-droid §6 | #14 i18n | REJECTED | no demand signal | — |
| factory-droid §6 | #21 Claude Code ecosystem import | PARTIAL | MCP/skills shipped; plugin-layout import not built | no — E023-adjacent |
| factory-droid §6 | #22 hooks protocol | OPEN | = OK-11 waterfall events → E020 | no — E020 |
| factory-droid §6 | #23 cloud sync / #24 credit multipliers | REJECTED | Factory-cloud-coupled | — |
| factory-vfs-findings | CoW overlay mutation staging | PARKED | post-v1; changes consent semantics | no |
| factory-vfs-findings | Session teleport (pack/adopt) | PARKED | post-v1, pairs with KOS handoffs | no |
| factory-vfs-findings | @microsoft/tui-test | SHIPPED | devDep + e2e suites | — |
| factory-vfs-findings | plugins/skills ecosystem import | PARKED | post-v1 | no |
| switchyard-findings (08-16) | Signal-driven routing / fallback chains / telemetry | SHIPPED | shift/*; superseded doc kept for provenance | — |
| switchyard-findings (08-16) | Protocol translation / proxy topology / launcher | REJECTED | pi-ai covers providers; in-process | — |
| p2-agent-loop-scope | chat/transport/persistence | SHIPPED | registry 0.1.1 rows | — |
| p2-agent-loop-scope §7 | turn-windowed source_kind ingest shards | OPEN | perf follow-up, only when hot | no |
| p3-fusion-scope | FU-1/FU-2/FU-3 + telemetry | SHIPPED | fusion/*; registry FU-1..5 | — |
| p3-fusion-scope §5 | Admission handles / tool-using roles | PARTIAL | FU-4 policy + report shipped; roles completion-based today | no — fusion epic |
| p4-tui-scope §7 | permission engine / undo / attention / palette / mermaid / onboarding / changelog / stash / /btw | SHIPPED | registry rows | — |
| p4-tui-scope §7 | subagent tree + bubbling; /fork receipts | OPEN/PARTIAL | tracked as own rows | mixed |
| p4b-permission-scope §7 | doom_loop repeat-call detection | **SHIPPED (0.1.9)** | permission-gate.ts noteDoomLoop; 505c630 | — |
| p4b-permission-scope §7 | external_directory prompts | OPEN | deferred; deny-by-containment stays (deliberate) | no — deny→ask semantic change |
| p4b-permission-scope §7 | syntax-highlighted diffs in overlay | PARTIAL | word-level paired diff rows 0.1.7 cover the value | weak — render polish |
| p4b-permission-scope §7 | persisted/config rules; autonomy axis; rewind; frecency; leader-key | SHIPPED | registry | — |
| p4b-remainder-scope §1 | attention / role pills / palette / stash / /btw / /undo | SHIPPED | registry | — |
| p4b-remainder-scope §4 | subagent tree navigation | OPEN | needs tool-using children | no |
| e015-integration-review | K3 deviations + gaps 1–8 (S1–S5) | SHIPPED | E017 increments 01–08, 0.1.7 | — |
| e015-integration-review §1 gap 9 | Switchyard handoff notes / per-tier system prompts | OPEN | never dispositioned | no — backlog |
| kos-capability-fusion | Prefill-activation router | PARKED | needs owning the vLLM stack | no |
| kos-capability-fusion | LLM capability judge on the hot path | PARKED | off by default; break-even meter shipped so the park is instrumented | no |
| kos-capability-fusion | Panel size >2 / debate rounds | REJECTED | evidence says they degrade (OK-9.6.3) | — |
| switchyard-deep-dive | Per-STEP routing granularity (CogRouter) | PARKED | stage level is right today | no |
| shift-fusion-ADR (OK-9) | W1–W8 | SHIPPED | all 0.1.7 | — |
| shift-fusion-ADR OK-9.6 | six do-not-builds | REJECTED | evidence-cited | — |
| served-tui-ADR (OK-10) | Served TUI over WS attach | SHIPPED | 0.1.7 + attach protocol doc | — |
| served-tui-ADR §7 | 11.5 KOS grid consumes the served surface | OPEN | KOS-side (kai@kaidera-os) | no — KOS repo |
| deepseek-ADR / folding plan | OK-11 phases 0–4 | PARTIAL | Phase 0 SHIPPED at 505c630 (session-log invariant); Phases 1–4 → E020–E023 per the plan | no — phased |
| deepseek-ADR §7 | Cordis dependency Phase 1–2 / full sandboxing / dsh YAML verbatim | REJECTED/PARKED | decision gate at Phase 3 | — |

## Folded into 0.1.9 (landed `505c630`)

1. **doom_loop guard** — the last missing opencode permission semantic; same gated
   call 3× consecutively forces the ask path through every auto-approval layer.
2. **Session-log invariant contract test** — OK-11 Phase 0, plan-designated:
   "model-visible means logged" pinned over a scripted turn.

## Explicitly queued (not 0.1.9)

- **E020 (0.1.10):** waterfall events middleware + inbox pattern (ruflo hook-registry,
  factory #22 hooks protocol, omp extension API shape all converge here).
- **E021 (0.1.11):** turn-enclosure obligation ledger (the model half of "did it
  finish" — the UI half shipped in 0.1.9's settled row).
- **E022 (0.1.12):** capability seams + the 100-line container; Cordis decision gate.
- **E023 (0.1.13):** PluginLoader + plugins.yml + hot reload; marketplace/import
  patterns land here.
- **Fusion epic:** admission-handle subagents, child-usage attribution, tool-using
  roles, panel-outlives-turn (P3 §5 + prime-agent rows).
- **Served-surface hardening:** generation-fenced cursors + command journal
  (prime-agent daemon topology's unbuilt half).
- **Backlog (no epic yet):** e015 gap 9 (handoff notes / per-tier system prompts),
  p2 §7 ingest shards (perf, only when hot), /fork receipts, sound packs, --mini.

## Design elements open (from the 2026-08-21 gap audit)

Not folds — 0.1.10+ design surface: explicit responsive layout matrix
(narrow/standard/wide/short), optional context drawer on wide screens, Kaidera as
the default theme contract, NO_COLOR/16-colour/ASCII/a11y fallbacks, delayed busy
animation for fast ops + render coalescing, size/capability test matrix.
