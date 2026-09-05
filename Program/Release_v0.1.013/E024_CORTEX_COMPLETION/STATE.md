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
| Retired local OMP memory pipeline; `off \| cortex`; data-preserving migration/tombstone | yes — reviewed implementation `8aef97f7f4ad2753b0e81627139dec6572270bd2`, folded into candidate `db7f921658c57e943a763a06bf25312d9ac5eef4` | A16 exact-candidate PASS: `local` → `off`, no retired schema/persisted keys, identical legacy file hashes and database rows | no A16 gap; other release gates remain |
| Settings-driven Cortex connection, roster-safe writer, boundary redaction, managed override | yes — exact candidate plus typed lifecycle in Kaidera OS | A5 create/reactivate retained project identity/root/data and exact roster; A8 refused before POST/body; A10 stayed off with zero calls; A10M managed record/search then returned to zero calls; A11 terminal archive returned 404 with unchanged production fingerprint; A15 and A20 also cleaned to project 404; **A6, A7, A9 PASS on 2026-09-05** (settings-driven record/search, default-off/opt-in transcript with retention reported, five-surface redaction — `REMEDIATION_AUDIT.md` §1) | no pre-publish gap remains on this capability; A2-KOS/A4/credentials/consent rows stay external |
| `/cortex status\|preflight\|install\|register\|agent\|doctor\|models` | yes — exact candidate distinguishes KOS dispatcher from installer; standalone installer successor is prepared at `640079bb35ea7077b1b8fad33edbe3f718f94fbc` | A3 actual PTY PASS; A4 dispatcher boundary PASS; installer Node and Bun suites passed 19/19 and its four-file dry-run package contained no payload | A4 remains PARTIAL/BLOCKED until a published clean-host install/status/rollback |
| Embedding/rerank pickers → provider file → admin PATCH | yes | A12 real pinned Ollama drive drained a 0→1 backlog into one 768-dimensional vector, returned vector-only recall, stayed healthy, and restored config/provider state; A14 outage/recovery behavior also PASS | no A12 gap; informational A13 credentialed rerank remains BLOCKED |
| Transcript ingest (opt-in) | yes | 0.1.12 opt-in path only | default-off, retention, restore, cleanup, and folded-candidate drive remain unpassed |
| Hosted Cortex | generic endpoint settings only | contract boundary recorded in `HOSTED_CORTEX_CONTRACT.md` | provider-owned service/schema/tenancy/lifecycle/acceptance; wholly deferred |
| Backup release gate | deterministic evaluator at source commit `588a75a0a4` | newest real archive passes freshness, SHA-256, tar, and KOS custom-dump layout; 16 fixture tests pass | disposable restore runner/appliance inventory comparison |

## 3 · Gates waived or unrun at the 0.1.12 release (historical)

1. Fresh-host install/binary/TUI drive with the public `openkai` assets.
2. Settings-driven local Cortex install → register → record → search cycle (admin token for registration).
3. Live embedding/rerank provider application through Settings → Memory → Cortex Ingest.
4. A live memory round trip that does not touch the production `openkai` project.

## 4 · E024 gate state

- W1 specification review is complete; all findings were accepted in `DISPOSITION_REN_W1.md`.
- W3 is folded into exact local candidate `db7f921658c57e943a763a06bf25312d9ac5eef4`. Its final implementation ancestor is `8aef97f7f4ad2753b0e81627139dec6572270bd2`; Ren returned GO with no findings on both the implementation delta and the exact candidate re-anchoring. Public installer automation tip `a8674ed27e855dc59f3b15277be1ea6989acd4cf` has not repointed the live installer.
- Exact-candidate PASS rows are A3, A5, A6, A7, A8, A9, A10, A10M, A11, A12, A14, A15, A16, A17, A19C, and A20. A6/A7/A9 were driven to PASS on 2026-09-05 by the remaining-gate audit (`REMEDIATION_AUDIT.md`, handoff 679792f1) on the reset scratch appliance with terminal reset+up and production fingerprint unchanged. A5/A11 bracketed the typed archive lifecycle with retained identity/data and unchanged production fingerprint. A12 exercised the real pinned Ollama runtime, one-row backlog drain, 768-dimensional storage, vector-only recall, and full restoration. A17 restored the trusted backup twice, matched all 9 projects/47 roster identities/2,305,615 rows, destroyed the target, and preserved the production fingerprint. A10M, A14, A15, and A20 retained their recorded cleanup proofs.
- A4 is PARTIAL/BLOCKED: its actual PTY boundary and prepare-only installer checks passed, but the published clean-host install cannot run. A13 is informational and remains BLOCKED without a provider credential; `A13.md` proves only rerank-off, but A13 does not block release. Normative statuses and relevance remain in `ACCEPTANCE_MATRIX.md`.
- Other release blockers remain: unpublished Cortex installer; fresh-macOS administrator; KOS host availability; remaining non-PASS candidate gates; public installer still at `v0.1.009`; and explicit 0.1.13 consent absent.
- Automated validation passed (`bun run check`; 559 tests/25 files/2016 assertions after fixing security-test environment isolation; build; smoke; `openkai/0.1.13`). These local results and Ren's implementation GO are not release authorisation.
- Decision remains **MAINTAIN / NO-GO**. No 0.1.13 tag, push, publish, public asset, Homebrew change, installer repoint, manifest mutation, or live release occurred.

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

### Decision 2026-09-04 (CTO, live session) — docs fold into 0.1.13; ren is operator-triggered
- The 304bc0bd documentation suite ships inside 0.1.13 (E024). No docs-only version is cut. E024 keeps the 0.1.13 number.
- ren@openkai stays interactive: the CTO triggers ren in their own session on rows 72215091, 9fc8d889, d774bcda, f58dd706. No console override is set by kai.
- Next for kai: clear the three product-main release-path blockers (PLAN amendment 2026-09-04 (b)) as a PR against product main — agents do not push product main.
### Update 2026-09-05 (kai) — remaining-gate audit (handoff 679792f1)
- A6, A7, A9 driven to PASS on exact candidate `db7f9216` (evidence `A6-0.1.13.md`, `A7-0.1.13.md`, `A9-0.1.13.md`, driver `evidence/e024-a6a7a9-drive.ts`); matrix and this file amended accordingly. Surviving pre-publish gate rows: A2-KOS (host now reachable — drive pending), A2-MAC (administrator), A4 (installer publication); post-publish A1/A18/A19; informational A13 (credential).
- Audit findings F1–F4 in `REMEDIATION_AUDIT.md` §5: scratch image lacks the typed archive route (reset+up is the normative cleanup); `cortex-retain --status` cosmetic `oldest: ?`; kos-test reachable again; three of five SHIP_RECORD blockers removed.
- Remediation waves W-α (release-path code on product main: CI tree, publish fallback, version drift) → W-β (A2-KOS drive, A13 iff key) → W-γ (alpha publication, administrator) → W-δ (consent, W7). Ren adversarial review of the audit dispatched 2026-09-05; review GO gates W-α. Decision remains **MAINTAIN / NO-GO**.
- Handoff `679792f1` return is blocked by platform defect F5 (shared `handoffs_status_check` lacks `returned`/`released`; every cross-agent return 500s — `evidence/PLATFORM_DEFECT_HANDOFF_STATUS_CHECK.md`, filed to kai@kaidera-os). The row stays claimed by kai; completion report and artifacts are complete in this folder. `/complete` was rejected as a workaround (it discards the report and bypasses the review gate).
