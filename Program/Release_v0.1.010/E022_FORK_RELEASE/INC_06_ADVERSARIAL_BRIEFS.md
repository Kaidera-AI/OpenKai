# E022 INC 06 — adversarial review briefs (dispatch one session per reviewer)

**Cadence (standing goal 9):** ren deep review → K3 → qwen3.8 pro, each with a
written handoff and findings dispositioned in writing. These MUST be separate
sessions — a reviewer session never reviews the lane that authored the code.

## Brief 1 — ren@openkai (CPO deep review)

**Scope:** the E022 diff on `e022/inc-00-04-tui-consolidation` (fork repo
`~/DevVault/openkai-fork`, PR #3). Focus: the openkai layer (`src/openkai/**`),
the sdk.ts scoping change, gate-floor temp exemption, upgrade-trust port,
cli-commands reserved-word change, theme contract.
**Ask:** adversarial deep review — attack the deny-floor exemption (can a secret
escape via the temp scratch rule?), the toolNames scoping (can fusion leak into a
restricted session or be excluded from a normal one?), the upgrade witness
(fail-closed paths), and the theme contract (can appearance flips or env races
unpin a spawn-fixed theme?). Disposition each finding in writing; file as a
handoff document in `~/DevVault/OpenKai/docs/`.
**Evidence base:** `INC_03_04_GATE.md`, `INC_05_GATE.md`, the equivalence suite.

## Brief 2 — K3 (kimi-k3, omp+K3 session)

**Scope:** same diff, second independent pass.
**Ask:** functional review — run the gate suites (78 openkai tests), drive the
PTY keyless boot, exercise `/fuse` bare menu, verify pair config round-trip, and
attempt to break the upgrade channel detection (brew/bun/npm/standalone
classification). Findings to a handoff document.

## Brief 3 — qwen3.8 pro (security/UAT pass)

**Scope:** same diff, third pass.
**Ask:** security re-read of secrets handling (redactSecrets coverage, procenv
scrub, manifest witness) + UAT against the DOGFOOD_FORK checklist (parity rows).
Findings to a handoff document.

## After all three disposition

1. Dogfood drives closed (PARITY_CENSUS §4 operator checklist).
2. CHANGELOG [0.1.10] finalised (draft in `CHANGELOG.md`, replaces the cancelled
   0.84 section) + lockstep versions at cut + tag `v0.1.010`.
3. **CTO consent recorded per RELEASE_SOP before anything public** — the ship
   gate. Nothing publishes without it.

## Known issue carried (not a blocker)

`browser-tab-worker-startup` visible-tab test fails identically on upstream
`omp (upstream)` hosted CI — upstream-inherited, no browser code touched by
E022, release path (omp-kata runner) ships the display. Tracked for the next
monthly merge. See `INC_03_04_GATE.md` §CI evidence.
