# Handoff: kai@openkai → kai@openkai (omp+K3 dev session) — E022, ship the fork as 0.1.10

**Date:** 2026-09-01 · **Trigger:** the operator opens an omp+K3 session
(`ollama-cloud/kimi-k3`) and points it here. This document is self-sufficient — read it,
then the spec, then start Inc 00.

## Authority (CTO, 2026-09-01, recorded in session)

1. **Renumber:** the fork line's first public release ships as **v0.1.10**. The 0.84
   thin maintenance cut is cancelled; that line is maintenance-only and unreleased.
2. **Push-to-talk: REMOVED from OpenKai entirely** (superseding directive, same day) —
   transferred to kaidera-os as a future feature via handoff
   `f5dc2930-47bc-42ec-98a4-373635460bab` (kai@kaidera-os moves the LocalFlow reference
   files from `~/DevVault/LocalFlow` into their tree). Build NO voice surface in the
   openkai TUI; LocalFlow stays licence-barred from vendoring anywhere.
3. **The formula:** functionality from omp (adopt upstream flows, don't fight them);
   look and feel from Droid/Kaidera (sharp hexagon, brand colours, splash every launch).
4. Fold the operator's standing goals — refreshed in `Program/PROGRESS.md`
   §"Standing goals (refreshed 2026-09-01)".

## Where to work

- **Code:** `~/DevVault/openkai-fork` — the fork line (= `Kaidera-AI/OpenKai` main).
  Branch off main per increment (`e022/inc-XX-<slug>`); do NOT push to origin/main:
  CI is not yet green there (Inc 04 owns fixing it) and release-SOP consent gates apply.
- **Build:** `bun install && bun run build` (cmake required for the Rust natives; the
  pinned nightly toolchain note is in the E021 spec §6y — Homebrew rustc shadowed rustup,
  directory override set).
- **Program of record:** the OpenKai repo (`~/DevVault/OpenKai`) on branch
  `maintenance/0.84-line` — the spec, the ledger, this handoff. Commit program-doc
  updates there.
- **Spec (read next):** `Program/Release_v0.1.010/E022_FORK_RELEASE/EPIC_SPEC.md` —
  eight increments, each with a measurable gate.

## First moves (Inc 00 → Inc 01)

1. Verify the fork builds and the E021 18/18 gates run green as found.
2. Merge upstream **v18.0.11** (one patch ahead of the merged v18.0.10) through the
   monthly-merge review; re-run the gates; then PIN upstream for the epic.
3. Start Inc 01 (theme/brand): first-paint Kaidera default, theme picker with live
   preview inside settings, `--theme` flag + `OPENKAI_THEME` env with OSC 11/COLORFGBG
   auto — this also closes KOS ask 6 (CTO priority).

## Constraints that survive context loss

- **Upstream pristine** outside FORK.md's sanctioned touch-list; everything OpenKai
  lives behind the extension seams (`packages/coding-agent/src/openkai/`).
- **No public artefact without per-version explicit CTO consent** (docs/RELEASE_SOP.md —
  the operator has been burned by jumped guns twice; treat this as a hard floor).
- **The pre-publish checklist is FEATURE_REGISTRY.md** — Inc 02's census updates it;
  nothing demoed in `openkai-next*` may silently drop from the release.
- **Cortex:** the `openkai` project registration is MISSING in the shared API
  (localhost:8501) — boot 404s and managed-mode ingest queues silently. Restoring it is
  an operator action (`cortex-init-project`); ask, don't assume. Until then the
  managed-mode ingest test red is environmental, not a code defect.
- **Adversarial cadence:** ren deep review → K3 → qwen3.8 pro before ship, findings
  dispositioned in writing (Inc 06).
- **KOS reply:** the inbound six-ask handoff is
  `docs/HANDOFF_FROM_KAIDERA_OS_TUI_TERMINAL_LANE.md`; Inc 05 sends the reply for the
  fork line and names minimum version 0.1.10 (the PTT transfer handoff `f5dc2930` is
  separate and already sent — do not fold the reply into it).

## Reporting

Per increment: gate evidence (command + output reference) into the epic folder, one-line
status row appended to `Program/PROGRESS.md`, and anomalies via the DOGFOOD_FORK
template. On epic exit: the Inc 06 ship package awaits CTO consent — stop there.
