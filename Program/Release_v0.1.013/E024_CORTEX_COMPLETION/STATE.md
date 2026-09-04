# STATE — the single current authority for Cortex / OpenKai delivery (E024)

**Authority:** this file supersedes every earlier "current state" claim about Cortex delivery. Older handoffs stay as history and point here. Owner: kai (facts), quill (text). Updated: 2026-09-04. Every line carries its evidence; "observed" means the literal output exists under `evidence/`.

## 1 · Release facts (verified 2026-09-04)

| Fact | Value | Evidence |
|---|---|---|
| Latest public release | **0.1.12** (GitHub release `v0.1.12`, 2026-09-03 10:47Z) | `gh release list --repo Kaidera-AI/OpenKai` |
| npm | `@kaidera/openkai` 0.1.12, `@kaidera/openkai-engine` 0.1.12 (`@kaidera/openkai-core` stays 0.1.9 — the retired 0.84-line package) | `npm view <pkg> version` |
| `latest.json` | version 0.1.12, `openkai-darwin-arm64` etc. with sha256 | `curl …/releases/latest/download/latest.json` |
| Homebrew tap | formula `openkai.rb` version 0.1.12 (a local `brew info` may show a stale 0.1.10 until `brew update`) | `gh api repos/Kaidera-AI/homebrew-tap/contents/Formula/openkai.rb` |
| `scripts/install.sh` default | **still `v0.1.009`** at canonical public tip `a8674ed27e855dc59f3b15277be1ea6989acd4cf` — no public repoint occurred | `A19.md` exact-candidate appendix |
| Exact local 0.1.13 candidate | source `db7f921658c57e943a763a06bf25312d9ac5eef4`; final reviewed implementation ancestor `8aef97f7f4ad2753b0e81627139dec6572270bd2`; public installer automation tip `a8674ed27e855dc59f3b15277be1ea6989acd4cf` | candidate provenance and A19C evidence |
| Consent record for 0.1.12 | CTO confirmed on 2026-09-04 that explicit consent was given in the live 0.1.12 release session; the four external gates were separately waived, not passed | operator confirmation in the E024 build-authorisation session; intent D0 |
| Local candidate | compiled smoke reports `openkai/0.1.13`; ordinary lane has `memory.backend=off` and no `CORTEX_PROJECT` override | exact-candidate automated validation and `A10.md` appendix |
| Shared Cortex observation | actual candidate PTY `/cortex status` reported local `:8501`, project `openkai` registered, default writer `kai`, embedding/rerank state, embed worker healthy, and degradation none; the shared appliance was not mutated | `A3.md` exact-candidate appendix |
| Automated candidate validation | `bun run check` PASS; 559 tests in 25 files and 2016 assertions PASS after the security-test environment isolation fix; build, smoke, and `openkai/0.1.13` PASS | exact-candidate validation record |
| Independent implementation review | Ren returned GO with no findings on `8aef97f7f4ad2753b0e81627139dec6572270bd2` and re-anchored that GO/no-findings verdict to exact candidate `db7f921658c57e943a763a06bf25312d9ac5eef4`; this is not release authorisation | `DISPOSITION_REN_W6.md` |

## 2 · What is implemented vs proven

| Capability | Implemented (source) | Proven (observed) | Gap |
|---|---|---|---|
| Retired local OMP memory pipeline; `off \| cortex`; data-preserving migration/tombstone | yes — reviewed implementation `8aef97f7f4ad2753b0e81627139dec6572270bd2`, folded into candidate `db7f921658c57e943a763a06bf25312d9ac5eef4` | A16 exact-candidate PASS: `local` → `off`, no retired schema/persisted keys, identical legacy file hashes and database rows | no A16 gap; other release gates remain |
| Settings-driven Cortex connection, roster-safe writer, boundary redaction, managed override | yes — exact candidate | A8 PASS with one GET and zero POST/body; A10 PASS with backend off and zero proxy calls through clean exit; A10M PASS with one unchanged persisted `off` setting, managed record/search active, variable removal returning to zero calls, and cleanup to worker healthy/project 404; A15 and A20 scratch drives also cleaned to project 404 | A5–A7/A9 remain unpassed |
| `/cortex status\|preflight\|install\|register\|agent\|doctor\|models` | yes — exact candidate distinguishes KOS dispatcher from installer | A3 actual PTY PASS; A4 actual PTY returned an actionable GitHub URL without raw npm E404/stack | A4 clean-host install/rollback BLOCKED by unpublished installer |
| Embedding/rerank pickers → provider file → admin PATCH | yes | A14 exact-candidate PASS: a stopped embed worker returned HTTP 502, backlog grew 0→1, status/stats overrode empty degradation, lexical search remained available, and cleanup restored a healthy worker with project 404; historical scratch apply/restore and rerank-off evidence also exists | A12 embedding runtime/backlog drain and A13 credentialed rerank remain BLOCKED |
| Transcript ingest (opt-in) | yes | 0.1.12 opt-in path only | default-off, retention, restore, cleanup, and folded-candidate drive remain unpassed |
| Hosted Cortex | generic endpoint settings only | contract boundary recorded in `HOSTED_CORTEX_CONTRACT.md` | provider-owned service/schema/tenancy/lifecycle/acceptance; wholly deferred |
| Backup release gate | deterministic evaluator is in the exact candidate | A17 archive passed freshness, checksum, tar, and layout validation | BLOCKED at `RESTORE_UNAVAILABLE`; disposable restore and inventory comparison remain unavailable |

## 3 · Gates waived or unrun at the 0.1.12 release (historical)

1. Fresh-host install/binary/TUI drive with the public `openkai` assets.
2. Settings-driven local Cortex install → register → record → search cycle (admin token for registration).
3. Live embedding/rerank provider application through Settings → Memory → Cortex Ingest.
4. A live memory round trip that does not touch the production `openkai` project.

## 4 · E024 gate state

- W1 specification review is complete; all findings were accepted in `DISPOSITION_REN_W1.md`.
- W3 is folded into exact local candidate `db7f921658c57e943a763a06bf25312d9ac5eef4`. Its final implementation ancestor is `8aef97f7f4ad2753b0e81627139dec6572270bd2`; Ren returned GO with no findings on both the implementation delta and the exact candidate re-anchoring. Public installer automation tip `a8674ed27e855dc59f3b15277be1ea6989acd4cf` has not repointed the live installer.
- Exact-candidate PASS rows are A3, A8, A10, A10M, A14, A15, A16, A19C, and A20. A10M used one unchanged persisted `off` setting: the managed launch rendered its stop action and recorded/searched, then removing the variables returned the actual TUI to off with zero proxy calls; cleanup left the worker healthy and project 404. A14 made worker HTTP 502 and backlog 1 authoritative over empty degradation, preserved lexical recall, restored the worker healthy, and cleaned to project 404. A15 and A20 likewise finished with project 404.
- A4 is PARTIAL/BLOCKED: its actual PTY unavailable-installer mapping passed, but clean-host install cannot run. A13 is informational and remains BLOCKED without a provider credential; `A13.md` proves only rerank-off, but A13 does not block release. A17 is a BLOCKED gate after reaching `RESTORE_UNAVAILABLE`. Normative statuses and relevance remain in `ACCEPTANCE_MATRIX.md`.
- Other release blockers remain: unpublished Cortex installer; missing typed project archive; A12 provider runtime; fresh-macOS administrator; KOS host availability; remaining non-PASS candidate gates; public installer still at `v0.1.009`; and explicit 0.1.13 consent absent.
- Automated validation passed (`bun run check`; 559 tests/25 files/2016 assertions after fixing security-test environment isolation; build; smoke; `openkai/0.1.13`). These local results and Ren's implementation GO are not release authorisation.
- Decision remains **MAINTAIN / NO-GO**. No 0.1.13 tag, push, publish, public asset, Homebrew change, installer repoint, manifest mutation, or live release occurred.

## 5 · Supersession pointers (history preserved, not rewritten)

- `docs/HANDOFF_KAI_E023_INC06_MEMORY_CORTEX.md` — superseded (already marked).
- `docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md` — implementation/acceptance evidence for 0.1.12; its "no release" boundary predates the 0.1.12 publication; current state is this file.
- `docs/HANDOFF_KAI_CORTEX_COMPLETION_PLAN.md` — the planning mandate; its §1 facts are absorbed here.
- Cortex rows `844f23b2` ("v0.1.11 release ready") and the program `CHANGELOG.md` `[0.1.11]` top entry describe a cut that shipped as **0.1.12** — reconciled in W0 (see the ledger amendment plan).
- `Program/PROGRESS.md` — its stale "Last shipped: E019 — v0.1.9" header was repaired in W0; it now names 0.1.12 and points here.

## 6 · Ledger amendments completed in W0

1. `Program/PROGRESS.md` now says "Last shipped: 0.1.12 (2026-09-03)", names E024, and points to this authority.
2. The program `CHANGELOG.md` now places `[0.1.12]` above `[0.1.11]`, points to the source changelog, and records that the planned 0.1.11 cut shipped as 0.1.12.
3. Cortex status rows `844f23b2`, `6526ddd0`, `8670bb13`, and `b78ac3c0` were reconciled against this file as status notes rather than work.
4. `78f86ec5` (KOS installer pin) was answered with the 0.1.12 tag, asset/checksum, and install/verify facts. D0 is settled: the CTO confirmed explicit 0.1.12 consent.
5. The superseded handoffs carry current-authority pointers.
6. The binding handoff/ledger protocol from `docs/DEVELOPMENT_PROCESS.md` is: one authority file per epic (`STATE.md`); summaries start with `[STAGE]`; no competing "current state" prose outside it; Beat's sweep flags any row asserting a release state absent here.

### Historical update 2026-09-04 (kai) — W2 host-B rows exposed W3 rework
- Host B (cortex-test :8601): the A13 rerank-off subcheck passed but normative credentialed A13 remained BLOCKED; source-tip A15 passed; A12b, former-contract A14, and the original A20 retention drive failed — see the historical table in `ACCEPTANCE_MATRIX.md`.
- Cortex findings: a83d713c (degradation gap; no base-URL knob) + 1e35fbe1 (upsert-by-source; non-servable model swap; backfill-only enrichment) went to kai@kaidera-os; consumer-contract addendum fa52a95d was filed against completed 77db176e (doc at c8270c4852 supersedes the returned summary). Linux half of 138a96cc waited on kos-test. PM beat 12f532c7 returned: no W3 rows before Ren's W1 review.
- At that historical checkpoint, nothing had shipped, there was no consent line, and 0.1.13 was not tagged. The current exact-candidate truth is §1, §2, and §4 above.
