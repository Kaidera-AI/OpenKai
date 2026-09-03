# E022 SHIP RECORD — v0.1.10 (2026-09-01)

**Consent:** CTO, in-session 2026-09-01: "ok lets ship, both steps are
approved" (ship 0.1.10 + decision #6, wrapper `@kaidera/openkai`).
**Release commit/tag:** `1dfce58156` → `v0.1.010` on `Kaidera-AI/OpenKai`
(product main fast-forwarded from `e022/inc-00-04-tui-consolidation`;
product main was a strict ancestor, zero divergence).

## Channels

| Channel | State | Evidence |
|---|---|---|
| npm | **published** — `@kaidera/openkai-engine@18.0.11` (the fork's coding-agent, Kaidera scope) + `@kaidera/openkai@0.1.10` (wrapper shim). Manual publish from the release workstation per SOP (Kaidera npm creds live there; CI publishes the omp scope, all no-op skips). | Registry live; `npm i @kaidera/openkai@0.1.10` into a clean prefix runs `openkai/0.1.10`. |
| bun | **live** — `bun add -g @kaidera/openkai` resolves the wrapper. | Scoped `BUN_INSTALL` install runs `openkai/0.1.10`. |
| standalone | **release CI in flight** at record time — binaries + SHA256SUMS + `latest.json` (signed with the CTO-custodied key) + SLSA attestations, on tag push. | Run 33521384067; verify after green: `curl -sL .../releases/latest/download/latest.json` + `gh attestation verify`. |
| install.sh | repointed in-tree to `Kaidera-AI/OpenKai` + `@kaidera/openkai` + `openkai` binary name. | Commit on the release line. |
| brew | Kaidera tap formula for 0.1.10 pending release assets (sha256s from the cut). | Below. |

## Update path

- 0.1.9 standalone (0.84 line) pins the SAME release keypair; its upgrader
  reads `Kaidera-AI/OpenKai` latest.json → sees 0.1.10, verifies the Ed25519
  signature, swaps with `.previous` rollback. Proven on a COPY at the cut
  (never the operator's live binary first).
- npm/bun 0.1.9 users: `npm i -g @kaidera/openkai` / `bun add -g` — the
  wrapper replaces the old package name-for-name.

## Adversarial chain (all dispositioned in writing)

ren (6 fixed) → K3 (K3-03 fixed, rest stale/accepted) → qwen3.8 pro (QW-01
wired live, QW-03 key pinned, rest closed). Docs: `DISPOSITION_REN.md`,
`DISPOSITION_K3.md`, `DISPOSITION_QWEN.md`.

## Open at record time

- Release CI green confirmation + manifest/attestation serve checks.
- Kaidera brew formula 0.1.10 (sha256s from the cut assets).
- Local-binary hygiene refresh (SOP) after the standalone cut.
- Operator dogfood drives (PARITY_CENSUS §4); Cortex `openkai` project
  registration (managed-mode ingest).

## CI ownership (Inc 04 mandate, executed at the cut)

The Kaidera org has no `omp-kata` runner — non-PR release jobs queued
forever. Per the epic's Inc 04 mandate ("fork owns making CI trustworthy"),
the heavy-runner label is parameterised: `vars.OMP_HEAVY_RUNNER || 'omp-kata'`
(default unchanged upstream); Kaidera-AI/OpenKai sets it to `macos-14`
(hosted, real display, bazel-capable). The tag was moved to the true release
tip `b65f1ff271` (the CI workflow triggers on main pushes; the release run is
dispatched with the tag at HEAD).

## Post-ship amend (2026-09-03, kai)

Landed on product main after the cut; NOT re-tagged (rides the next cut on CTO
consent), so the published 0.1.10 binaries predate it except the brew channel
below, which was repaired in place.

- **Rebrand + fusion + OMLX batch** `5b7dd76a05` + `51062c9d1e`: pointy-top sharp
  hexagon restored everywhere (brand/splash/welcome segfault-free), shimmer
  pink-family → teal/lime/mint, `update` routed to the OpenKai channel-aware
  upgrade (`update-omp` keeps upstream), ollama keyless lane verified.
  Adversarial fold review dispatched to a kai@k3 session on
  `docs/HANDOFF_KAI_REBRAND_FUSION_REVIEW.md` (fork); findings come back for
  written disposition before the 0.1.11 fold gate.
- **Short-terminal layouts** `f96329d37c` (fixes the K3-era 24-row wizard +
  28-30-row resize regressions): below `PI_LOGO.length + 16` rows the welcome
  box drops the 16-row hero + right column for the Kaidera glyph line, so the
  retired header survives the composer's transient resize reflow.
  welcome/wizard/splash suites 123/0, suite-wide 67/0.
- **Kaidera tap repair** `fb1485e` (tap): the published openkai formula's
  `v#{version}` URLs resolved to the nonexistent tag `v0.1.10` —
  `brew install kaidera-ai/tap/openkai` 404'd on all four assets. Repaired to
  literal `v0.1.010` URLs + `using: :nounzip` (bare binaries); sha256s verified
  against the release SHA256SUMS.txt byte-for-byte.
- **Tap CI** `69ff74d37c`: `release_brew_openkai` (gate-parity to
  `release_brew`, short-circuits cleanly without the key) + `product-version`
  output on `release_metadata` mapping v0.1.010 → 0.1.10. Operator action: add
  the `KAIDERA_TAP_DEPLOY_KEY` secret so future cuts regen the formula.
