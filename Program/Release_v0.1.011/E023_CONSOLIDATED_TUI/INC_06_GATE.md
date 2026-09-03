# E023 Inc 06 — memory/Cortex upgrade: gate evidence (2026-09-03)

**Branch:** `e023/inc-06-memory-cortex` (fork, cut from `origin/main` @ `7e908eb296`) ·
**Spec:** `MEMORY_CORTEX_DESIGN.md` v2 (§5 layout, §6 verification) · **Handoff:**
`docs/HANDOFF_KAI_E023_INC06_MEMORY_CORTEX.md` · **Operator:** triggered 2026-09-03
("update openkai … cortex to replace the memory … settings>memory"), plus the same-turn
rider "add oMLX in the providers and show its models in /model".

## §3 decisions used (trigger message was silent — recommended defaults, recorded here)

1. Rerank picker brand: **Marksman** (row label "Rerank model (Marksman)").
2. Old sharpshooter decision files: **left as plain docs**; `/memory stats` lists them and
   names the one-shot `cortex-ingest-memories --path <dir>` import.
3. Hosted Cortex review window: **v0.1.13 confirmed** (EPIC_SCOPE §Future unchanged).

## What landed (one paragraph)

`memory.backend` = `off | local | cortex`. Hindsight, Mnemopi and Sharpshooter retire with
migration rows (`hindsight|mnemopi|mnemosyne → cortex` + `cortex.migratedFrom` notice,
`sharpshooter → off`, `autolearn.enabled → skills.managed`); Auto-Learn's capture turn
retires and its ≥N-tool-calls gate + Sharpshooter's delta extractor and friction filter
are ported into **cortex-ingest** (post-stop, `cortexingest.*`), which records
friction-earned decisions to Cortex (`POST /memory`, decisions/learnings sections) and
optionally the transcript at session end (`POST /sessions/ingest`). Settings > Memory
gains the **Cortex** group (status/apiUrl/token/project/agent/auto-recall/migration
notice) and the **Cortex Ingest** group (enabled/transcripts/extraction model/embedding
picker/optional Marksman rerank picker) — pickers seeded per provider (Ollama local,
NVIDIA NIM free, OpenRouter, DashScope) with free/paid badges and live enrichment;
selection authors `providers.embedding|rerank` in `~/.openkai/config.json` and applies to
the live appliance through `PATCH /admin/cortex/config` when `CORTEX_ADMIN_TOKEN` is set
(pending-and-said-so otherwise). `/cortex status|preflight|install|doctor|models` is the
operator flow (install runs preflight, then installs on explicit confirmation). The
`cortex_search`/`cortex_record` tools are settings-driven and always registered; `learn`
writes to Cortex; first-turn auto-recall replaces flat injection. Docs rewritten; every
vectorize-io reference gone; FORK.md touch-list extended. Rider: **oMLX** registered as a
keyless local provider (identity-checked via `owned_by: "omlx"`, endpoint from
`OMLX_BASE_URL` → `~/.omlx/settings.json` → `:8000/v1`), so its MLX models list in `/model`
whenever the server answers; plus the rebrand sweep of 11 user-facing "Oh My Pi" strings.

## Design §6 verification — evidence

| Line | Evidence | Result |
|---|---|---|
| Capture ⇒ `cortex-search` round trip with NO env (settings-driven) | `test/openkai-cortex-live.test.ts` "record → search round trip lands the lesson": `Settings.isolated({memory.backend: cortex, cortex.project: openkai})`, env `CORTEX_*` deleted, `recordMemory` then `search(marker)` — found on the live appliance (:8501, v2.3) | **green** |
| `cortex preflight`/`cortex-doctor` after the TUI install flow | `/cortex install` shells the published launcher (`cortex` on PATH or `npx @kaidera-ai/cortex`): preflight → `ctx.ui.confirm` → install → re-probe. The appliance here is already running (KOS stack), so the install leg is exercised as **status + preflight path only**; `cortex-doctor` verbs are named on the status/diagnose rows. Operator drive pending on a clean host. | **partial (env)** |
| Provider single authorship; `cortex-embed --stats` draining with the chosen model | `applyCortexProviderSelection` writes `providers.embedding` (`~/.openkai/config.json`, atomic 0600) — unit-proven; live apply through `PATCH /admin/cortex/config` proven with an injected fetch (header + body pinned). No `CORTEX_ADMIN_TOKEN` in this shell ⇒ the live embed backlog drain could not be observed; the status row reports the pending state loudly. **Contract note:** the Cortex repo on disk ships docs + installer only; the live API's provider seam is the admin config row, not a file reader — recorded as a Cortex-side follow-up. | **partial (admin plane)** |
| Picker shows every configured provider as a group, badges on seeded rows | `catalogOptions()` unit tests: 4 embedding provider groups, `[free · local]`/`[free]`/`[paid]` badges, live-discovered rows tagged `discovered`; selector renders "Embedding model" + "Rerank model (Marksman)" under Cortex Ingest | **green** |
| Rerank-unset ⇒ degradation row visible, never silent | rerank picker's first option is "— none (vector-only search)" with the loud description; status row prints "rerank: off — vector-only" when `/health.rerank_enabled === false`; `/memory stats` prints Cortex's `/degradation` list | **green** |
| Migration fixtures per retired value | `test/settings-manager.test.ts`: hindsight→cortex(+notice), mnemosyne/mnemopi→cortex(notice "mnemopi"), sharpshooter→off, explicit cortex untouched, autolearn.enabled→skills.managed | **green** |
| Transcript ingest (opt-in) | live: `POST /sessions/ingest` accepted; `/sessions/ingested-ids` contains the uuid. Two live-contract findings folded in: `messages[].ts` must be an ISO string (422 on numbers) and the writing agent must be a **roster** agent (403 for the "openkai" placeholder) — `effectiveCortexAgent()` resolves the project's default agent when none is configured (`cortex.agent` / `OPENKAI_AGENT` override) | **green** |

## Gate suite

| Gate | Command | Result |
|---|---|---|
| Typecheck | `bun run check:types` (tsgo) | clean |
| Lint/format | `bunx biome check .` | clean (0 findings) |
| OpenKai + memory suites | `bun test test/openkai-*.test.ts` + 15 memory-touching suites | **497 pass / 0 fail** (33 files) — includes the 3 live Cortex gates against :8501 |
| cli suites | `bun test test/cli*.test.ts test/cli/*.test.ts` | **149 pass / 0 fail** |
| composer (packages/tui) | `bun test --parallel test/*.test.ts` | **1399 pass / 0 fail** |
| Compiled build | `PATH=$HOME/.cargo/bin:$PATH bun run build` | see addendum below |

Retired test surface (deleted with the backends): 22 suites (hindsight-*, mnemopi-*,
sharpshooter-*, autolearn-*, memory-tools, issue-3031/7352 repros, sdk-autolearn-active-tools).
Adapted: settings-manager, memory-backend-resolve, agent-session-memory-backend,
dispose-concurrent (Cortex flush is the gated writer), message-pipeline (fake backends gain
`resetConversationTracking`), config-cli-credentials (`cortex.token`), selector memory tab,
extensions-runner, sdk-skills, sdk-tool-activation, silent-abort-print-mode, memory-protocol.
New: `openkai-cortex-memory.test.ts` (23 unit gates), `openkai-cortex-live.test.ts` (3 live),
`openkai-omlx-provider.test.ts` (6).

## Contract findings for Cortex (follow-ups, not blockers)

1. `POST /sessions/ingest` requires a roster agent; the docs' "worker@project" identity is
   enforced — OpenKai now resolves it from the registry.
2. `messages[].ts` is a string on the live schema.
3. The provider-settings "file is the contract" story in `providers-standalone.md` has no
   reader in the Cortex repo on disk; the effective seam is `PATCH /admin/cortex/config`
   (admin token). OpenKai authors the file AND bridges to the row — the Cortex side should
   either grow the file reader or document the admin plane as the contract.

## KOS minimum version

Unchanged (0.1.10 for the six terminal-lane asks). The memory rework ships with 0.1.11.
