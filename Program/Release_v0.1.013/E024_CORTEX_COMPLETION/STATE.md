# STATE — the single current authority for Cortex / OpenKai delivery (E024)

**Authority:** this file supersedes every earlier "current state" claim about Cortex delivery. Older handoffs stay as history and point here. Owner: kai (facts), quill (text). Updated: 2026-09-04. Every line carries its evidence; "observed" means the literal output exists under `evidence/`.

## 1 · Release facts (verified 2026-09-04)

| Fact | Value | Evidence |
|---|---|---|
| Latest public release | **0.1.12** (GitHub release `v0.1.12`, 2026-09-03 10:47Z) | `gh release list --repo Kaidera-AI/OpenKai` |
| npm | `@kaidera/openkai` 0.1.12, `@kaidera/openkai-engine` 0.1.12 (`@kaidera/openkai-core` stays 0.1.9 — the retired 0.84-line package) | `npm view <pkg> version` |
| `latest.json` | version 0.1.12, `openkai-darwin-arm64` etc. with sha256 | `curl …/releases/latest/download/latest.json` |
| Homebrew tap | formula `openkai.rb` version 0.1.12 (a local `brew info` may show a stale 0.1.10 until `brew update`) | `gh api repos/Kaidera-AI/homebrew-tap/contents/Formula/openkai.rb` |
| `scripts/install.sh` default | **still `v0.1.009`** on product `main` — channel defect | `git show origin/main:scripts/install.sh` line 19 |
| Source | fork `main @ c6c7fa7b1b` = tag `v0.1.12`; `e023/inc-06-memory-cortex` contained; `e023/sdlc-adoption @ aeb6770e10` NOT yet folded (review row `d774bcda`) | `git branch --contains` |
| Consent record for 0.1.12 | CTO confirmed on 2026-09-04 that explicit consent was given in the live 0.1.12 release session; the four external gates were separately waived, not passed | operator confirmation in the E024 build-authorisation session; intent D0 |
| Local install (this Mac) | `openkai/0.1.12` via bun; `memory.backend = off`; no `cortex.*` values; no `CORTEX_PROJECT` env | `openkai config list` |
| Cortex appliance | `http://localhost:8501` healthy (v2.3, pgvector); project `openkai` active, roster kai/ren/quill/beat/cole/bob (re-registered 2026-09-03), default writer `kai`; `/degradation` empty | `curl /health`, `/projects/openkai/runtime`, `/degradation` |

## 2 · What is implemented vs proven

| Capability | Implemented (source) | Proven (observed) | Gap |
|---|---|---|---|
| Retired local OMP memory pipeline; `off \| cortex`; data-preserving migration/tombstone | yes — E024 source tip `7fe1ece1dd` | focused tests, coding-agent check, compiled TUI retired-command and first-run smokes | independent W6 adjudication and folded-candidate A16 |
| Settings-driven Cortex connection, roster-safe writer, boundary redaction, managed override | yes — source tip | unit tests; 0.1.12 baseline; scratch managed TUI plus random record/search and destructive scratch reset | candidate A6–A10/A10M gates; typed archive before A5–A9 lifecycle |
| `/cortex status\|preflight\|install\|register\|agent\|doctor\|models` | yes — source tip distinguishes KOS dispatcher from installer | actual TUI status on shared and scratch; actual unavailable-installer message without npm/dispatcher leakage | published installer and clean-host install/rollback |
| Embedding/rerank pickers → provider file → admin PATCH | yes | Mac scratch applied `ollama/nomic-embed-text`, disabled rerank, read back state, and restored prior config | no Ollama model/backlog proof; NVIDIA credential absent |
| Transcript ingest (opt-in) | yes | 0.1.12 opt-in path only | default-off, retention, restore, cleanup, and folded candidate |
| Hosted Cortex | generic endpoint settings only | contract boundary recorded in `HOSTED_CORTEX_CONTRACT.md` | provider-owned service/schema/tenancy/lifecycle/acceptance; wholly deferred |
| Backup release gate | deterministic evaluator at source commit `588a75a0a4` | newest real archive passes freshness, SHA-256, tar, and KOS custom-dump layout; 16 fixture tests pass | disposable restore runner/appliance inventory comparison |

## 3 · Gates waived or unrun at the 0.1.12 release (historical)

1. Fresh-host install/binary/TUI drive with the public `openkai` assets.
2. Settings-driven local Cortex install → register → record → search cycle (admin token for registration).
3. Live embedding/rerank provider application through Settings → Memory → Cortex Ingest.
4. A live memory round trip that does not touch the production `openkai` project.

## 4 · E024 gate state

- W1 specification review: complete; all findings accepted in `DISPOSITION_REN_W1.md`.
- W3 source remediation: source integration tip `7fe1ece1dd`; public installer automation tip `1594ba3676`. Focused tests/check/compiled smokes pass. Independent W6 implementation review is running; neither tip is a public release mutation.
- Scratch availability: the isolated Mac `cortex-test` stack is ready and resettable. Managed record/search passed with scratch-only destructive cleanup. Provider configuration apply/restore passed, but A12 lacks a working Ollama endpoint and non-empty backlog. A14 failed because Cortex returned `{\"degraded\":[]}` while its embed worker was stopped; the worker was restored healthy.
- Baseline A1/A2/A3/A5–A10/A12/A15/A17/A18 remains PARTIAL because it ran on 0.1.12/source-tip or proved only part of the row.
- Release blockers: unpublished Cortex installer; missing typed project archive; no disposable backup restore runner; A12 provider runtime; A14 degradation contract; fresh-macOS administrator; KOS host availability; final candidate/review gates; public installer still at v0.1.009; explicit 0.1.13 consent absent.
- Normative status and evidence names: `ACCEPTANCE_MATRIX.md`. A failure, blocker, or partial observation is never a passed gate.

## 5 · Supersession pointers (history preserved, not rewritten)

- `docs/HANDOFF_KAI_E023_INC06_MEMORY_CORTEX.md` — superseded (already marked).
- `docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md` — implementation/acceptance evidence for 0.1.12; its "no release" boundary predates the 0.1.12 publication; current state is this file.
- `docs/HANDOFF_KAI_CORTEX_COMPLETION_PLAN.md` — the planning mandate; its §1 facts are absorbed here.
- Cortex rows `844f23b2` ("v0.1.11 release ready") and the program `CHANGELOG.md` `[0.1.11]` top entry describe a cut that shipped as **0.1.12** — reconciled in W0 (see the ledger amendment plan).
- `Program/PROGRESS.md` line "Last shipped: E019 — v0.1.9" is stale; W0 rewrites the header to point here.

## 6 · Ledger amendment plan (W0, doc-only, no behaviour claims)

1. `Program/PROGRESS.md` header: "Last shipped: 0.1.12 (2026-09-03); current epic E024; authority `Program/Release_v0.1.013/E024_CORTEX_COMPLETION/STATE.md`".
2. `CHANGELOG.md` (program repo): add `[0.1.12]` above `[0.1.11]` by pointer to `packages/coding-agent/CHANGELOG.md` in the source; mark `[0.1.11]` as "cut renumbered to 0.1.12 at release".
3. Return or close Cortex rows `844f23b2`, `6526ddd0`, `8670bb13`, `b78ac3c0` against this file (they are status notes, not work).
4. `78f86ec5` (KOS installer pin) was answered with the 0.1.12 tag, asset/checksum and install/verify facts. D0 is settled: the CTO confirmed explicit 0.1.12 consent.
5. Header pointers on the two superseded handoffs.
6. Handoff/ledger protocol (binding, from `docs/DEVELOPMENT_PROCESS.md`): one authority file per epic (`STATE.md`), summaries start with `[STAGE]`, no "current state" prose outside it; beat's sweep flags any row that asserts a release state not in STATE.md.

### Update 2026-09-04 (kai) — W2 host-B rows done; W3 = REWORK
- Host B (cortex-test :8601): A13 PASS, A15 PASS, A12b FAIL, A14 FAIL, A20 (new) FAIL — ACCEPTANCE_MATRIX "Observed 2026-09-04", PLAN amendment 2026-09-04.
- Cortex findings: a83d713c (degradation gap; no base-URL knob) + 1e35fbe1 (upsert-by-source; non-servable model swap; backfill-only enrichment) to kai@kaidera-os; consumer-contract addendum fa52a95d filed against completed 77db176e (doc at c8270c4852 supersedes the returned summary). Linux half of 138a96cc waits on kos-test. PM beat 12f532c7 returned: no W3 rows before ren's W1 review.
- Nothing shipped; no consent line; 0.1.13 not tagged.

### Update 2026-09-04 (kai) — 304bc0bd checked: docs landed, no release possible as "v0.1.11"
- Handoff 304bc0bd (main@openkai → kai): docs suite + rebrand verified on product main `3ca5e8c5a6` (descends from GitHub tag v0.1.12; 11 docs present; no omp/oh-my-pi strings left in README/docs except the RELEASE_SOP credit line; `~/DevVault/omp-upstream` tracks can1357/oh-my-pi at 2026-09-04). The cited docs SHA `ee344014c2` does not exist in any clone here; the landed commit is `3ca5e8c5a6`.
- The row asks for a **v0.1.011 tag + npm publish**. Not shippable: 0.1.12 is npm `latest`, the GitHub Latest release and the tap. Nothing in the row changes shipped code (fork `origin/main` = v0.1.12 tag `c6c7fa7b1b` unchanged); only docs, ledgers, `.agents/skills/manifest.json` and `.github/workflows/release.yml` moved. CTO decision pending: fold the docs into the 0.1.13 notes (recommended) or cut a docs-only 0.1.13 and renumber E024.
- **Release blockers found on product main (W6/W7 must clear them):** (1) CI has failed on every push since the cutover — `npm ci` → `No matching version found for @kaidera/openkai-core@0.1.10`: the product repo still carries the 0.84-line package tree (root `package.json` name `openkai` 0.1.11, workspaces `@kaidera/openkai-core` + `@kaidera/openkai`), not the shipped fork tree. (2) `release.yml` on product main dropped the `NODE_AUTH_TOKEN` fallback ("require npm trusted publishing", 3a22a40258) while `@kaidera/openkai@0.1.12` on npm carries registry signatures but **no provenance attestations** — trusted publishing is unproven, so the next workflow publish may fail. (3) product main `package.json` version 0.1.11 < shipped 0.1.12.
- ren@openkai: all four review rows are HELD by the console orchestrator ("interactive without auto_dispatch"); no spawn since 2026-09-02. ren runs only when triggered in a session or flipped to `designation: autonomous`. CTO choice pending.
