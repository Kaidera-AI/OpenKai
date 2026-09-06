# OpenKai lane fold-in — preparation (OpenKai side)

**Status:** PREPARED, nothing executed. Waits on the CTO decision on KOS design 35
(`kaidera-os/docs/design/35-product-lanes-vs-projects.md`, "one project, three lanes", §7 step 4 = this fold-in).
**Author:** kai@openkai · **Date:** 2026-09-06 · **Stage:** INTENT/GRILL (no spec, no plan record yet).
**Rule in force:** ren is mid-review on the openkai rows; nothing here moves a row ren holds until ren returns it.

## 1 · What the openkai lane is today (inventory, verified 2026-09-06)

| Asset | State | Fold-in treatment |
|---|---|---|
| Cortex project `openkai` (:8501) | roster beat/bob/cole/kai/quill/ren — a twin of the kaidera-os roster; 0 epics; 22 handoffs (10 pending, 1 claimed, 11 completed); 8 ingested sessions; decisions present, graph memory empty; consolidated rule + `sdlc-loop` seeded (generated `rules@0406fb115914`); 12 global skills, 6 role bindings | archive, never delete (design 35 §7.5) |
| Open rows to ren@openkai | 72215091 (E024 W1 review), 9fc8d889 (Inc 06 review), d774bcda (SDLC adoption review), f58dd706 (NO-GO nudge), f2053478 (remaining-gate audit review), 18816e79 (ren@kaidera-os alignment request, 2026-09-06) | ren finishes them here; unreturned rows re-file as lane rows after the switch |
| Open rows to kai@openkai | 679792f1 (quill: remaining-gate audit), bb2c73ac (quill return-path probe), c66fe68a (watchdog signal on probe 6fe545b0), 35a46f9b (PM beat), 6fe545b0 (probe, claimed by quill) | 679792f1 answered before the switch; probes and the watchdog row abandoned as inert; PM beat returned |
| Cross-project rows in kaidera-os | fa52a95d (contract addendum) and 129cc50e (data-loss bug) pending; a83d713c, 1e35fbe1, 8967499e, 138a96cc completed and FOLDED into Cortex E024 as findings F-1..F-11 (ren executes, kai@kaidera-os adjudicates) | unchanged; the "permanent cross-project exemption" (77db176e) retires once routing is intra-project |
| KOS console (:8765) | projects `openkai` (root `~/DevVault/OpenKai`) and `openkai-acceptance` registered; dispatch board for openkai with autonomy on; rows to ren/kai HELD as interactive | `openkai` registration retired with the project; `openkai-acceptance` stays as the scratch appliance project |
| Repositories | programme `Kaidera-AI/OpenKai` (ledgers on `maintenance/0.84-line`, product main = docs + release machinery, PR #4 open); source fork `Kaidera-AI/openkai-fork`; `~/DevVault/omp-upstream` tracker; `~/DevVault/openkai-acceptance` scratch | unchanged — projection targets, exactly as Cortex will be |
| Generated harness in this repo | `.agents/{agents,config,rules,skills,scripts}` + `CLAUDE.md`/`GEMINI.md` pointers, `workspace.json` program key `openkai` | regenerated from kaidera-os with a lane filter once `cortex-boot` can filter by lane (design 35 §5.5) |
| Claude Code auto-memory | per working directory (`~/.claude/projects/-Users-amadmalik-DevVault-OpenKai/memory/`) | stays with the directory; no action |
| Release state | 0.1.12 live on all channels; E024 (0.1.13) in W3 REWORK; docs suite folds into 0.1.13 | E024 continues under the lane; RELEASE_SOP unchanged |

## 2 · Preconditions on the kaidera-os side (design 35 §7 steps 1–3) — none landed yet

| Precondition | Verified state 2026-09-06 |
|---|---|
| Lane personas `ren-cortex`, `ren-kos` on the kaidera-os roster | absent — roster is beat/bob/cole/kai/quill/ren |
| Owner map (`Program/OWNERS.yaml` or `.agents/config/lanes.yaml`) | absent in canonical |
| `lane` field in the kaidera-sdlc skill (v1.2.0 templates, gate record, governance) | skill is v1.1.0; "lane" appears only in governance.md and distribution.md prose |
| Lane-ownership check in `scripts/dev/verify-change-scope.sh`; consult-id check in `gatecheck.py` | scope script exists on kaidera-os main; no lane check; `gatecheck.py` not found |
| Boot/search filtered by lane tag | not built |

Until these exist the fold-in would recreate the August failure mode the design names (a lane persona editing a
foreign path with no gate). Readiness therefore depends on kaidera-os, not on OpenKai.

## 3 · OpenKai-side sequence when the CTO says yes

1. **Drain, do not migrate in flight.** Ren returns the rows listed in §1; kai answers 679792f1, returns 35a46f9b,
   abandons the probes/watchdog rows; f2053478 and 18816e79 either return here or re-file as lane rows.
2. **Persona.** Register `ren-openkai` on kaidera-os (`cortex-add-agent`, role `cpo`, identity from
   `.agents/agents/REN_IDENTITY.md` plus a lane line). Workers bob/cole/quill/beat already exist there — no new
   rows. `kai` spans lanes as integrator only (design 35 §4).
3. **Memory import with the design-28 trust label.** Export the `openkai` project (small: 8 sessions, decisions;
   the large-export drop does not apply), ingest into kaidera-os with `lane: openkai` and an `import:openkai@2026-09-..`
   source marker; every imported decision/lesson is labelled imported-unverified until re-verified in place.
   Unique source per row (E024 A20) applies to the import too.
4. **Rules and skills.** Re-ingest the consolidated openkai rule as a lane-scoped rule (`openkai-lane`); re-bind the
   six role bindings to `ren-openkai` and the shared workers; `kaidera-sdlc` stays global.
5. **Owner-map entries for the OpenKai lane** (proposal for the map, from `git grep -il openkai` on canonical):
   OpenKai lane OWNS both OpenKai repositories, `appliance/openkai/**`, and the provider-file schema/vocabulary
   (18816e79 already states "OpenKai owns schema/vocabulary"); KOS OWNS `local-cortex/console/**` including the
   openkai harness runner (consult OpenKai); Cortex OWNS the reader/projection of the provider file; CROSS =
   `redistributable/config/**` (provider template pinned to OpenKai `f3660f3c…`), `scripts/release/**` (installer
   contract), `docs/design/{23,28,32,35}`.
6. **Harness regeneration** for this repo from kaidera-os with the lane filter; `CLAUDE.md` pointer regenerated.
7. **Console.** Retire the `openkai` console project; keep `openkai-acceptance`; ren-openkai's dispatch lane stays
   `harness: openkai` (dogfood) — note the console HOLD for interactive personas persists unless the persona is
   designated autonomous (CTO decision 2026-09-04: ren stays operator-triggered).
8. **Archive.** `openkai` Cortex project marked archived (no delete); the cross-project exemption retired by dated
   decision; PROGRESS/STATE lines in this repo point at the lane.

## 4 · Readiness checklist (all must be true before the switch)

- [ ] CTO decision on design 35 recorded (option A) and the persona question answered (§5.1)
- [ ] kaidera-os preconditions §2 landed and evidenced (roster rows, owner map, skill v1.2.0, scope gate, lane-filtered boot)
- [ ] every ren-held openkai row returned or explicitly re-filed (no row moved mid-review)
- [ ] 679792f1 answered; probes abandoned; PM beat returned
- [ ] export of the `openkai` project taken and checksummed before any import (rollback point)
- [ ] import dry-run on `openkai-acceptance` first, then kaidera-os
- [ ] harness regeneration proven by a `cortex-boot kai` from this directory that loads the lane context
- [ ] E024 STATE.md and PROGRESS.md carry the lane pointer; RELEASE_SOP unchanged

## 5 · Questions for the CTO

1. Persona: a new `ren-openkai` roster row (design 35 wording) or the existing `ren` with a lane tag? Recommendation: new row — a fuzzy scope is the failure the design names.
2. Timing: switch before or after E024 W3 REWORK? Recommendation: after ren's current reviews return and before W3 build rows are minted, so the W3 rows are born as lane rows.
3. Memory import scope: decisions and lessons only (recommended) or the 8 session transcripts as well?
4. `openkai-acceptance` stays as the scratch project for destructive drives — confirm.

## 6 · Draft handoff to kai@kaidera-os (NOT sent; sends only after the CTO decision)

Summary: `[PLAN] OpenKai lane fold-in — OpenKai-side prep is ready (Program/MIGRATION_OPENKAI_LANE/PREP.md); waiting on §7 steps 1–3`.
Next: land lane personas, owner map, skill v1.2.0, scope gate, lane-filtered boot; then call the OpenKai switch window.
Verify: `cortex-boot kai` from `~/DevVault/OpenKai` loads kaidera-os lane context; every ren row returned or re-filed; export checksum recorded.
