# EVALUATION — Fork-and-differentiate (omp base + fusion/switchyard/RLM core)

**Date:** 2026-08-22 · **Author:** ren@openkai (CPO) · **Status:** FOR CTO DECISION
**Trigger (CTO, 2026-08-22):** "the tooling and functionality we want is closer to
omp — I rather fork the omp line… pick up the existing code in the harnesses we
learn from, cherry-pick their code, make them come together as one application,
apply our UI/UX, and focus on fusion and switchyard with RLM at its core."
**Research inputs:** OMP fork mechanics (licence/runtime/extension seams),
prime-agent RLM research, jcode research — all this session, evidence-cited below.

---

## 1. The CTO's premise, tested

"Most things don't work; the code is not the quality to work and ship."

The lived evidence supports the direction of the charge even where the letter
overstates it: 0.1.9 shipped with 467/467 tests and a clean audit, but the
operator-facing record this week was three crash classes (theme-auto stdin kill,
hub kills, the unresolved mouse report), a broken `--check` that mutated the
install, and an output structure that needed a rescue restructure. The pattern
behind every one of those: **we were rebuilding harness plumbing that mature
harnesses already have.** OMP's editor is 137KB of edge cases we've never seen;
their markdown renderer is 115KB; their agent loop 112KB with steering, aside
messages, and interrupt handling ours lacks. Each week spent re-deriving that
is a week not spent on the differentiators.

The premise holds where it matters: our scarcest resource is focus, and we're
spending it on commodity plumbing.

## 2. The options

### Option A — stay the course (own tree, pi-0.84 line)
Keep building on our codebase over the frozen pi-0.84.2 dependency line.

- **For:** zero migration risk; the 0.1.9 line is green and shipped.
- **Against:** every future pi/omp improvement must be hand-ported; the
  plumbing debt that produced this week's crashes stays ours; the v18 line
  (which fixed several of our open items) is unreachable (bun-runtime-only,
  proven twice this session).

### Option B — fork omp wholesale, port the differentiators (the CTO's direction)
Fork `can1357/oh-my-pi` (MIT — copyright Mario Zechner / Can Bölük / Stencil
Labs; no NOTICE burden beyond the MIT header). OpenKai becomes a maintained
fork: their agent loop, TUI, tools, permissions engine, plugin system — plus
our layer: fusion, switchyard routing, the RLM pattern, our brand.

- **For:** the entire "most things don't work" category is inherited solved —
  turn lifecycle, loader/shimmer, tool cards with live states, streaming
  markdown with incremental highlighting, bash.patterns permissions, settings
  schema, extensions/plugins, LSP/DAP, Rust-native tools. Verified extension
  seams for exactly our layer (see §3). Bun runtime is fine — our standalone
  channel is already bun-compiled, and omp ships the same way (brew binary,
  curl installer, npm package — all bun-runtime).
- **Against:** (1) we now own a ~500K-line foreign codebase — every bug in it
  is ours to read; (2) upstream moves fast — we must choose: track upstream
  (merge cadence cost, forever) or cut loose (no more free fixes); (3) our
  working machinery must be ported onto their seams — real but bounded work
  (§3 table); (4) their permission engine differs from our deny-floor posture
  — merging the two needs care (ours is stricter; theirs is more complete).

### Option C — fork prime-agent (RLM-native) instead
prime-agent is a pi-line harness with the RLM model built in (persistent
IPython kernel + `rlm()` recursive subagent callable + host bridge).

- **For:** RLM is literally at its core; MIT; daemon topology + idempotent
  journal + generation cursors are the best multi-agent substrate researched.
- **Against:** it sits on the SAME frozen pi-0.84 line we just proved is a
  dead end (`@earendil-works/*` deps in its package.json); its TUI/UX is far
  behind omp's; and the RLM model (model-codes-Python-in-a-kernel) is a
  different product grammar than our tool-call harness — adopting it is a
  product redesign, not a port.

## 3. The port map (omp fork mechanics research, verified seams)

| Our layer | Lands on omp's seam | Effort |
|---|---|---|
| fusion panel/synthesis | `CustomTool` + `renderCall/renderResult` + `ExtensionUIContext.setWidget` | 2-3d |
| fusion gate | `ToolApproval` tiers + `SoftToolRequirement` | 1d |
| bandit + calibrate | `ModelRegistry` + `model-resolver.ts` hooks | 2d |
| shift tier routing (orchestrate.ts) | `ModelRole` system + `ServiceTierByFamily` | 2-3d |
| deny floor (stricter than theirs) | `AgentBeforeModelCall` + capability rule | 1d |
| served TUI (host/hub/ws) | `Extension` with `onStart` + their daemon pattern | 2-3d |
| magic keywords | settings schema + hook | 1d |
| provider write path | their `model-resolver`/`config` surfaces | 1d |
| brand (Kaidera theme, splash, chips) | their theme tokens + footer/status factories | 2d |

**Total port: ~2 weeks to parity, then differentiation-only.** (The research
estimate of "3-5 days" is optimistic; the honest number includes the test
discipline we hold.)

### What we deliberately keep of theirs, untouched
agent-loop, editor, markdown streaming, loader, permission engine
(bash.patterns included), plugin marketplace, hooks, extensions, config
system, model catalogue (60+ providers), Rust native tools.

### What we discard of ours on the fork
Our transcript/status/composer/settings/pickers (theirs are better),
our InProcessTransport (theirs subsumes it), our permission gate EXCEPT the
deny floor (ported as a stricter layer), our release machinery (port the
SOP + channels: their release.yml shape differs).

### RLM "at the core" — the honest reading
RLM (prime-agent) = recursive LM via a persistent IPython kernel with `rlm()`
as a first-class callable. Taken literally it is a different product grammar
(kernel-code over tool-calls). The CTO's intent — fusion/switchyard with RLM
at the core — maps better as: **our orchestration layer (fusion panel +
switchyard routing) gains the recursive-delegation pattern**: the fusion panel
can spawn child runs (`rlm()`-style admission handles + usage attribution +
generation cursors — all researched, MIT) so panels recurse and route per
tier. That lands on omp's base as a custom tool + host bridge, without the
kernel grammar. If the CTO means literal IPython-kernel RLM, that is Option
C's product redesign and should be said so explicitly.

### jcode's contribution (research, not code)
Rust codebase — patterns only: the **memory graph** (petgraph + ONNX
embeddings + cascade BFS retrieval) and **swarm file-shift detection**
(notify agents when a file they read is edited by another) are the two
mechanisms worth porting into the fusion/multi-agent layer later (E022+).

## 4. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Upstream divergence (omp ships weekly) | Pin a base tag (v18.0.0); upstream-merge reviews monthly, not continuously; our layer lives behind their extension seams so merges stay mechanical |
| Owning 500K foreign lines | The port map keeps our edits scoped to extensibility surfaces; upstream code stays pristine (git subtree/fork discipline — never edit their agent-loop) |
| Our release channels (4 + signed standalone) | Port the SOP + signing to the fork's build (their build-binary.ts is close to ours) |
| Test discipline (467 tests) doesn't transfer | Our behavioural test suite ports against the fork's surface (the contracts, not the components) |
| Losing the current line mid-flight | The 0.1.9 line stays maintained (dogfood campaign continues); the fork proves out on a spike branch before any switch |

## 5. Recommendation

**Adopt Option B — fork omp — as a timeboxed spike before full commitment:**
two weeks to a fusion-on-fork proof (fusion panel + tier chip + brand theme
running on the fork, driven by our orchestrator through their model-resolver
seam). Kill criteria: if the seam evidence above proves wrong in practice, or
the port estimate doubles, we fall back to Option A with the backlog intact.
The spike answers with code what research answered with files.

RLM lands as the recursive-delegation pattern inside fusion (Option B's
grammar), unless the CTO means the literal IPython-kernel model — which would
be Option C's redesign and a different conversation.

## 6. If the spike passes — the phased plan

| Phase | Content | Gate |
|---|---|---|
| F0 | Fork + brand + build/channel port (brew/standalone/install.sh/signing) | `openkai`-branded fork installs and passes a smoke suite |
| F1 | Fusion + gate + bandit on their seams | fusion panel runs; verdicts render in their cards |
| F2 | Switchyard routing via model-resolver; our Orchestrator drives their ModelRoles | tier decisions live in their status line |
| F3 | Deny-floor + served TUI + magic keywords | parity with 0.1.9's trust surface |
| F4 | RLM recursion (admission handles + usage attribution) in fusion | panels recurse; usage folds up |
| F5 | Dogfood the fork; cutover decision; the old line enters maintenance | CTO call |

## 7. Decision requested

1. Option B fork — yes/no (recommendation: yes, as the F0-F1 spike).
2. RLM reading: recursive-delegation-in-fusion (recommended) or literal
   kernel RLM (Option C redesign).
3. The current line during the spike: maintenance-only (recommended).
