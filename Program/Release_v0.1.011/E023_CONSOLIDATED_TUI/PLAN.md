# Plan: E023 — consolidated TUI, v0.1.11/0.1.12 line (epic plan on the SDLC loop, 2026-09-04)

Owner: kai@openkai. Spec: `EPIC_SCOPE.md` + `MEMORY_CORTEX_DESIGN.md` (memory) + `FEATURES_INTEGRATION_PLAN.md` (implemented map + acceptance gates). Status: accepted 2026-09-04 (lead). Process: `docs/DEVELOPMENT_PROCESS.md`.

## Waves (each wave = one Cortex increment = one handoff, one agent, one worktree)

| Wave | Stage | Owner | Handoff | Delivers | Depends on | State |
|---|---|---|---|---|---|---|
| W0 | BUILD/VERIFY | kai | Inc 06 trigger (`HANDOFF_KAI_E023_INC06_MEMORY_CORTEX.md`) | memory on Cortex; remediation of ren's findings; public identity; docs suite | — | done — fork `main @ c6c7fa7b1b`, `INC_06_GATE.md`, `DISPOSITION_REN_INC06.md` |
| W1 | BUILD/VERIFY | kai | `84edc569` (returned) | SDLC adoption: Cortex bindings + rule, skill vendored in the harness, `/sdlc` + `/grill` | — | done — fork `e023/sdlc-adoption @ aeb6770e10`; proof in §Amendments |
| W2 | REVIEW | ren | `9fc8d889` (bundles A/B/C) + `W1 review row` | adversarial passes on Inc 06 code, the docs suite, the features plan, and the SDLC branch; dispositions | W0, W1 | pending (ren) |
| W3 | VERIFY (external) | CTO / operator | none (operator drives, recorded by kai) | the three acceptance gates: clean-host installer/binary drive; local Cortex install → registration with a real admin token; live enrichment-provider apply | W0 | pending — no release doc may claim these before the observed result is recorded |
| W4 | REVIEW → adjudication | kai | after W2 returns | adjudicate findings against the reviewed tips; fold `e023/sdlc-adoption` into fork `main`; re-pins ratified | W2 | pending |
| W5 | SHIP | kai prepares, CTO authorises | `78f86ec5` / `844f23b2` (KOS installer asks) | `docs/RELEASE_SOP.md` sequence on the candidate commit; KOS pin (tag, asset, sha256, install + verify commands) | W3, W4 | gated — CTO consent per version |
| W6 | MAINTAIN | kai / quill | `129cc50e` (Cortex data loss, filed to kai@kaidera-os) | incident → intent + eval; backup-cadence rule when the KOS fix lands; retro line in `research/` | W5 | open |

Deferred work (drawers, obligation ledger, plugins, headless Fusion CLI, hosted Cortex) is out of this epic per `FEATURES_INTEGRATION_PLAN.md` §Deferred; each returns through a fresh intent.

## Risks (epic level)
- Two parallel kai sessions on one epic: the worktree SOP and one-concern commits keep them apart; the ledger is the merge point.
- The external gates need credentials only the operator holds; the plan cannot pass them by proxy.
- Release channels are coordinated (`bun run release 0.1.N`); a partial publish is the failure to rehearse rollback for.

## Proof (epic level)
- W2: disposition files exist with verdicts and evidence; W4: adjudication note + fold hash; W3: three observed results recorded in `INC_06_GATE.md` addendum; W5: tag, asset URLs, sha256, channel state reported to the CTO.

---

# Wave W1 record: SDLC adoption (kept verbatim from the wave plan)

Owner: kai@openkai. Handoff: `84edc569`. Worktree: `~/DevVault/openkai-fork` branch `e023/sdlc-adoption` (from `main` @ `c6c7fa7b1b`). Status: done 2026-09-03; awaiting W2 review.

## Files that change
- `packages/coding-agent/src/openkai/skills/kaidera-sdlc/**` — new: vendored skill (SKILL.md, references/, templates/, evals/) at KOS rev `83b3169c`; `VENDOR.json` pins source, rev, tree hash.
- `packages/coding-agent/src/openkai/bundled-skills.ts` — new: materialise bundled skills into the user skills dir on session start (marker file carries the pinned rev; never overwrites hand edits).
- `packages/coding-agent/src/openkai/sdlc-extension.ts` — new: `/sdlc [intent|grill|spec|plan|review|ship]` and `/grill` — hands the stage's reference/template to the agent with the operator's topic.
- `packages/coding-agent/src/openkai/index.ts`, `src/sdk.ts` — modified: register the extension; run the materialiser.
- `packages/coding-agent/src/config/settings-schema.ts` — modified: `skills.bundled` (default on) beside the other skills rows.
- `packages/coding-agent/src/prompts/agents/init.md` — modified (upstream touch-list): the generated pointer names `kaidera-sdlc`.
- `FORK.md` — modified: touch-list entry for `init.md`.
- `packages/coding-agent/test/openkai-sdlc-skill.test.ts` — new: vendored tree matches `VENDOR.json`; materialiser writes and never clobbers; command registers.
- Program repo: `.agents/rules/openkai.md` (sdlc-loop rule, seeded), `.agents/skills/manifest.json` (bindings regenerated), this plan + `intent/sdlc-adoption.md`, `PROGRESS.md` line.

## Order of work
1. Cortex: bind `kaidera-sdlc` to the six roster roles; seed the `sdlc-loop` rule; check `GET /boot/kai` lists both. (done — ids in the handoff return)
2. Vendor the skill dir at the pinned rev with `VENDOR.json`; test asserts the tree hash. Check: `bun test test/openkai-sdlc-skill.test.ts` green.
3. Materialiser + setting; test covers first write, unchanged re-run, hand-edit preserved.
4. `/sdlc` + `/grill` extension; registration test. `/plan` untouched.
5. `init.md` line + FORK.md touch-list; `bun run check` clean.
6. Program artifacts + handoff return (bind/rule ids, commit, friction).

## Waves (multi-agent work only)
Single-agent wave. The E023 release-readiness waves stay as recorded in `DISPOSITION_REN_INC06.md` §Release decision (clean-host installer drive; Cortex install→registration with a real admin token; live enrichment apply) — operator-owned drives, each returns pasted output before the SOP's step 3.

## Risks
- The materialiser writing into `~/.omp/agent/skills` could shadow a user's own `kaidera-sdlc` copy: mitigated by the marker check (only write when absent or when the marker rev is older) and the opt-out setting.
- Upstream `init.md` edit is a merge-conflict surface: one line, touch-listed.
- Vendored text drifting from KOS: the tree-hash eval fails loudly; refresh = re-vendor + bump `VENDOR.json`.
Blast radius: user skills dir + one prompt line; nothing in the agent loop. Irreversible: none.

## Proof
- `bun --cwd=packages/coding-agent run check` → clean.
- `bun --cwd=packages/coding-agent test test/openkai-sdlc-skill.test.ts test/openkai-registration.test.ts` → all pass (pasted in the handoff return).
- Compiled drive: `openkai-next-fork` then `/sdlc` shows the route table; `~/.omp/agent/skills/kaidera-sdlc/SKILL.md` exists with the marker.
- `curl /boot/kai` → rule `sdlc-loop` + skill `kaidera-sdlc` present.

## Amendments
- 2026-09-03 — Proof ran on the final tree: `bun run check:types` clean, `bunx biome check` clean, `bun test test/openkai-sdlc-skill.test.ts test/openkai-registration.test.ts` → 9 pass / 0 fail, `bun test test/openkai-*.test.ts` → 127 pass / 0 fail; compiled `openkai/0.1.12` deployed as `openkai-next-fork`; `config list` → `skills.bundled = true`; a headless run (exits on the key check) still materialised `~/.omp/agent/skills/kaidera-sdlc/` with the marker at `83b3169c`; `GET /boot/kai` → rule `sdlc-loop` + skill `kaidera-sdlc`.
- 2026-09-03 — Departures: the build now emits `dist/openkai` (the parallel session's public-identity rename), not `dist/omp`; the rule was first seeded with the file stem as slug (`openkai`) and deprecated via the admin plane before the consolidated-file reseed produced `sdlc-loop` — recorded as design-31 friction in the handoff return.
- 2026-09-03 — Not in this plan: `/init` behaviour was not driven on the compiled binary (needs a model); covered by the prompt directive + touch-list only.
