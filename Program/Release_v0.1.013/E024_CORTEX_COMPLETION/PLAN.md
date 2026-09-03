# Plan: E024 — Cortex completion (from `EPIC_SPEC.md`, 2026-09-04)

Owner: kai@openkai. Handoff: `docs/HANDOFF_KAI_CORTEX_COMPLETION_PLAN.md` (planning mandate). Worktrees: fork `~/DevVault/openkai-fork` branches `e024/<wave>-<slug>` from `main @ c6c7fa7b1b`; programme repo `maintenance/0.84-line`. Status: **accepted 2026-09-04** with authoritative D0–D6 in the intent. W0 is closed; W1 review and W2 acceptance are open.

## Files that change (by wave; exact paths on fork `main`)
- **W0 (programme repo, docs only):** `Program/PROGRESS.md` (header + line), `CHANGELOG.md` (`[0.1.12]` pointer entry), `docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md` + `docs/HANDOFF_KAI_CORTEX_COMPLETION_PLAN.md` (supersession headers), this folder.
- **W2 (evidence only):** `Program/Release_v0.1.013/E024_CORTEX_COMPLETION/evidence/*.md` (redacted literal output).
- **W3 remediation (fork, conditional on W2 findings + D1):**
  - D1 retirement: `packages/coding-agent/src/memories/index.ts`, `src/memories/storage.ts` (the omp rollout-summary pipeline — delete), `src/memory-backend/local-backend.ts` (delete), `src/memory-backend/{resolve,index,types,tool-names}.ts` (enum `off | cortex`), `src/config/settings-schema.ts` (drop 15 `memories.*` rows + the `local` option; migration `local → off` with notice), `src/config/settings.ts` (migration), `src/internal-urls/memory-protocol.ts` (retire `memory://root`; keep the scheme registered with a pointer error), `src/tools/learn.ts` (Cortex-only), `src/sdk.ts` (`memoryRootEnabled` removal), `src/slash-commands/builtin-lifecycle.ts` + `src/modes/controllers/command-controller.ts` (`/memory` verbs: `view|stats|diagnose|sync` on Cortex; `clear|reset|rebuild|queue` retire with an explanatory message), `src/prompts/memories/{stage_one_*,consolidation*,read-path}.md` (delete), tests: `test/internal-urls/memory-protocol.test.ts`, `test/modes/controllers/memory-command.test.ts`, `test/slash-commands/memory.test.ts`, `test/memory-session-storage.test.ts`, `test/tools/memory-renderer.test.ts`, `test/memory-backend-resolve.test.ts`, `test/agent-session-memory-backend.test.ts`; docs `docs/memory.md`, `docs/openkai-cortex.md`, `README.md`; `FORK.md` (touch-list line).
  - Channel defect: `scripts/install.sh` default → the tag the release pipeline just cut, plus a `ci-release-manifest`/verify step that fails when the default lags `latest.json`.
  - Acceptance-project helper: `src/openkai/cortex-extension.ts` — `/cortex acceptance start|stop` (creates/archives `openkai-acceptance` + `probe`; admin token from the shell) so drives are repeatable; `test/openkai-cortex-extension.test.ts`.
  - Backup eval: `test/openkai-cortex-backup-eval.test.ts` — skips honestly without the backups dir; fails when the newest backup is older than the threshold before a writing drive (the incident's eval).
  - Anything else W2 observes (recorded as REWORK items with a proving test each).
- **W4 (evidence + possibly `src/openkai/cortex/provider-selection.ts`):** provider apply drive; code only if the drive finds a defect.
- **W5 (hosted, conditional):** no OpenKai files until the platform contract lands; `docs/openkai-cortex.md` hosted section rewritten only then.
- **W6:** dispositions in this folder. **W7:** `SHIP_RECORD.md`, `CHANGELOG`, version lockstep via `bun run release 0.1.13`.

## Order of work
1. W0 — write the reconciliation (done: `STATE.md`), pointer headers, ledger lines; return the four status rows and answer the KOS pin **after D0**. Check: `STATE.md` cited by `PROGRESS.md` header; zero contradictory "shipped" lines.
2. CTO decisions D0–D5 recorded in `intent/cortex-completion.md` §Grill (dated). Check: each decision has a line and an owner.
3. W1 — ren reviews `EPIC_SPEC.md` + this plan (review row). Check: disposition file, findings dispositioned, plan amended in the same commit.
4. W2 — acceptance drives (isolated project). Check: every matrix row for W2 has an evidence file with literal output; refusal + redaction rows included.
5. W3 — remediation waves, one worktree each; D1 retirement first (largest), install.sh + acceptance helper + backup eval next. Check: `bun run check` clean, changed-contract tests + a compiled `openkai-next-fork` drive per wave, pasted.
6. W4 — provider apply drive with the admin plane. Check: `/health.embed_model` changed, `cortex-embed --stats` backlog drains, rerank-unset shows vector-only, `/degradation` verbatim.
7. W5 — hosted: platform handoff acceptance criteria only; no OpenKai code.
8. W6 — ren review of W3/W4 tips; kai adjudicates; fold to fork `main`.
9. W7 — release preparation up to the gate; `SHIP_RECORD.md`; the CTO's go for **0.1.13** in the live session; else MAINTAIN.

## Waves
| Wave | Stage | Owner | Worktree / env | Handoff | Delivers | Depends on | Stop/go gate |
|---|---|---|---|---|---|---|---|
| W0 | INTENT/GRILL | kai | programme repo | this mandate | intent, STATE.md (authority), spec, plan, matrix; ledger amendments | — | D0–D6 recorded; programme reconciliation committed |
| W1 | SPEC/PLAN review | ren | — | `[REVIEW] E024 spec+plan` (to mint on acceptance) | disposition on spec/plan | W0 | findings dispositioned |
| W2 | VERIFY (external) | kai (drive) + CTO (clean host, D6) | dev Mac + local appliance; clean host | `[VERIFY] E024 acceptance drives` | evidence files per matrix row (install, register, record/search, ingest, refusal, redaction, rollback) | W0, D4, D6 | all W2 rows observed; failures become W3 REWORK |
| W3 | BUILD/VERIFY | kai / bob | fork `e024/w3-retire-local`, `e024/w3-install-default`, `e024/w3-acceptance-helper`, `e024/w3-backup-eval` | one row per worktree | D1 retirement; install.sh default + verify; `/cortex acceptance`; backup eval; W2 REWORK items | W2, D1 | check clean + tests + compiled drive pasted |
| W4 | VERIFY (external) | kai (drive with admin token from the shell) | dev Mac + local appliance | `[VERIFY] E024 provider apply` | provider apply evidence; cost/fallback policy recorded in `docs/openkai-cortex.md` | W3 | rows observed |
| W5 | BUILD/VERIFY (conditional) | alpha@kaidera (platform) + kai (client) | platform env | cross-project row to alpha | hosted contract + acceptance env; OpenKai client changes only if the contract requires | D3 | deferred unless the contract exists before W7 |
| W6 | REVIEW/ADJUDICATION | ren → kai | reviewed tips | `[REVIEW]` rows per W3/W4 branch | dispositions; adjudication; fold to `main` | W3, W4 | zero open blockers |
| W7 | SHIP or MAINTAIN | kai prepares; CTO authorises | fork `main` candidate | `78f86ec5` (KOS pin) answered | `SHIP_RECORD.md`; `bun run release 0.1.13`; channel verify incl. install.sh + tap + latest.json; KOS pin | W6 | **CTO go, per version, in the live session** — else no publication |

## Risks
- Riskiest step: D1 retirement touches `/memory`, `learn`, `memory://` and 15 settings — blast radius is every session that had `local`; migration `local → off` with a one-time notice, `learned.md` left on disk; irreversible only if we delete user files (we do not).
- Drives that need the admin token or a provider key are operator-present; a missing credential is a **blocked** row with evidence, never a green.
- Two parallel kai sessions: worktree per wave; STATE.md is the merge point.
- Channel drift (install.sh at v0.1.009) can strand fresh installs on the 0.84 line — W3 fixes it and the release verify catches recurrence.

## Proof
- W0: `grep -c "Last shipped: 0.1.12" Program/PROGRESS.md` = 1; `grep -rn "release ready" Program/PROGRESS.md` = 0 contradictions.
- W2/W4: each `evidence/<row>.md` contains the command and its literal (redacted) output; `curl -s localhost:8501/projects/openkai-acceptance` → 404 after cleanup.
- W3: `bun --cwd=packages/coding-agent run check` clean; `bun test test/openkai-*.test.ts test/memory-backend-resolve.test.ts test/internal-urls/memory-protocol.test.ts test/slash-commands/memory.test.ts` green; `openkai-next-fork config list | grep -c "memories\."` = 0 (D1); `scripts/install.sh` default equals `latest.json.version`.
- W7: `npm view @kaidera/openkai version` = 0.1.13; `gh release view v0.1.13`; tap formula version; `latest.json`; install.sh default — all equal.

## Amendments
- 2026-09-04 (W2 drives, dev Mac) — 11 rows observed on the released engine, settings-driven with every `CORTEX_*` env var removed: happy path (A6 record→search on `openkai-acceptance`, production `openkai` 0 hits), transcript ingest (A7), refusal before payload (A8: `CortexAgentRegistrationError`, 0 POSTs), redaction (A9: 0 rows with the fake keys), off = no client (A10), idempotent admin-plane apply (A12, appliance unchanged). Two real defects for W3: `install.sh` default `v0.1.009` (A19) and `/cortex preflight|install` depending on an unpublished `@kaidera-ai/cortex` package (A4 — blocked on the Cortex package owner; the command must degrade honestly). Cortex-side findings filed to kai@kaidera-os. A12's real model change and A14's degradation drill move to the clean host (shared appliance protection).
- 2026-09-04 — Accepted with D0–D6: explicit 0.1.12 consent confirmed; retire `local`; no importer; hosted deferred behind contract; stable `openkai-acceptance`/`probe`; transcripts off by default; clean-host proof on both the KOS test VM and a fresh macOS user account. W0 executed: STATE.md authority, ledger header, `[0.1.12]` changelog pointer, four status rows returned, KOS installer pin answered (`78f86ec5`), W1 review row minted. Evidence rows A3 (API-probe form; TUI form remains an operator drive) and A17 (backup age 29 h, threshold 48 h) are recorded under `evidence/`.
- 2026-09-04 — KOS readiness/attention event contract (design 27) is not present as typed events in 0.1.12 (OSC 9/777 notifications + hub `state` frames only): added to W3 as a REWORK candidate pending KOS's schema.
