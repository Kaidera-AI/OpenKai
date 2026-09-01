# Handoff: kai@openkai → kai@openkai (post-E022-Inc-00..05 dev session)

**Date:** 2026-09-01 · **Session:** omp+K3, Inc 00–05 landed, Inc 06 staged.

## Where things stand

**Fork tree** `~/DevVault/openkai-fork`, branch `e022/inc-00-04-tui-consolidation`
(HEAD `567f5bb5e6`), pushed to product repo as PR #3. **Program of record**
`~/DevVault/OpenKai` on `maintenance/0.84-line`.

| Inc | Status | Evidence |
|---|---|---|
| 00 upstream sync | DONE | v18.0.11 merged zero-conflict + pinned, 18/18 gates — `INC_00_GATE.md` |
| 01 theme & brand | DONE | contract + first paint + splash + glyph + golden frames, 12/12 — `INC_01_GATE.md` |
| 02 parity census | DONE | every registry row dispositioned (34/41/9/7) — `PARITY_CENSUS.md` |
| 03 fusion defaults | DONE | scorer pairing + pickers + provenance + RLM states, 11/11 |
| 04 release machinery | DONE | witnessed trust root + upgrade cmd, 16/16 + live round-trip — `INC_03_04_GATE.md` |
| 05 trust + KOS | DONE except Cortex registration (BLOCKED on operator) | equivalence 10/10, KOS reply sent — `INC_05_GATE.md` |
| 06 adversarial + ship | STAGED | decision package + changelog draft ready |

## CI journey (Inc 04 mandate — fork CI green)

PR #3 needed five integration fixes, all landed and committed:
1. biome debt in the layer → repo-wide `check:tools` green (tabs, not spaces).
2. golden frames capability-dependent → ANSI-stripped structure gate.
3. openkai builtin tools polluted exact tool-set tests → `toolNames` scoping.
4. deny floor blocked upstream SDK sandboxes → temp tree exempt scratch
   (DENY_FLOOR secret patterns still apply inside temp).
5. headful Chromium suite needs Xvfb + X11/GTK runtime deps on stock runners.

**Check PR #3's head before anything else:** `gh pr checks 3 --repo Kaidera-AI/OpenKai`.
If the native/unit job passes at `567f5bb5e6`, CI is green end-to-end and Inc 04's
last item closes.

## Known environmental flake (not our bug)

`test/config-value-fd-inheritance.test.ts` "timed-out !command kills descendants"
fails deterministically on this Mac (reparented-descendant kill race) but the test
and the exec path are untouched by E022 (`git diff v18.0.11 HEAD` on those files is
empty). CI judges it; don't chase it locally.

## Blocked item — needs the CTO

**Cortex `openkai` project registration.** Live probe: localhost:8501 has
`kaidera-os`, `kaidera`, `2nd-brain`, … but NO `openkai` (`/projects/openkai` → 404).
Managed-mode boot 404s and ingest queues until restored. The fix is the operator
running `cortex-init-project`
(`~/DevVault/kaidera-os-worktrees/canonical-integration/.agents/scripts/`) — code
seam is green; only the registration is missing.

## CTO decisions needed (INC_06_CTO_DECISIONS.md)

1. Five port-or-retire calls (census §5): `/undo` port (recommended), fuse CLI
   retire, tail retire, Ctrl+S stash port, `openkai provider` write path port.
2. Adversarial pass schedule (ren → K3 → qwen3.8).
3. Ship consent per RELEASE_SOP once passes disposition.

## Next session's first moves

1. `gh pr checks 3 --repo Kaidera-AI/OpenKai` — confirm green.
2. If green: close the CI todo, run the operator drives (PARITY_CENSUS §4), then
   start the adversarial passes (new sessions, recorded handoffs).
3. Ask the CTO the decision-package questions before any ship step.
