# Intent: finish the OpenKai release — Cortex as the memory, operationally accepted

Author: CTO (operator), relayed through `docs/HANDOFF_KAI_CORTEX_COMPLETION_PLAN.md`. Lead: kai@openkai. Status: accepted 2026-09-04; decisions D0–D6 below are authoritative and build waves are authorised subject to the plan's gates.
Source: operator message 2026-09-04 ("a comprehensive plan for finishing this openkai release … all my instructions on cortex to replace all the omp memory stuff … folded in this delivery"); the handoff above; design v2 `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/MEMORY_CORTEX_DESIGN.md` (the detailed instructions). Date: 2026-09-04.

## Problem
0.1.12 shipped the Cortex client stitch, but the product is not operationally accepted: the four external gates were waived, not run; the operator's own install runs with memory off; and omp's own memory machinery — the `local` rollout-summary pipeline (`memories.*`, `memory://root`, `learned.md`) — still ships beside Cortex, so "Cortex replaces the omp memory" is only half true. The programme record contradicts itself (0.1.11 "release ready" rows, a [0.1.11] changelog top, a tap at 0.1.12 but an installer default at v0.1.009), so agents cannot tell what is shipped, proven, or pending. Hosted Cortex is parked but still described in places as if a settings row made it real.

## Proposed outcome
One accepted programme (E024, release window 0.1.13) after which: every OpenKai memory path runs on Cortex or is off — no omp memory pipeline remains (decision D1); the released client is proven on a fresh host and against an isolated acceptance project with pasted observations for every gate; providers are applied through the real admin plane with a recorded cost/fallback policy; migration, retention and backup boundaries are written and evidenced; hosted Cortex is a named cross-project dependency with acceptance criteria, not an implied feature; and one document is the current authority for Cortex delivery state. Measurable: acceptance matrix rows all carry an observed result; `memory.backend` enum has no omp value left; ledger contradictions are zero.

## Affected users and systems
OpenKai users (memory setting, `/cortex`, `/memory`, `learn`), the openkai roster (evidence discipline), the local Cortex appliance and its registry (an acceptance project is created and destroyed), the KOS installer pin (78f86ec5), Kaidera platform / alpha@kaidera (hosted Cortex), the release channels (npm, GitHub, tap, install.sh, latest.json), the programme ledger.

## Constraints
- The originating handoff authorised planning only. The operator accepted E024 on 2026-09-04; implementation now follows the plan's review, evidence and release gates. [real]
- Cortex stays opt-in; activation is explicit operator consent with a retention explanation. [real — handoff §A, §6]
- Never write synthetic data to the production `openkai` project; never expose `CORTEX_ADMIN_TOKEN` or provider credentials in any artifact. [real — §6]
- Legacy Hindsight/Mnemopi data is neither imported nor deleted silently. [real — design v2 §4]
- RELEASE_SOP: per-version, per-session CTO consent; `bun run release 0.1.N` coordinates every channel. [real]
- Two-repo model + `docs/DEVELOPMENT_PROCESS.md`; worktree per agent; independent review. [real]
- The next unallocated epic/version is E024 / 0.1.13 (E023 = 0.1.11→0.1.12 line, shipped). [assumed from the ledger; confirmed by reconciliation in STATE.md]

## Decisions — CTO, 2026-09-04
1. **D0 — 0.1.12 consent:** explicit consent was given in the live release session. Record this separately from the four external gates that were waived, not passed.
2. **D1 — memory cutover:** retire omp's `local` memory pipeline completely. `memory.backend` becomes `off | cortex`; user files remain untouched.
3. **D2 — legacy data:** no product importer. Document where Hindsight, Mnemopi and local-memory files remain and how users retain access.
4. **D3 — hosted Cortex:** defer behind a cross-project platform contract and acceptance environment; hosted availability does not gate 0.1.13.
5. **D4 — acceptance isolation:** use stable disposable project `openkai-acceptance` with agent `probe`; archive it after every drive and prove production `openkai` is unchanged.
6. **D5 — transcripts:** transcript ingest stays off by default; retention follows the appliance policy surfaced by `cortex-retain --status`.
7. **D6 — clean hosts:** run acceptance on both the KOS test VM and a fresh macOS user account. A missing host or credential blocks its row with evidence; it does not become a synthetic green.

## Grill record
Mode: quick. The operator accepted E024 and made the decisions above in the live 2026-09-04 session. Epic/version allocation remains E024 / 0.1.13; `STATE.md` is the single authority. Next stage: W1 independent review and W2 acceptance drives, followed by the gated build waves.
