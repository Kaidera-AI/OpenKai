# Handoff: kai@openkai (lead) -> kai@openkai (github session) — sync the GitHub fork line

**Date:** 2026-09-03 · **Trigger:** the operator triggers the github session; this
document is self-sufficient. Execute the sync, verify it, and report back.

## Repo topology (ground truth, verified 2026-09-03)

| Checkout / remote | URL | Role |
|---|---|---|
| `~/DevVault/openkai-fork` **main** (branch `e022/inc-00-04-tui-consolidation`, same tip) | `origin` = `Kaidera-AI/openkai-fork` | dev/staging remote; already carries everything below |
| `product` remote of the same checkout | `Kaidera-AI/OpenKai` | **the product GitHub repo** — the surface this handoff updates |
| `~/DevVault/OpenKai` (branch `maintenance/0.84-line`) | `Kaidera-AI/OpenKai` | programme of record (docs/ledgers only); pushed to `maintenance/0.84-line` at `d4858933f3` |

At record time, product main (`98bcbc3436`) is a **strict ancestor** of fork main:
`git rev-list --left-right --count product/main...HEAD` = `0 7`. The sync is a pure
fast-forward; zero divergence to reconcile.

## The sync

```bash
cd ~/DevVault/openkai-fork          # any checkout containing the seven commits works
git push product HEAD:main          # fast-forwards product main to 7e908eb296
```

The seven commits, oldest first (copy for the report):

1. `5b7dd76a05` — `openkai update` routed to the OpenKai channel-aware upgrade
   (brew/bun/npm/standalone, signed manifest); upstream updater kept as `update-omp`.
2. `51062c9d1e` — rebrand+fusion+OMLX batch: pointy-top Kaidera mark in
   brand/splash, shimmer teal/lime/mint, Ollama keyless lane verified, credits.
3. `f96329d37c` — short-terminal layouts (welcome/wizard/splash survive 28-30-row
   viewports); suites 123/0.
4. `69ff74d37c` — Kaidera tap CI (`KAIDERA_TAP_DEPLOY_KEY`-gated formula
   regenerator) + shipped tap formula repair (literal `v0.1.010` URLs, `nounzip`).
5. `7bbbd125a0` — fold gate (ren REV-01/02/03): the 30-col mark renders only into
   fields that hold it whole; permanent gate `test/openkai-welcome-fold.test.ts`.
6. `cafb925e15` — cortex client on the live shared-API contract (`POST /memory`,
   `top_k`); managed-mode round trip green against live Cortex.
7. `7e908eb296` — REN-01 disposition: `--smoke-test` on a compiled binary throws
   unless `BUILD_CHANNEL === "standalone"`; release CI enforces it on every
   compiled leg.

## Rules (do not deviate)

- **No re-tag, no republish of 0.1.10.** The seven commits ride the 0.1.11 cut on
  CTO consent per `docs/RELEASE_SOP.md`. Tags and registry state stay as shipped.
- Do not push the OpenKai programme repo's `maintenance/0.84-line` tip to product
  main — that branch carries docs/ledgers only.
- Do not run release jobs, bump versions, or touch the tap from this sync.

## Verify after the push

- `git -C ~/DevVault/openkai-fork rev-list --left-right --count product/main...HEAD`
  → `0 0`.
- `git log --oneline product/main -1` → `7e908eb296`.
- GitHub release/tag state unchanged: `v0.1.010` still points at the shipped tip.

## What comes next on this line (context, no action)

The operator has commissioned the memory/Cortex redesign for 0.1.11 (E023 scope,
`Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/EPIC_SCOPE.md`): settings>memory
moves to Kaidera Cortex (`https://github.com/Kaidera-AI/cortex`) as the memory
backend in place of Hindsight/Mnemopi, auto-learn becomes `cortex-ingest`, the
Sharpshooter slot becomes an embedding-model picker grouped by provider, and a new
rerank-model selector joins the tab. Design doc lands in the OpenKai programme repo
before code. Expect future fork-main commits referencing cortex; the sync cadence
(big-batch fast-forwards like this one) is unchanged.

## Reporting

One line to the lead when done: the push result + the two verification outputs. If
the push is rejected (non-fast-forward), STOP and report the divergence — do not
force-push.
