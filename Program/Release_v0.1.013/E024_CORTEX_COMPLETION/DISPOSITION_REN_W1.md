# W1 disposition — E024 specification and plan

Review: independent `E024SpecReview` in the Ren review role, 2026-09-04. Initial verdict: **NO-GO for W2 mutation drives and W3 build**. Owner of disposition: kai@openkai.

## Decision

All twelve findings are accepted. The specification, plan, and acceptance matrix are amended in the same change. After those amendments:

- **W2:** GO only for non-mutating observation and candidate preparation. Any drive that writes Cortex state remains blocked until the acceptance-project archive operation, backup restore proof, scratch appliance, and required operator credentials exist.
- **W3:** GO for source-only remediation and deterministic tests after W1 closes. It may not mutate the shared appliance, repoint a public channel, or claim an unavailable Cortex platform operation.
- **W7:** NO-GO. A gate is not satisfied by observing a failure. Every pre-publication gate must PASS on the folded candidate SHA; every post-publication channel check must PASS before SHIP can close. The live `0.1.13` release actions still require version-specific CTO consent in that session.

## Findings

| # | Finding | Disposition and amendment |
|---|---|---|
| 1 | Final-candidate gate semantics | **Accepted.** `PASS`, `FAIL`, `BLOCKED`, `PARTIAL`, and `PENDING` are defined. Historical 0.1.12 evidence is baseline only. Non-PASS pre-publication gates block gated release actions; post-publication verification failures enter the documented recovery state and block SHIP closure. |
| 2 | Both D6 clean hosts | **Accepted.** KOS and fresh-macOS rows/evidence are split. KOS baseline evidence does not satisfy the macOS row or the 0.1.13 candidate rerun. Fresh macOS account creation is currently blocked because non-interactive administrator access is unavailable. |
| 3 | Missing project archive | **Accepted.** A11 is BLOCKED, not PASS. Cortex must provide a typed archive operation; direct database access is forbidden. Cleanup belongs in a `finally` path and must prove archived/404 plus unchanged production state. `/cortex acceptance stop` cannot be called complete before this contract exists. |
| 4 | Local install journey | **Accepted.** A4 is a release gate. The Cortex package owner must publish the installer payload and a clean host must pass preflight, install, status, and rollback. OpenKai may improve the unavailable-launcher message, but honest degradation is not acceptance. |
| 5 | Provider rollback | **Accepted.** A12–A14 move to a scratch appliance. Each drive snapshots server config, provider file, health, and degradation, restores in `finally`, and compares the restored state. The shared dev appliance is observation-only. |
| 6 | Transcript and secret sinks | **Accepted.** A7 adds default-off/no-ingest and retention-status proof, restores the setting, and keeps opt-in proof. A9 remains PARTIAL until captured request payload, stored rows, error output, and provider file are all scanned under a no-history credential procedure. |
| 7 | D1 and backup data-loss proof | **Accepted.** A16 is unconditional and hashes the complete legacy memory root plus relevant `agent.db` rows before/after migration. A17 requires freshness, checksum/integrity, and a non-destructive restore to a disposable appliance; missing backup evidence is BLOCKED, never skipped. |
| 8 | Public installer repository and gate | **Accepted.** The live pin is `Kaidera-AI/OpenKai` public `main`, not `openkai-fork/scripts/install.sh`. W3 may prepare a branch and consistency check. Changing the live default is RELEASE_SOP gated action 5 and occurs only in W7 after explicit consent for the named version. |
| 9 | W1 dependency | **Accepted.** W3 now depends on W1 and the initial W2 defect inventory. W5 is wholly deferred; no hosted client tip may enter W7 without a new reviewed plan. |
| 10 | Managed `off` precedence | **Accepted as clarification of the existing KOS lane.** `CORTEX_PROJECT` is managed policy and overrides the local `memory.backend=off` value. The UI/status must say the managed lane is active. Removing `CORTEX_PROJECT` from the launching environment is the exact stop action. A10 covers ordinary off; A10M covers managed precedence and removal. |
| 11 | Partial-release recovery | **Accepted.** Release is not called atomic. Recovery states are: prepared source/tag/draft only → `--resume`; draft assets only → rerun verified workflow; npm public but GitHub draft → halt channel cutovers, verify npm, resume the same version; GitHub public but installer/tap stale → keep the release, repair only the failed channel for the same candidate, then rerun all channel checks; conflicting SHA/version → halt and escalate, never overwrite. |
| 12 | Partial A1/A2/A3 observations | **Accepted.** Explicit-asset install, keyless boot to provider wizard, and API probe are PARTIAL baseline observations. Exact public installer/Homebrew, in-TUI `/cortex status`, both clean hosts, and final-candidate reruns remain open. |

## Additional source-materialization correction

The local programme branch contains an obsolete tag-triggered `release.yml`; public `origin/main` contains the current `workflow_dispatch` source-materialization pipeline used by `openkai-fork/scripts/openkai-release.ts`. W3/W7 changes must branch from current public `origin/main`, never copy the stale maintenance-branch workflow over it.

## Exit

W1 closes when this disposition and the amended `EPIC_SPEC.md`, `PLAN.md`, and `ACCEPTANCE_MATRIX.md` are committed together. The review author does not approve implementation or release.