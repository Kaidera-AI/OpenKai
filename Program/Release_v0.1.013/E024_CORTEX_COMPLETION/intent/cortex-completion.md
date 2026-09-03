# Intent: finish the OpenKai release — Cortex as the memory, operationally accepted

Author: CTO (operator), relayed through `docs/HANDOFF_KAI_CORTEX_COMPLETION_PLAN.md`. Lead: kai@openkai. Status: accepted 2026-09-04 (CTO: "yes to you" — recommendations D0–D6 accepted; build waves W3+ authorised on the plan's gates).
Source: operator message 2026-09-04 ("a comprehensive plan for finishing this openkai release … all my instructions on cortex to replace all the omp memory stuff … folded in this delivery"); the handoff above; design v2 `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/MEMORY_CORTEX_DESIGN.md` (the detailed instructions). Date: 2026-09-04.

## Problem
0.1.12 shipped the Cortex client stitch, but the product is not operationally accepted: the four external gates were waived, not run; the operator's own install runs with memory off; and omp's own memory machinery — the `local` rollout-summary pipeline (`memories.*`, `memory://root`, `learned.md`) — still ships beside Cortex, so "Cortex replaces the omp memory" is only half true. The programme record contradicts itself (0.1.11 "release ready" rows, a [0.1.11] changelog top, a tap at 0.1.12 but an installer default at v0.1.009), so agents cannot tell what is shipped, proven, or pending. Hosted Cortex is parked but still described in places as if a settings row made it real.

## Proposed outcome
One accepted programme (E024, release window 0.1.13) after which: every OpenKai memory path runs on Cortex or is off — no omp memory pipeline remains (decision D1); the released client is proven on a fresh host and against an isolated acceptance project with pasted observations for every gate; providers are applied through the real admin plane with a recorded cost/fallback policy; migration, retention and backup boundaries are written and evidenced; hosted Cortex is a named cross-project dependency with acceptance criteria, not an implied feature; and one document is the current authority for Cortex delivery state. Measurable: acceptance matrix rows all carry an observed result; `memory.backend` enum has no omp value left; ledger contradictions are zero.

## Affected users and systems
OpenKai users (memory setting, `/cortex`, `/memory`, `learn`), the openkai roster (evidence discipline), the local Cortex appliance and its registry (an acceptance project is created and destroyed), the KOS installer pin (78f86ec5), Kaidera platform / alpha@kaidera (hosted Cortex), the release channels (npm, GitHub, tap, install.sh, latest.json), the programme ledger.

## Constraints
- Planning only from this intent: no build, no test memories in `openkai`, no publish/tag/channel change. [real — handoff §Stage]
- Cortex stays opt-in; activation is explicit operator consent with a retention explanation. [real — handoff §A, §6]
- Never write synthetic data to the production `openkai` project; never expose `CORTEX_ADMIN_TOKEN` or provider credentials in any artifact. [real — §6]
- Legacy Hindsight/Mnemopi data is neither imported nor deleted silently. [real — design v2 §4]
- RELEASE_SOP: per-version, per-session CTO consent; `bun run release 0.1.N` coordinates every channel. [real]
- Two-repo model + `docs/DEVELOPMENT_PROCESS.md`; worktree per agent; independent review. [real]
- The next unallocated epic/version is E024 / 0.1.13 (E023 = 0.1.11→0.1.12 line, shipped). [assumed from the ledger; confirmed by reconciliation in STATE.md]

## Open questions
1. D1 — retire omp's `local` pipeline entirely (memory = `off | cortex`)? Owner: CTO. Recommendation: yes ("replace all the omp memory stuff"); the handoff text kept `local` as an offline fallback — the CTO's word decides.
2. D0 — record the 0.1.12 consent: no consent line exists in the ledger for 0.1.12 while RELEASE_SOP requires one per version. Owner: CTO (confirm consent was given in the live session that shipped it, or record the exception).
3. D2 — legacy export/import as a product capability? Owner: CTO. Recommendation: no; document discovery/retention.
4. D3 — hosted Cortex in 0.1.13? Owner: CTO + alpha@kaidera. Recommendation: deferred with acceptance criteria until the platform contract and environment exist.
5. D4 — acceptance project key/agent for drives: `openkai-acceptance` / `probe`, created and destroyed per drive. Owner: kai. Recommendation: yes.
6. D5 — who runs the clean-host drive and on what host (kos-test VM, or a fresh macOS user account)? Owner: CTO.

## Grill record
Mode: quick (the operator's instructions are detailed; the genuine decisions are D0–D6 above). Decisions taken by kai under the standing order: epic/version allocation (E024 / 0.1.13), the single-authority document (`STATE.md`), the acceptance project pattern, and wave shape per the handoff §5.

**Decisions — CTO 2026-09-04 ("yes to you"), on kai's recommendations:**
- D0 — 0.1.12 stands as released; the ledger records it as a **consent exception** (external gates waived at publication); no re-tag; 0.1.13 follows RELEASE_SOP in full.
- D1 — **retire omp's `local` memory pipeline**: `memory.backend` becomes `off | cortex`; migration `local → off` with a one-time notice; `learned.md` / `memory_summary.md` stay on disk; manual `cortex-ingest-memories --path` is the documented import; no automatic import.
- D2 — no product export/import for legacy Hindsight/Mnemopi data; retention/discovery path documented.
- D3 — hosted Cortex deferred to the platform workstream (alpha@kaidera) with acceptance criteria; not a 0.1.13 deliverable unless the contract and environment exist before W7.
- D4 — acceptance drives use project `openkai-acceptance`, agent `probe` (role `probe`), created and archived per drive; production `openkai` never receives synthetic data.
- D5 — transcript ingest stays off by default; retention per appliance config (`cortex-retain --status`).
- D6 — kai runs the drives; the clean-host drive on the kos-test VM if reachable, else a fresh macOS user account; a missing host/credential is a blocked row with evidence.
Next stage: W1 (ren reviews spec + plan) in parallel with W2 (drives).
