# INC 03 + 04 GATE — fusion defaults & release machinery (2026-09-01)

**Fork commits:** `4ebc80951d` (Inc 03), `c5592f76f3` + `6dd1f30b6e` (Inc 04)

## Inc 03 — fusion-first defaults (layer-only, no upstream touches)

- `test/openkai-fusion-pairing.test.ts` — 11/11 green: the scorer-source contract
  (bandit evidence → `source: "bandit"`; no evidence → `diversity-policy`
  cross-provider; configured pair honoured verbatim; single-provider fallback
  carries the named advisory; self-pair advisory; posture→bucket mapping).
- Bare `/fuse` menu: provider→model pickers for BOTH slots, persisted to
  `~/.openkai/config.json` (`fusion.pair`); config I/O is atomic 0600, tolerant
  of corrupt files (4 tests).
- Pair provenance renders in the fusion verdict card.
- RLM display states: pending child names model + generation + elapsed; failed
  child renders its error; `RlmRegistry.whenSettled()` gives a deterministic
  await (no wall-clock waits in tests).

## Inc 04 — witnessed trust root + upgrade channel

- `test/openkai-upgrade-trust.test.ts` — 16/16 green, all deps injected:
  Ed25519 pinned key fails CLOSED on unsigned/tampered manifests; unpinned →
  SHA-256 artifact witness still gates; upgrade preserves `.previous`; rollback
  restores and is reversible; kill-switch refuses upgrade but never rollback.
- Live round-trip proven outside the suite (`/tmp/upgrade-roundtrip2.ts`):
  check → witnessed upgrade → rollback, binary bytes verified each step.
- `openkai upgrade` registered: channel detection (brew/bun/npm → defer to the
  package manager; standalone → witnessed upgrader), `--check` read-only,
  `--rollback` recovery.
- Contract change (epic mandate): `upgrade` leaves the reserved-word table —
  the upstream `plugin-verb-launch-leak.test.ts` pins updated with the change
  documented inline; plugin upgrades stay `omp plugin upgrade`.
- Four channels: brew (signed upstream tap job), npm (bun-compiled upstream
  publish job), standalone (witnessed, build-binary via CI `release_binary`),
  bun (`bun add -g` deferral). CI's native jobs run the binaries; nothing
  publishes without CTO consent.

## CI evidence

PR #3 run 1: surfaced 3 fixable integration defects (all fixed in `6dd1f30b6e`):
1. deny floor blocked upstream SDK sandbox tests → system-temp exemption
   (strict containment preserved for sessions sandboxed inside temp; DENY_FLOOR
   secret patterns still apply in temp — equivalence suite pins both). Later
   refined: the temp tree is exempt scratch UNCONDITIONALLY — the upstream SDK
   suite relocates sandboxes mid-test (sdk-file-write-fallback writes to a temp
   sibling after moving cwd inside temp); floor gate realigned.
2. golden frames capability-dependent → ANSI-stripped structure gate.
3. biome debt in the layer → repo-wide `check:tools` green.
4. openkai builtin tools polluted exact tool-set contract tests → scoped to the
   `toolNames` convention (generate_image/web_search precedent); 3 upstream SDK
   failures closed, fusion stays default-on for normal launches (`toolNames`
   undefined).
5. headful Chromium suite needs a display the stock PR runner lacks → Xvfb step
   added to `setup-system-deps` (daemon survives steps via GITHUB_ENV, proven on
   run 33496382569) + Chromium runtime libs (puppeteer's Ubuntu set). The
   "Missing X server" failure is closed.

**Remaining native/unit failure is upstream-inherited, not an E022 regression.**
`browser-tab-worker-startup.test.ts > visible OMP-owned browser tabs > creates
independent pages` fails identically on upstream `can1357/oh-my-pi`'s OWN hosted
PR CI (runs 33492541432, 33490882549) — the test launches headful Chrome
(`headless: false`) and the tab worker reports a swallowed `[object ErrorEvent]`
init failure. Evidence: this branch touches no browser code
(`git diff v18.0.11 HEAD` on `src/tools/browser/` is empty); upstream main CI is
red on unrelated suites too. Disposition: carry-forward of the upstream v18.0.11
defect; the fork's omp-kata runner (the release path) ships a display and the
full browser stack, so the PR-hosted gap does not gate the release. Tracked for
the next monthly upstream merge (fix lands upstream, or the visible suite gains
a launchability probe like the existing `chromiumAvailable()` headless gate).
