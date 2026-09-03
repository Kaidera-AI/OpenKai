# E022 — v0.1.10 SHIP REPORT (to the CTO)

**Consent:** "ok lets ship, both steps are approved" (2026-09-01, this
session) — ship 0.1.10 + decision #6 (wrapper `@kaidera/openkai`).
**Release tip:** `a93dfc3617`, tag `v0.1.010` on `Kaidera-AI/OpenKai`.

## What shipped

| Channel | State |
|---|---|
| npm | `@kaidera/openkai-engine@18.0.11` + `@kaidera/openkai@0.1.10` live (wrapper shim `openkai` → engine `runCli`). |
| bun | `bun add -g @kaidera/openkai` live; runs `openkai/0.1.10`. |
| standalone | Release CI (run 33542228528) building binaries + signed `latest.json` + SLSA attestations; `install.sh` repointed to install `openkai` from Kaidera releases. |
| brew | Kaidera tap formula for 0.1.10 to follow the cut (sha256s from assets). |

## Proven at the cut

- **0.1.9 → 0.1.10 standalone:** on a copy — Ed25519 signature verified,
  SHA-256 witness verified, swap 0.1.9→0.1.10, `--rollback` back to 0.1.9.
  Same keypair as the 0.1.9 line; 0.1.9 installs see `latest: 0.1.10`.
- **npm/bun:** clean-prefix installs run `openkai/0.1.10`; upgrade defers
  honestly to the package manager.
- **Gates:** 75/75 openkai + 513 composer + 149 cli suites; biome + tsgo
  clean; compiled-binary drives for every adversarial fix.
- **Adversarial chain:** ren (6 fixed) → K3 (splash order fixed) → qwen3.8
  pro (telemetry boundary wired live; release key pinned fail-closed).
  Dispositions: `DISPOSITION_{REN,K3,QWEN}.md`.

## CI ownership (Inc 04 mandate)

The Kaidera org had no `omp-kata` runner — non-PR jobs queued forever.
Heavy-runner label parameterised (`vars.OMP_HEAVY_RUNNER || 'omp-kata'`,
default unchanged upstream); Kaidera sets `ubuntu-22.04`. The inherited
visible-browser test (upstream-broken on stock runners) now gates on a
headful launchability probe (`headfulChromiumAvailable`, the recorded
disposition) — runs where a windowing surface exists (9/9 on macOS), skips
honestly on bare Linux.

## Open / operator

1. ~~Release CI green confirmation~~ — closed 2026-09-03: run green at the
   release tip; `latest.json` serves 0.1.10; SLSA attestations serve and
   `gh attestation verify` returns success against the manifest.
2. ~~Kaidera brew formula 0.1.10~~ — closed 2026-09-03: shipped formula
   `fb1485e` (literal `v0.1.010` asset URLs, sha256s byte-identical to the
   release SHA256SUMS) + tap CI `69ff74d37c`; `KAIDERA_TAP_DEPLOY_KEY` set.
3. ~~Local-binary hygiene refresh~~ — closed 2026-09-03: every local install
   runs `openkai/0.1.10`.
4. ~~`cortex-init-project` for the `openkai` registry entry~~ — closed
   2026-09-03: `openkai` active in the live Cortex registry; the fork's
   cortex client then proved live managed-mode for real (`cafb925e15`:
   `POST /memory` + `top_k` — the retired `/learnings`/`limit` shape 404s on
   the current Cortex): record→search round trip green, source=knowledge.
5. Your seven dogfood drives (PARITY_CENSUS §4) — remains operator.
6. KOS follow-up handoff delivered: `docs/HANDOFF_TO_KOS_0110_SHIPPED.md`.

## CI findings at the cut (all upstream-inherited or environmental)

- **pi-shell `kill_builtin_signals_every_process_in_a_jobspec_pipeline`**
  (upstream, unmodified by the fork diff): times out on stock ubuntu runners;
  upstream's own stock-ubuntu CI is red on it; passes on macOS (proven in this
  epic's runs). Rust job gets its own runner var (`OMP_RUST_RUNNER`, Kaidera:
  macos-14; upstream default unchanged).
- **Visible-tab browser test** (upstream-inherited): the fork now provisions a
  window manager (openbox) under Xvfb AND gates the suite on a strict headful
  probe that exercises the test's own contract (launch + CDP resize). Runs
  where it can pass; skips honestly elsewhere.
