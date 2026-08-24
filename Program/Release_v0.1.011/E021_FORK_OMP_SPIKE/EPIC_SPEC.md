# EPIC SPEC — E021: the omp fork spike — OpenKai on omp's base

**Epic:** E021_FORK_OMP_SPIKE
**Release:** v0.1.011 (0.1.11 — the fork's first public release; ships ONLY on
explicit CTO consent per docs/RELEASE_SOP.md)
**Owner:** kai@openkai (lead) · **spike lead: ren@openkai (CPO)**
**Opened:** 2026-08-22 · **Decision:** CTO 2026-08-22 ("lets go with
recommendation, lets start working on the fusion and the RLM; for memory, stick
with Cortex")
**Basis:** research/2026-08-22-fork-omp-evaluation.md (options, port map, risks)

---

## 1. Goal

Prove, in code and in two weeks, that OpenKai's differentiators run on omp's
base: **fusion + switchyard routing + the RLM recursion pattern, with Cortex
as the memory layer, Kaidera UI/UX on top.** If the spike passes its gates,
OpenKai's future is a maintained fork of `can1357/oh-my-pi` (MIT). If it
fails its kill criteria, we fall back to the 0.84 line with the backlog
intact and nothing lost but two weeks.

## 2. Architecture (decided)

```
can1357/oh-my-pi (fork base, pinned tag v18.0.0)
├── UNTOUCHED (upstream, merge-cadence monthly):
│   agent-loop, editor, markdown streaming, loader, permission engine
│   (bash.patterns), plugin marketplace, hooks, extensions, config system,
│   model catalogue, Rust native tools, LSP/DAP
└── OPENKAI LAYER (ours, behind their extension seams):
    ├── openkai/fusion        → CustomTool + renderCall/renderResult + widgets
    ├── openkai/shift         → ModelRole drivers via model-resolver hooks
    ├── openkai/orchestrate   → the Orchestrator (posture/pins/latch/cascade)
    ├── openkai/rlm           → recursive delegation: admission handles,
    │                           usage attribution, generation cursors
    ├── openkai/cortex-memory → the memory layer (see §5)
    ├── openkai/gate-floor    → deny floor as AgentBeforeModelCall rule
    ├── openkai/served        → hub + headless host as an Extension
    ├── openkai/keywords      → magicKeywords settings + hook
    └── openkai/brand         → Kaidera theme, splash, chips, footer
```

RLM lands as the recursion PATTERN (decided with CTO): admission-handle child
runs (`rlm()`-style handles + usage attribution + generation cursors, from the
prime-agent research) inside the fusion layer — panels can recurse, and child
usage folds up into the parent turn. NOT prime-agent's IPython-kernel grammar.

## 3. Phases, deliverables, gates

| Phase | Content | Deliverable | Gate (measurable) |
|---|---|---|---|
| **F0** — fork + brand + build | Fork `can1357/oh-my-pi` at tag v18.0.0 into `kaidera-ai/openkai`; LICENCE headers retained; Kaidera theme + splash + chips; our 4-channel build (npm lockstep shape, brew, standalone-signed, install.sh) against their build-binary.ts | branded fork builds and installs via all four channels | fresh install passes a 10-drive smoke (boot, prompt, tool call, overlay, settings) on macOS |
| **F1** — fusion on seams | fusion panel/synthesis/gate as a CustomTool with our cards; bandit reward loop wired through their ModelRegistry; calibrate reads their usage entries | `/fuse` runs the panel in the fork's TUI; verdicts render in their cards; bandit posterior moves on a gated run | fusion e2e: two-model panel + judge verdict + gate pass on a scripted task |
| **F2** — switchyard routing | our Orchestrator drives their ModelRole slots; tier chip in their status line; posture/pins from config | tier decisions visible live in the fork's status line; pins clamp | orchestrate test-suite ported to the fork's resolver |
| **F3** — trust surface | deny floor (stricter layer over their engine), permission overlays with our denial rows, served TUI (hub + headless host as an Extension), magic keywords | deny floor holds against the 0.1.9 repro suite; an rw attach drives a fork session | security-audit equivalent of the 0.1.9 gate green on the fork |
| **F4** — RLM recursion | admission-handle child runs from the fusion panel; usage attribution folds up; generation-cursor replay on reconnect | a panel spawns a child run; the parent turn carries attributed child usage; resume replays correctly | recursion test: parent/child attribution exact |
| **F5** — dogfood + cutover decision | the fork as `openkai-next-fork`; two-week dogfood; cutover decision; the 0.84 line to maintenance | CTO cutover decision recorded | decision recorded |

**Kill criteria (any one ⇒ fall back to Option A):** a seam in the port map
proves false in practice (the extension surface cannot carry the layer);
fusion e2e cannot go green inside 3 days of F1; merge-cadence against
upstream proves unmanageable inside one monthly cycle.

## 4. What runs parallel (the 0.84 line)

E020 (0.1.10) ships as the last full release on the current line, then
maintenance-only: security/crash fixes. The dogfood campaign continues there
until F5's cutover decision.

## 5. Cortex memory — the plan

Cortex stays the memory layer (CTO decision). The fork's memory surfaces
(their `~/.omp/agent` state, session stores) stay as-is for their internals;
OpenKai's memory semantics ride Cortex via their capability seam:

- **F1**: `openkai/cortex-memory` registers a capability provider exposing
  Cortex recall/record to the agent (tool surface: `cortex_search`,
  `cortex_record`), plus a `persistMode` setting (local|cortex, mirroring
  0.1.9's).
- **F2**: routing/running telemetry flows to Cortex (the activity ledger
  concept carries over; the fork's event stream feeds it).
- **Upgrade plan (if needed, planned not promised)**: jcode's memory-graph
  ideas (typed edges, cascade retrieval over the vector store) are Cortex-side
  candidates for a later epic — no schema change during the spike; the spike
  uses the existing cortex-api surface only.

## 6. Risks (from the evaluation, with owners)

1. Upstream divergence — pin v18.0.0; monthly merge review (kai).
2. Owning a ~500K-line foreign tree — edits confined to the openkai/ layer;
   upstream pristine (ren).
3. Release machinery port — SOP + signing against their build-binary.ts (ren).
4. Test-discipline transfer — behavioural contracts port, not component tests
   (ren).
5. bun-runtime for npm channel — matches omp's own shipping model; README
   states bun requirement plainly (kai).

## 6b. Spike log

- **F1 (2026-08-22): LANDED.** The openkai/ layer runs on the fork: fusion
  core ported (pi-18 type map), the fusion CustomTool + /fuse command +
  cortex_search/cortex_record (managed-mode only) self-register through omp's
  capability registry, and the e2e gates pass (openkai-fusion.test.ts +
  openkai-registration.test.ts, 4/4). Fork builds with the layer; the one
  upstream suite failure observed (StatusLineComponent VCS watcher) reproduces
  on pristine upstream — pre-existing, not ours. Next: F2 (switchyard routing
  via model-resolver).

- **F0 (2026-08-22): LANDED.** Fork mirrored with full history
  (kaidera-ai/openkai-fork, private), pinned at v18.0.0 on `spike/f0-foundation`.
  `bun install && bun run build` green on macOS (cmake required for the Rust
  natives — installed). Binary runs (`omp/18.0.0`). Brand pass: kaidera-dark/
  kaidera-light themes in their schema, set as the fork's default; the
  `openkai/` layer scaffold + FORK.md discipline (upstream pristine, sanctioned
  touch-list = theme files only). Next: F1 (fusion as a CustomTool +
  cortex-memory capability provider).

## 7. Exit criteria for the spike (F0-F1)

1. F0 and F1 gates green on the spike branch.
2. The cutover decision can be made on evidence: parity list (what the fork
   does BETTER than 0.1.9, what 0.1.9 still does better).
3. This epic's spec updated with the spike's findings ledger.
