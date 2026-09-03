# E022 INC 06 — disposition of ren deep review (2026-09-01)

**Reviewer:** ren@openkai (CPO deep review, separate session) · **Verdict at
review time:** NOT SHIP-READY · **Disposition owner:** kai@openkai (lead)
**Fix commit (fork):** `312e11fe52` on `e022/inc-00-04-tui-consolidation`

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| REN-01 | `OPENKAI_BUILD_CHANNEL` never stamped → witnessed upgrader dead in shipped binaries (blocker) | **FIXED.** `compile-binary.ts` define map gains `OPENKAI_BUILD_CHANNEL: "standalone"`. | Compiled probe with the release define map prints `channel=standalone compiled=true`; without defines (dev) prints `channel=npm`. Real CLI compile: `upgrade --check` reaches the upgrader (witness warning printed), no longer the npm deferral. |
| REN-02 | env channel override could rename the artifact over the node/bun runtime | **FIXED.** `commands/upgrade.ts` refuses the standalone path unless the `PI_COMPILED` stamp (define-rewritten identifier — `Bun.env` is NOT rewritten by Bun's define; `process.env.` is) is present. | Compiled binary passes the guard; `bun`-launched dev run prints the package-managed deferral. |
| REN-03 | `detectTarget` cannot distinguish musl → musl installs upgrade onto a non-starting glibc binary | **FIXED.** `isMuslLinux()` probes `/proc/self/maps` for `ld-musl-`; `detectTarget` emits `linux-musl-*`. Regression tests pin the mapping (incl. darwin never musl). | `openkai-upgrade-trust.test.ts` new describe green. |
| REN-04 | broad TMPDIR silently disables deny-by-containment | **FIXED, refined.** The exemption now applies only when the resolved temp root is genuine scratch: never the operator's home (or an ancestor of it), and only a platform temp root (`/tmp`, `/private/tmp`, `/var/tmp`, `/var/folders`, `/dev/shm`, `/run/user`, Windows temp). Ren's literal bound (tmpRoot ancestor of cwd) was NOT adopted as-is: it would have broken the pinned SDK contract (sessions sandboxed UNDER the real temp must stay exempt). The refined bound closes the reported exploit (TMPDIR=$HOME) and preserves the SDK pattern. | `openkai-floor.test.ts` new describe: TMPDIR=home → containment ON; platform temp → exemption preserved. Both green. |
| REN-05 | prerelease in latest.json reads as newer → witnessed downgrade | **FIXED.** `compareVersions` splits the prerelease; release > prerelease at equal base; prerelease segments compare numerically where numeric. | Regression tests green (`0.1.10` vs `0.1.10-rc.1` etc.). |
| REN-06 | case-sensitive theme vocabulary → `--theme Dark` pins a failing name and suppresses detection forever | **FIXED.** `parseExplicitThemeValue` case-folds. | Regression tests green; existing contract pins unaffected. |

**Also closed in the same commit (surfaced by the review's probes):**
- `openkai upgrade` now compares in the 0.1.x namespace (`PRODUCT_VERSION`), so
  the 0.1.9→0.1.10 self-update path works; a dead manifest yields
  `error: <message>` + exit 1 instead of a raw stack.
- Product version surfaces (KOS vendors by version; nothing named 0.1.10
  before): `openkai --version` → `openkai/0.1.10`; welcome title
  `OpenKai v0.1.10 · engine 18.0.11`; compact splash carries `v0.1.10`.
  `PRODUCT_VERSION` in `openkai/brand.ts` is the fork-line lockstep stamp
  (bump with the CHANGELOG heading and the release tag).

**Cleared by ren with evidence (no action):** DENY_FLOOR fires inside temp
(12-case probe); `toolNames` scoping leaks nothing into restricted sessions;
brew/bun classification survives symlinks; theme precedence/OSC 11 races hold;
secrets/procenv diff formatting-only.

**Verification:** 75/75 openkai gates, 513 composer, 149 cli suites green;
`biome check` + `tsgo --noEmit` clean; compiled-binary drives for `--version`,
`upgrade --check` (dead manifest + compiled guard), channel probe.

**Remaining for the ship gate:** K3 functional pass and qwen3.8 security/UAT
pass (separate sessions, in flight), then CTO consent.

## 2026-09-03 addendum — re-verification restatement on REN-01

ren's re-verification after the post-ship amend batch restated shipped
binaries as classifying `npm` and named the stamp absent from
`compile-binary.ts`. Dispositioned again with evidence:

- The stamp HAS lived in `compile-binary.ts` since `312e11fe52` (the very
  fix this row records); both local compile entries (`build-binary.ts`, CI
  `ci:release:build-binaries`) funnel through `compileCodingAgent`, so
  every compile path carries it.
- Bun's `define` substitutes the bare identifier through `typeof` (proven:
  the review's own probe shape compiles to `TYPEOF string VAL standalone`).
- Shipped 0.1.10 observed: `upgrade --check` reaches the witness
  (`already up to date (0.1.10)`). The npm deferral ren observed is the
  upstream `update` route, whose routing into the witness is part of the
  post-ship amend batch (`5b7dd76a05`) and rides the next cut — a fresh
  compile of main answers `update --check` from the witness.
- A lost define can no longer ship unseen: `--smoke-test` on a compiled
  binary (`PI_COMPILED`) throws unless `BUILD_CHANNEL === "standalone"`
  (fork `7e908eb296`), and release CI smoke-tests every compiled leg
  (ci.yml). Negative leg proven on a real-module probe without the define
  ("classified as channel npm"); positive legs green with the define and
  on the fresh `dist/omp`.

Standing verdict unchanged: FIXED — the re-verification closes with a
permanent release-CI gate rather than relitigating the original fix.
