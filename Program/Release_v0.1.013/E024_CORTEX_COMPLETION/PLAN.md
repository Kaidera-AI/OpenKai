# Plan: E024 — Cortex completion (from `EPIC_SPEC.md`, 2026-09-04)

Owner: kai@openkai. Handoff: `docs/HANDOFF_KAI_CORTEX_COMPLETION_PLAN.md`. Source worktrees branch from `Kaidera-AI/openkai-fork main @ c6c7fa7b1b`; public-channel work branches from current `Kaidera-AI/OpenKai origin/main`; programme documents stay on `maintenance/0.84-line`. Status: **W0 and W1 closed; W3 source-only remediation GO; W2/W4 mutation drives and W7 release remain gated.** Authoritative decisions D0–D6 are in the intent; W1 dispositions are in `DISPOSITION_REN_W1.md`.

## Repository boundaries

- **Source product:** `/Users/amadmalik/DevVault/openkai-fork`; application code, product tests, package metadata, and the private release handoff.
- **Canonical public channel:** `/Users/amadmalik/DevVault/OpenKai` at current `origin/main`; public workflow and `scripts/install.sh`. The maintenance branch contains an obsolete tag-trigger workflow and must never overwrite the workflow on public main.
- **Programme record:** this E024 folder and programme ledgers on `maintenance/0.84-line`.
- **Cortex platform:** external dependency owned by alpha@kaidera; OpenKai uses typed API/CLI contracts only and never direct database access.

## Files and deliverables by wave

### W0 — programme reconciliation (done)

`Program/PROGRESS.md`, root `CHANGELOG.md`, supersession headers, intent, `STATE.md`, this spec/plan/matrix, and the KOS pin response.

### W1 — independent specification review (done)

`DISPOSITION_REN_W1.md` plus same-change amendments to `EPIC_SPEC.md`, `PLAN.md`, and `ACCEPTANCE_MATRIX.md`. W1 is a hard dependency of every build path.

### W2 — baseline and final acceptance evidence

Only `evidence/*.md`. Existing 0.1.12 files are PARTIAL baseline. Final drives use the matrix’s candidate-specific names. Shared-appliance writes are prohibited. A5–A7/A9/A11 require the Cortex archive API and scratch appliance; A4 requires the published installer; macOS rows require an administrator.

### W3A — retire local OpenKai memory

Source worktree `e024/w3-retire-local`.

- Delete `packages/coding-agent/src/memories/{index,storage}.ts`, `src/memory-backend/local-backend.ts`, local consolidation/read-path prompts, package exports, and the unused direct `@oh-my-pi/pi-mnemopi` dependency.
- Make the backend contract `off | cortex`; remove local queue/clear maintenance APIs; retain `view|stats|diagnose|sync`; retired destructive/queue verbs return one explanatory pointer.
- Migrate `memory.backend=local` and all sixteen `memories.*` keys to `off`, drop every legacy key, show one data-preserving notice, and leave the complete memory root and database rows untouched.
- Register `memory://` only as a tombstone pointing to `cortex_search` and retained files; remove memory glob/hyperlink behavior.
- Remove local startup/session cancellation, `memoryRootEnabled`, system-prompt advertisement, and local `learn` fallback. Managed `CORTEX_PROJECT` remains the explicit policy override and must be visible.
- Rewrite changed-contract tests and user documentation; remove tests that exercise only the deleted pipeline. Add migration, managed precedence, tombstone, retired command, and data-retention coverage.

### W3B — Cortex launcher and acceptance defects

Source worktree `e024/w3-cortex-lifecycle`.

- Distinguish the KOS `cortex dispatcher` from the unpublished `@kaidera-ai/cortex` installer. `/cortex preflight|install` must return a plain, actionable unavailable-installer result instead of npm E404.
- Keep lifecycle operations on typed installed Cortex binaries/APIs; never route them through the installer package.
- Do not claim `/cortex acceptance stop` until Cortex publishes a typed archive operation. Once the contract exists, start/reactivate and stop/archive must be one `try/finally` lifecycle with production-state comparison.
- Fix only acceptance-observed client defects. The first-run “Welcome back” copy and any KOS typed-event proposal require separate proving tests; typed KOS readiness events are out of this epic unless KOS supplies its schema.

### W3C — backup evaluator

Source worktree `e024/w3-backup-eval`.

- Deterministic helper accepts backup root, clock, threshold, checksum/integrity checker, and restore runner; missing/stale/corrupt/restore-mismatch results fail.
- Unit tests use disposable fixtures. The permanent test suite never depends on developer `~/.kaidera-os/backups` and never skips a release gate.
- A17 integration invokes the helper against a real backup and disposable Cortex appliance; that drive remains BLOCKED until KOS/Cortex provides the restore target and command.

### W3D — public installer channel

Canonical worktree/branch from current public `origin/main`, never the maintenance branch.

- Add a tested canonical helper that updates and verifies the default in `scripts/install.sh` for an exact `0.1.N` input.
- Add a release-workflow job after `publish_release` that checks out canonical main without source materialization, applies that exact version, commits only an actual change, and verifies the public file. `release_brew` waits for this job.
- Merging reusable workflow logic is allowed after review. Repointing the live default, manually or by dispatch, remains RELEASE_SOP gated action 5 and occurs only in W7 after explicit consent for that version.

### W4 — provider and degradation acceptance

No code unless a scratch drive exposes a client defect. A12–A14 run only on a disposable appliance, snapshot full server configuration/provider file/health/degradation, restore in `finally`, and prove restoration. Missing scratch appliance or credential is BLOCKED.

### W5 — hosted Cortex contract only

`HOSTED_CORTEX_CONTRACT.md` records endpoint/token issuance, TLS/auth, tenancy, roster/archive lifecycle, retention/export/delete, limits, errors, cost/fallback, observability, compatibility, acceptance, and rollback. Hosted implementation and client changes are wholly deferred from 0.1.13.

### W6 — review and adjudication

Ren reviews each W3 tip and W4 evidence; kai writes dispositions and folds only accepted tips to source/public main. Reviewer and author never self-approve.

### W7 — candidate and release

Prepare version lockstep, changelog, dry-run, SHIP_RECORD, A19C, and all candidate gates. Then request explicit live-session CTO consent naming **0.1.13**. Without it: MAINTAIN; no tag, publish, public asset, Homebrew change, installer repoint, or manifest bump. After consent, run the private source handoff/canonical workflow and all post-publish rows.

## Execution order

1. Close W0 and record D0–D6. **Done.**
2. Independent W1 review; disposition every finding and amend controlling documents together. **Done.**
3. Build W3A/W3B/W3C/W3D in isolated non-overlapping worktrees. W3 depends on W1 and the initial W2 defect inventory, not on falsely green external gates.
4. Validate each changed contract, compile the candidate, and smoke the changed surface. No shared Cortex mutations.
5. Obtain Cortex archive/install/restore prerequisites and a disposable appliance; then rerun W2 writing rows and W4 provider rows in matrix order with unconditional cleanup.
6. Run both D6 clean-host candidate rows. The fresh macOS row needs an operator with administrator access.
7. Ren reviews W3/W4; kai adjudicates and folds accepted tips.
8. Run final candidate gates on the folded SHA. Resolve every non-PASS gate.
9. Prepare release record and stop at the consent gate. Only explicit 0.1.13 consent starts publication.
10. Run post-publish channel/install/upgrade checks; close SHIP only when all PASS.

## Waves

| Wave | Owner | Environment | Depends on | Exit |
|---|---|---|---|---|
| W0 | kai | programme repo | — | reconciliation and D0–D6 committed |
| W1 | Ren role → kai | read-only review + programme repo | W0 | all findings dispositioned in controlling docs |
| W2 | kai + operators | dev observation, scratch, both clean hosts | W1; row prerequisites | every candidate gate PASS; cleanup proof present |
| W3A | kai | source worktree | W1, D1/D2, baseline findings | changed-contract tests, typecheck, compiled smoke |
| W3B | bob/kai | source worktree | W1, installer facts; archive contract for acceptance stop | launcher defect fixed; unavailable platform behavior honest |
| W3C | bob/kai | source worktree | W1, backup contract | deterministic evaluator green; integration contract explicit |
| W3D | kai | canonical current-origin/main worktree | W1, public release workflow | reviewed update/verify automation; no live repoint |
| W4 | kai + operator | scratch appliance | W3, archive/restore, credentials | A12/A14 PASS; A13 recorded |
| W5 | alpha@kaidera + kai | contract only | D3 | contract recorded; no 0.1.13 code |
| W6 | Ren role → kai | reviewed tips | W3, W4 | zero unresolved review blockers; accepted tips folded |
| W7 | kai prepares; CTO authorises | folded source + canonical public main | W2, W4, W6, A19C | consented release; post-publish rows PASS |

## Active external blockers

| Dependency | Owner | Blocks | Required proof |
|---|---|---|---|
| Published local Cortex installer | alpha@kaidera | A4, W7 | clean-macOS preflight/install/status/rollback |
| Typed Cortex project archive operation | alpha@kaidera | A5–A7, A9, A11, W4 | archived/404 plus unchanged production hashes |
| Disposable Cortex appliance + restore command | KOS/Cortex owner | A12–A14, A17 | full snapshot restoration and backup inventory match |
| Fresh macOS administrator | CTO/operator | A1-MAC, A2-MAC, A18-MAC | account create/drive/delete evidence |
| Provider credential | operator | A13 only | redacted rerank apply/search/restore evidence |
| Live version-specific consent | CTO | all W7 mutations | explicit “0.1.13” approval in that session |

## Verification

- W3A: coding-agent check, focused changed-contract tests, compiled binary smoke, schema listing with zero `memories.*`, migration fixture byte/row comparison, managed-lane on/off proxy counts.
- W3B: launcher classification and error-contract tests plus actual TUI `/cortex preflight` unavailable path; no npm stack/E404 leak.
- W3C: deterministic fresh/stale/missing/corrupt/restore-match/restore-mismatch tests; A17 is separate external evidence.
- W3D: helper tests with valid, malformed, same-version, and changed-version fixtures; workflow syntax; no `VERSION` change in the preparatory commit.
- W2/W4: every matrix file records candidate SHA/version, environment reset, command, literal redacted output, `finally` result, and production-state comparison.
- W7: npm packages, GitHub release/assets, witnessed `latest.json`, Homebrew formula, public installer default, both public installs, and both upgrade rows agree on 0.1.13.

## Partial-release recovery

1. **Prepared source/tag/canonical draft only:** verify tag → candidate SHA and draft provenance; run `bun run release -- 0.1.13 --resume`.
2. **Draft workflow failed before any public package:** retain draft, fix/review candidate or workflow without changing provenance, rerun the verified same-version workflow.
3. **npm public; GitHub still draft:** halt installer/tap actions, verify npm tarball/version/provenance, resume the same version. Never republish or renumber to hide the split.
4. **GitHub public; installer or tap stale:** keep the immutable release, repair only the failed channel to the same candidate, then rerun every A19 check and clean-host install.
5. **Conflicting tag, package, manifest, or source SHA:** halt and escalate to CTO. Never force-move, clobber, or silently issue another version.

## Risks

- D1 touches settings, session startup, tools, commands, internal URLs, prompts, docs, and package exports. The invariant is zero deletion or mutation of legacy user bytes/rows.
- Environment-managed activation can surprise a user reading only local settings; the UI/status must name the override and its removal action.
- A synthetic drive without archive/restore can contaminate shared state; therefore no mutation starts while A11/A17 are blocked.
- The public installer currently strands new installs at v0.1.009. W3D fixes recurrence machinery; the actual channel remains gated.
- Two repositories participate in release. Source materialization replaces the canonical workspace during build jobs; the installer-update job must intentionally use an unmaterialized canonical checkout.

## Amendments
- 2026-09-04 (CTO) — Non-shared test appliances approved: (A) the kos-test VM (Linux) and (B) a Mac scratch stack `cortex-test` beside the shared one. Setup requested from kai@kaidera-os (Cortex owner) by cross-project handoff; kai@openkai drives A4, A12b, A13, A14, A15 on BOTH hosts once each returns healthy with `openkai-acceptance`/`probe`, two embedding options and a reset command. The shared :8501 stack is never used for destructive rows.

- 2026-09-04 (W1) — independent review returned NO-GO. All twelve findings accepted in `DISPOSITION_REN_W1.md`; baseline PASS labels reclassified PARTIAL, A11 corrected to BLOCKED, A4 promoted to gate, D6 split, provider/backup isolation strengthened, installer ownership corrected, W1 made a hard dependency, managed precedence fixed, and release recovery specified.
- 2026-09-04 (baseline) — KOS A1/A2/A18 and dev A3/A5–A10/A12/A17 observed on 0.1.12. They are useful defect evidence, not final-candidate gates. A4 is blocked by the unpublished installer; A11 is blocked by the missing archive API; A19 fails because the public installer defaults to v0.1.009.
- 2026-09-04 (scope) — a typed KOS readiness-event contract is absent. It is deferred to its own intent unless KOS supplies a schema; E024 does not invent one.
