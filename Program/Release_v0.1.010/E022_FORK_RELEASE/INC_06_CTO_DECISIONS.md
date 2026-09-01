# E022 INC 06 — CTO decision package (pre-ship)

**Context:** Inc 00–05 landed (see gate docs); fork CI green on PR #3. Nothing below
ships without explicit CTO consent per `docs/RELEASE_SOP.md`.

## Decisions needed (parity census §5 — every port costs an increment; every
retire is permanent and visible in the registry)

| # | Row | Options | kai's recommendation |
|---|---|---|---|
| 1 | `/undo` + shadow-git | port via layer / retire for `/git` TUI | **port** — registry ✅ row, release-gated; the `/git` TUI is a superset for diffs but has no file-history undo |
| 2 | `fuse` CLI (headless) | port / retire | **retire** — the TUI `/fuse` covers interactive use; headless fusion rides the fusion tool via print mode |
| 3 | `tail -f` activity feed | port / retire | **retire** — telemetry rides Cortex managed mode on the fork |
| 4 | Ctrl+S prompt stash | port / retire | **port** — registry ✅ row; upstream's editor grammar has no stash |
| 6 | npm/bun channel namespace | (a) wrapper `@kaidera/openkai` package published from the fork CI (0.84-line layout: bin shim + optional native deps) / (b) retire npm+bun for the fork line, standalone+install.sh primary, brew rebranded | **(a)** — 0.1.9 users' `npm i -g @kaidera/openkai` upgrade path must not die; the fork's inherited `release_npm` job publishes omp-named packages into the upstream namespace, which the Kaidera account cannot publish (403) — run the fork release with `skip_npm` until the wrapper exists. `openkai upgrade`'s npm/bun deferral messages already name `@kaidera/openkai`. |

## Operator action (blocked item)

**Cortex `openkai` project registration.** The shared API (localhost:8501) has no
`openkai` project → managed-mode boot 404s and ingest queues. Run
`cortex-init-project` (at `~/DevVault/kaidera-os-worktrees/canonical-integration/.agents/scripts/`).
Code seam is green; only the registration is missing. Until then the managed-mode
ingest gate stays amber (environmental).

## Ship sequence (on consent)

1. Adversarial passes: ren deep review → K3 → qwen3.8 pro, each dispositioned in
   writing (new sessions, this repo's handoff chain).
2. Dogfood drives closed (PARITY_CENSUS §4 operator checklist — 7 drives).
3. CHANGELOG [0.1.10] + lockstep versions + tag `v0.1.010`.
4. Four channels per RELEASE_SOP: npm → brew (signed) → standalone (witnessed)
   → install.sh repoint. Upgrade→rollback round-trip re-proven at the cut.
5. FEATURE_REGISTRY audit walked as the pre-publish checklist (census carries it).

## What's already proven (evidence)

- 30 openkai gate tests + 10 security-equivalence + 16 upgrade-trust green.
- Live: keyless-boot PTY drive, upgrade→rollback round-trip, CI full pipeline
  green (PR #3 head `35fc90b9f6` or later).
- Upstream pinned at v18.0.11; no mid-epic merges.
