# E024 / OpenKai 0.1.13 SHIP record

Date: 2026-09-04  
Owner: kai@openkai  
Independent reviewer: RenSourceV2  
Decision: **MAINTAIN / NO-GO**

## Candidate identity

| Surface | Exact state |
|---|---|
| Source candidate | `e024/w3-retire-local` at `db7f921658c57e943a763a06bf25312d9ac5eef4` |
| Final implementation ancestor | `8aef97f7f4ad2753b0e81627139dec6572270bd2` |
| Public installer automation | `a8674ed27e855dc59f3b15277be1ea6989acd4cf` |
| Candidate version | `0.1.13` in engine, wrapper, engine dependency, runtime stamp, lockfile, and changelog |
| Current public release | `0.1.12`; public `scripts/install.sh` still defaults to `v0.1.009` |

The source and public automation worktrees were clean at the recorded tips after their respective checks. The public installer file was not changed; its helper was exercised only on a temporary copy.

## Review and local proof

Ren's first implementation review returned NO-GO with three blockers: provider-transaction concurrency, unvalidated admin wire responses, and secret-bearing successful degradation rendering. All were accepted and fixed. Ren then returned **GO — no findings** on `8aef97f7f4ad2753b0e81627139dec6572270bd2` and re-anchored that verdict to exact candidate `db7f921658c57e943a763a06bf25312d9ac5eef4`. `DISPOSITION_REN_W6.md` is the disposition record. Review GO is not release consent.

Ren's final read-only evidence review also covered the consolidated candidate proof, including A10M/A14/A15. It found one medium documentation inconsistency: informational A13 had been included in release-blocker/resume lists. The controlling records were corrected to keep A13 incomplete but non-blocking; Ren re-read the correction and returned **GO — no findings**. Genuine non-PASS Gate rows still independently require MAINTAIN/NO-GO.

Exact-candidate automated evidence:

- `bun run check`: PASS.
- Candidate suite: 559 pass, 0 fail, 2016 assertions across 25 files.
- Build: PASS.
- Compiled smoke: `smoke-test: ok`.
- Compiled version: `openkai/0.1.13`.
- Binary dry-run: seven intended Darwin, Linux/glibc, Linux/musl, and Windows targets.
- npm dry-run: engine then wrapper planned at 0.1.13; nothing published.
- Temporary-copy installer update/verify: PASS; public file unchanged.

Exact-candidate acceptance PASS rows: **A3, A8, A10, A10M, A14, A15, A16, A19C, A20**.

- A3: actual PTY observed the shared appliance read-only, including registered writer, models, worker health, and degradation.
- A8: refusal occurred after one project GET but before any POST or request body.
- A10: actual PTY remained `off` and generated zero Cortex proxy calls through exit.
- A10M: one unchanged persisted `off` setting became managed Cortex for status/record/search; removing only the managed variables returned an actual PTY to off with zero calls; cleanup left the worker healthy and project 404.
- A14: worker HTTP 502 and backlog 1 overrode empty degradation; lexical search remained available; recovery was healthy; cleanup returned project 404.
- A15: managed environment overrode persisted `off`; direct record/search and actual-PTY status passed; cleanup returned project 404.
- A16: retired settings migrated to `off` without changing legacy files or relevant database rows.
- A19C: local source/package/binary/installer planning agreed on 0.1.13 without public mutation.
- A20: eight writes through four OpenKai paths produced eight rows/IDs; cleanup returned project 404.

## Blocking gate state

A matrix **gate** row that is FAIL, BLOCKED, PARTIAL, or PENDING is not a waiver and blocks release under `ACCEPTANCE_MATRIX.md`. An Info row records evidence but does not block release.

| Blocker | Affected rows | Missing proof |
|---|---|---|
| Cortex installer is unpublished | A4 | Fresh-host preflight, install, status, and rollback |
| Typed Cortex project archive is absent | A5–A7, A9, A11, lifecycle command | Reversible acceptance-project archive/404 plus unchanged production evidence |
| Alternate embedding runtime/backlog drive is unavailable | A12 | Real model application, enrichment backlog drain, and restoration |
| Disposable restore runner is unavailable | A17 | Non-destructive restore, inventory comparison, and target destruction; archive validation alone reached `RESTORE_UNAVAILABLE` |
| Clean KOS host is unreachable | A1-KOS, A2-KOS, A18-KOS | Exact-candidate/public install, TUI, and upgrade drives |
| Fresh macOS administrator is unavailable | A1-MAC, A2-MAC, A18-MAC | Account create, clean-host drives, and account deletion |
| Public 0.1.13 channels do not exist | A1, A18, A19 | npm/GitHub/assets/manifest/Homebrew/installer consistency and install/upgrade proof |
| Exact-version live-session consent is absent | W7 publication | Explicit CTO approval naming `0.1.13` in the current session |

A4 and A17 have useful safe subchecks, but remain non-PASS gate rows. A13 remains BLOCKED because rerank-off is not the credentialed drive, but A13 is explicitly informational and does not block release. No unavailable secret, host, installer, API, or restore capability was fabricated or bypassed.

## Release-control boundary

No consent satisfying `docs/RELEASE_SOP.md` was given for 0.1.13 in this session. Therefore no gated action occurred:

- no release tag or release-tag push;
- no npm publication;
- no GitHub release publication or asset upload;
- no Homebrew or public manifest change;
- no public installer repoint;
- no local installed-binary cutover.

One earlier shared-appliance command accidentally inherited ambient authentication and attempted an administrator PATCH. Cortex rejected it with HTTP 403; no mutation occurred. Subsequent scratch drivers explicitly removed bearer-token variables. The shared appliance otherwise received observation-only status reads.

## Resume conditions

1. Cortex/KOS owners provide the published installer, typed archive operation, independent disposable restore runner, and a working alternate embedding endpoint/backlog exercise.
2. The operator provides a reachable clean KOS host and fresh-macOS administrator. The A13 provider credential may independently complete that informational row through the process-only procedure.
3. Rerun every non-PASS pre-publish **gate** row against this exact candidate. If source changes, create a new exact candidate, rerun affected and release/security checks, and obtain a fresh Ren re-anchoring.
4. Only after every pre-publish gate is PASS may the operator be asked for explicit live-session consent naming `0.1.13`.
5. After consent, follow `docs/RELEASE_SOP.md`: fold the candidate as the release commit, run the one tag pipeline, verify published assets, publish engine then wrapper, update channels, run A1/A18/A19, and perform local-binary hygiene.
6. If publication partially succeeds, resume the same verified version according to the SOP recovery states. A conflicting SHA/version halts and escalates; never overwrite or silently renumber.

Until those conditions hold, the only truthful outcome is **MAINTAIN / NO-GO**.
