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
| Consent record for 0.1.12 | **none found** in `Program/PROGRESS.md`, the E023 folder or the finalisation handoff; the completion handoff states the external gates were "waived for the 0.1.12 release" | grep "consent" 2026-09-04 — open item D0 |
| Local install (this Mac) | `openkai/0.1.12` via bun; `memory.backend = off`; no `cortex.*` values; no `CORTEX_PROJECT` env | `openkai config list` |
| Cortex appliance | `http://localhost:8501` healthy (v2.3, pgvector); project `openkai` active, roster kai/ren/quill/beat/cole/bob (re-registered 2026-09-03), default writer `kai`; `/degradation` empty | `curl /health`, `/projects/openkai/runtime`, `/degradation` |

## 2 · What is implemented vs proven

| Capability | Implemented (source) | Proven (observed) | Gap |
|---|---|---|---|
| `memory.backend = off \| local \| cortex`, legacy migrations, sharpshooter friction gate in cortex-ingest | yes — fork main | unit + live tests (`openkai-cortex-memory`, `openkai-cortex-extension`, `openkai-cortex-live` 28+3) | **`local` (omp rollout pipeline) still ships** — D1 |
| Settings-driven connection, roster-safe writer, redaction at the Cortex boundary, evidence cleaning | yes | tests; live record→search round trip against `openkai` (2026-09-03) | the live test wrote markers into the production project — must move to an acceptance project (§B) |
| `/cortex status\|preflight\|install\|register\|agent\|doctor\|models` | yes | help/registration tests | install/register never observed on a fresh host; `register` needs `CORTEX_ADMIN_TOKEN` |
| Embedding/rerank pickers → provider file → admin PATCH | yes | file-write + injected-fetch tests | never applied against the live appliance with a real admin token + provider credential |
| Transcript ingest (opt-in) | yes | live 409/200 path once, roster agent resolved | retention/deletion expectations undocumented |
| Hosted Cortex (`cortex.apiUrl`/`token`) | client rows only | none | platform dependency (alpha@kaidera) unowned in the ledger |
| Backups | — | the 2026-08-15→08-31 restore lost 16 days (handoff `129cc50e`) | no OpenKai-side eval; backup cadence unproven |

## 3 · The waived / unrun gates (were never passed)

1. Fresh-host install/binary/TUI drive with the public `openkai` assets.
2. Settings-driven local Cortex install → register → record → search cycle (admin token for registration).
3. Live embedding/rerank provider application through Settings → Memory → Cortex Ingest.
4. A live memory round trip that does not touch the production `openkai` project.

## 4 · Supersession pointers (history preserved, not rewritten)

- `docs/HANDOFF_KAI_E023_INC06_MEMORY_CORTEX.md` — superseded (already marked).
- `docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md` — implementation/acceptance evidence for 0.1.12; its "no release" boundary predates the 0.1.12 publication; current state is this file.
- `docs/HANDOFF_KAI_CORTEX_COMPLETION_PLAN.md` — the planning mandate; its §1 facts are absorbed here.
- Cortex rows `844f23b2` ("v0.1.11 release ready") and the program `CHANGELOG.md` `[0.1.11]` top entry describe a cut that shipped as **0.1.12** — reconciled in W0 (see the ledger amendment plan).
- `Program/PROGRESS.md` line "Last shipped: E019 — v0.1.9" is stale; W0 rewrites the header to point here.

## 5 · Ledger amendment plan (W0, doc-only, no behaviour claims)

1. `Program/PROGRESS.md` header: "Last shipped: 0.1.12 (2026-09-03); current epic E024; authority `Program/Release_v0.1.013/E024_CORTEX_COMPLETION/STATE.md`".
2. `CHANGELOG.md` (program repo): add `[0.1.12]` above `[0.1.11]` by pointer to `packages/coding-agent/CHANGELOG.md` in the source; mark `[0.1.11]` as "cut renumbered to 0.1.12 at release".
3. Return or close Cortex rows `844f23b2`, `6526ddd0`, `8670bb13`, `b78ac3c0` against this file (they are status notes, not work).
4. Answer `78f86ec5` (KOS installer pin) with the 0.1.12 facts above — tag `v0.1.12`, asset URLs + sha256 from `latest.json`, install/verify commands — once D0 is settled.
5. Header pointers on the two superseded handoffs.
6. Handoff/ledger protocol (binding, from `docs/DEVELOPMENT_PROCESS.md`): one authority file per epic (`STATE.md`), summaries start with `[STAGE]`, no "current state" prose outside it; beat's sweep flags any row that asserts a release state not in STATE.md.
