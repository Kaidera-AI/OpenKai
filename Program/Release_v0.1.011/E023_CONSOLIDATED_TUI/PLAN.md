# Plan: E023 next wave — SDLC adoption + release readiness (from `EPIC_SCOPE.md` and `DISPOSITION_REN_INC06.md`, 2026-09-03)

Owner: kai@openkai. Handoffs: `84edc569` (SDLC adoption), `9fc8d889` (ren review, returned → DISPOSITION_REN_INC06.md). Worktree: `~/DevVault/openkai-fork` branch `e023/sdlc-adoption` (from `main` @ `c6c7fa7b1b`). Status: accepted 2026-09-03 (lead).

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
(none yet)
