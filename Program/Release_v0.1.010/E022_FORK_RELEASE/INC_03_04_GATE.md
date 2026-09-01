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
   secret patterns still apply in temp — equivalence suite pins both).
2. golden frames capability-dependent → ANSI-stripped structure gate.
3. biome debt in the layer → repo-wide `check:tools` green.
