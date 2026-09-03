# MEMORY / CORTEX DESIGN — settings > memory, reworked onto Kaidera Cortex

**Drafted:** 2026-09-03 · **Owner:** kai@openkai (lead) · **Status:** DESIGN for CTO
review — no code changes until the operator finalises it (operator instruction
2026-09-03: "create a detailed document ... before we finalise the change").
**Epic:** E023 (folded into scope as work-to-be-done; see EPIC_SCOPE.md §Memory/Cortex).
**Basis:** fork main @ `7e908eb296` (`~/DevVault/openkai-fork`); Cortex checkout
`~/DevVault/cortex` (Kaidera-AI/cortex); operator directive 2026-09-03.

---

## 1 · Where we are today (settings > memory, verbatim)

The fork's settings tab `memory` has five groups and one master enum
(`packages/coding-agent/src/config/settings-schema.ts`):

`memory.backend` (General) — label "Memory Backend", description "Off, local
summary pipeline, Mnemopi SQLite, Hindsight remote memory, or Sharpshooter".
Options, verbatim:

| value | label | description (verbatim) |
|---|---|---|
| `off` | Off | "No memory subsystem runs" |
| `local` | Local | "Local rollout summarisation pipeline (memory_summary.md)" |
| `hindsight` | Hindsight | "Vectorize Hindsight remote memory service" |
| `mnemopi` | Mnemopi | "Local SQLite recall/retain backend with optional embeddings" |
| `sharpshooter` | Sharpshooter | "Friction-gated project decision files (architecture/product/style), consolidated in the background" |

Group **Auto-Learn** (settings-schema.ts:2988-3015):
- `autolearn.enabled` — "Auto-Learn (experimental)": "After the agent stops, nudge it
  to capture lessons to memory and create/enhance isolated managed skills". Default off.
- `autolearn.autoContinue` — "Auto-run capture at stop": "When on, auto-run one
  private capture turn at stop (uses extra tokens). When off, only standing
  auto-learn guidance remains." Default off.
- `autolearn.minToolCalls` (config-file only) — default 5.

Group **Mnemopi** (3017-3258): `dbPath`, `bank`, `scoping`
(global/per-project/per-project-tagged), `embeddingVariant` (en →
`BAAI/bge-base-en-v1.5`, multilingual → `intfloat/multilingual-e5-large`),
`autoRecall`, `autoRetain`, `polyphonicRecall`, `enhancedRecall`,
`proactiveLinking`, `noEmbeddings` ("Force deterministic FTS-only recall instead
of vector embeddings"), `embeddingModel` ("Advanced: explicit embedding model id
that overrides the variant..."), `embeddingApiUrl` ("Optional OpenAI-compatible
embedding endpoint passed to Mnemopi"), `embeddingApiKey`, `llmMode`
(none/smol/remote), `llmBaseUrl`, `llmApiKey`, `llmModel`, plus numeric knobs
(`retainEveryNTurns` 4, `recallLimit` 8, `recallContextTurns` 3,
`recallMaxQueryChars` 4000, `injectionTokenLimit` 5000, `debug`).

Group **Hindsight** (3260-3422): `apiUrl` (default `http://localhost:8888`),
`apiToken`, `bankId`, `bankIdPrefix`, `scoping`, `bankMission`, `retainMission`,
`autoRecall`, `autoRetain`, `retainMode` (full-session/last-turn),
`retainEveryNTurns` 3, `retainOverlapTurns` 2, `retainContext` "omp",
`recallBudget` (low/mid/high), `recallMaxTokens` 1024, `recallContextTurns`,
`recallMaxQueryChars` 800, `recallTypes`, `debug`, four timeout knobs,
`mentalModelsEnabled`, `mentalModelAutoSeed`, `mentalModelRefreshIntervalMs`,
`mentalModelMaxRenderChars`.

Group **Sharpshooter** (2975-2986): `sharpshooter.model` — "Model selector for
extraction/consolidation, empty = smol role"; `intervalMinutes` 5;
`injectionTokenLimit` 15000.

Related surfaces carrying the same brands: README.md §13 ("Pick the engine with
`memory.backend` — local, Hindsight, or Mnemopi", README.md:227), `docs/memory.md`
backend table, `docs/config-usage.md` migration notes (config-usage.md:347).

The openkai layer's Cortex client is **separate from this tab**: it is managed-mode
only. `openkai/cortex-memory.ts:18-32` — `CORTEX_PROJECT` env present ⇒ managed
mode; `CORTEX_API_URL` default `http://localhost:8501`; tools `cortex_search` /
`cortex_record` register only in managed mode; local mode returns "nothing to
search" / "learning NOT recorded". There is **no settings-driven local Cortex
path and no install detection** today (NONE in code).

## 2 · How omp memory works today — the full explanation

**Auto-learn** (`src/autolearn/controller.ts`): a session controller subscribes to
the event stream. `autolearn.enabled` injects standing system guidance (keyed on
tool presence: `manage_skill` always, `learn` only when a memory backend is
active); it never nudges mid-turn (prompt-cache neutral). When
`autolearn.autoContinue` is on and a turn ends with ≥ `minToolCalls` (5) tool
calls outside goal mode, the controller runs ONE private synthetic capture turn:
it writes lessons to the active memory backend (the `learn` tool) and
mints/enhances isolated managed skills under `~/.omp/agent/managed-skills`
(`managed-skills.ts`). Overlap-safe: one pending capture queues while another is
in flight. So auto-learn today = guidance + optional private capture turn whose
sink is whichever `memory.backend` is active.

**local**: a summarisation pipeline rolling the session into `memory_summary.md`
loaded on the next session's first turn.

**Mnemopi** (`src/mnemopi/`): bun:sqlite store at `<agentDir>/memories/mnemopi/mnemopi.db`
(config.ts:47-49); banks scoped global/per-project/per-project-tagged; auto-recall
injects prior memories each turn, auto-retain persists every N turns. Embeddings
run in a **spawned subprocess worker** (embed-client.ts — fastembed's NAPI must not
live in the main process; issue #3031) with the two.variant models above, or any
OpenAI-compatible endpoint via `embeddingApiUrl/Key/Model` (env override
`MNEMOPI_EMBEDDING_MODEL`). `llmMode` smol/remote powers enhanced recall/linking.

**Hindsight** (`vectorize-io/hindsight`): a remote memory service at `apiUrl`;
retain ships session chunks to a bank, recall queries it (budgeted), reflect
builds "mental models" refreshed on a timer. Everything is HTTP to someone else's
service — the exact property the operator wants gone.

**Sharpshooter** (`src/sharpshooter/`): NOT embeddings. After each human turn a
small LLM extraction (the `sharpshooter.model`, default the smol role) records
"decision deltas" — architecture/product/style decisions, constraints, rejected
approaches, corrections — with a friction score (corrective/regression/subtle).
A background scheduler (every `intervalMinutes`) consolidates high-friction deltas
into three project files (architecture/product/style decision logs) which are
injected into the system prompt within `injectionTokenLimit`. It is a
project-decisions distiller, not a recall backend.

**Cortex (the target)**, from `~/DevVault/cortex`: a Postgres-backed appliance
(six layers: db → migrate → api → embed/graph/pdf workers), API-only access, one
provider settings file with `providers.embedding` and `providers.rerank`
(base_url + model + key; schema owned by OpenKai — providers-standalone.md:47-55).
Write path embeds every row (768-d) + graph enrichment; read path is
embed-query → vector match → **rerank** → graph expand. Provider ladder: Ollama
(self-hosted: `nomic-embed-text`, `mxbai-embed-large`, `qwen3-embedding`) →
NVIDIA NIM free tier → OpenRouter (production; `:free` suffix rule on free rerank
ids). Install: `brew install kaidera-ai/kaidera/cortex` or `npx
@kaidera-ai/cortex install` after `preflight`; engines Apple Container (macOS) /
rootless Podman ≥5.0 (Linux). CLI: 72+ commands, the memory-relevant ones being
`cortex-search`, `cortex-log`, `cortex-memory`, `cortex-ingest-session`,
`cortex-ingest-all`, `cortex-maintain`, `cortex-embed`, `cortex-doctor`,
`cortex-boot`, `cortex-state`. Note the v0.1.0 payload gate: `preflight` works
today; `install` deploys once release gates pass (README:40-42) — the design must
treat "not yet installed" as the normal state and offer the install path.

## 3 · Sharpshooter, answered plainly

The operator's hypothesis (embedding selector) is disproven by the code: the
sharpshooter "model" selects the **extraction/consolidation LLM**, and the backend
produces markdown decision files — no vectors anywhere. In the redesign the name
is repurposed for the embedding-model picker (the operator's intended role), and
the rerank picker gets its own marksman-family name (§5). The old decision-file
behaviour retires with the backend (its three files remain on disk, untouched,
as plain project docs).

## 4 · Target state — settings > memory on Cortex

New enum, replacing the five-way choice (migration in §6):
`memory.backend` = `off | local | cortex`. `local` keeps the summary pipeline for
offline use; **cortex** is the new default-once-detected recommendation.

New groups:

**General** — `memory.backend`; `memory.scoping` (global / per-project; mirrors
Cortex's project tenancy via `CORTEX_PROJECT`-style keys stored in settings, not
env-only).

**Cortex** — the spine:
- `cortex.status` (read-only row): detected / not installed / unreachable, with
  the detected version. Detection = `cortex preflight`-style probe: binary on
  PATH (`cortex --version`) OR `GET $CORTEX_API_URL/health` (default
  `http://localhost:8501`, matching the existing client default).
- `cortex.apiUrl` — endpoint override.
- `cortex.project` — project key; empty ⇒ offer `cortex-init-project` in the
  install flow.
- Install action row (TUI button, not a silent flag): when status is
  "not installed", show the two commands (`brew install kaidera-ai/kaidera/cortex`
  / `npx @kaidera-ai/cortex install`) and, **on operator confirmation only**, run
  `preflight` then `install` and re-probe. Never auto-install.
- GitHub link row: `https://github.com/Kaidera-AI/cortex` (rendered, per the
  operator's ask that every option carries its explanation and origin).

**Auto-Ingest** (replaces Auto-Learn):
- `autoingest.enabled` — after the agent stops, push the session's lessons to
  Cortex (`POST /memory` via the client; equivalent of `cortex-log`/`cortex-memory`),
  keeping the same friction gate (≥ N tool calls) so trivial turns are not ingested.
- `autoingest.transcripts` — optional end-of-session transcript ingest
  (`cortex-ingest-session` semantics through the API), default off.
- Managed-skills minting retires (Cortex holds the lessons; the `manage_skill`
  surface stays for operator-authored skills).
Each row carries a two-line explanation: what ingest writes (decisions, lessons,
handoffs), that embeddings + graph enrichment happen server-side as workers, and
that search is hybrid (vector + rerank + graph).

**Sharpshooter (embedding model)** — the repurposed slot: a picker listing
embedding models **grouped by provider**, provider heading above its models:
- *Ollama (this machine)* — discovered live via `ollama ls` when Ollama runs
  (the fork already proves the keyless Ollama lane, `51062c9d1e`); seed list
  `nomic-embed-text`, `mxbai-embed-large`, `qwen3-embedding`.
- *NVIDIA NIM (free tier)* — `nv-embedqa` family.
- *OpenRouter* — the production rung; every embedding id it serves.
Implementation note: omp's model registry has **no embedding-capability tag**
(NONE — models are LLM-shaped; mnemopi's embedding path is a parallel universe),
so this picker is an openkai-layer curated catalog reusing the models-hub picker
pattern, writing `providers.embedding` in the shared provider settings file
(Cortex consumes the same file — one author, OpenKai).

**Marksman (rerank model)** — new picker, same grouped layout (`nv-rerank*` on
NVIDIA, OpenRouter rerank ids with the `:free` suffix rule spelled out in each
free option's description). Writes `providers.rerank`. The name is the
operator-requested brand for the rerank feature; alternatives considered:
Deadeye, Hawkeye, Longshot — Marksman chosen (reordering candidates = marksmanship;
pairs cleanly with Sharpshooter).

Every option everywhere gets the two-to-three-line explanation the operator
demanded (what it is, what changing it costs — e.g. "changing the embedding model
re-embeds existing rows via `cortex-embed` on next maintain"), and each group
header carries a one-paragraph explainer mirroring §2's prose (Cortex = what,
auto-ingest = what, rerank = why it is the difference between similar words and
the right answer).

## 5 · Migration & docs replacement

- `hindsight.*` / `mnemopi.*` / old `sharpshooter.*` keys: migration in
  `Settings.#migrateRawSettings()` — `memory.backend: hindsight|mnemopi` →
  `cortex` with a one-time notice row ("your previous memories stay where they
  were; Cortex starts fresh — run `cortex-ingest-memories` to import"),
  `sharpshooter` → `off`. No silent data movement.
- Retire code: `src/mnemopi/`, `src/hindsight/` (extension), sharpshooter
  scheduler/consolidation (keep `paths.ts` readers so existing files remain
  openable), the fastembed worker subprocess and its CI legs.
- Docs: README.md §13 + `docs/memory.md` rewritten to "Off / Local / Cortex";
  every `vectorize-io/hindsight` URL replaced by
  `https://github.com/Kaidera-AI/cortex`; `docs/config-usage.md` migration table
  updated. This is the "properly replaced" gate the operator named.

## 6 · Verification

- `cortex preflight` + `cortex-doctor` green on this workstation after the TUI
  install flow (operator-confirmed run).
- Round trip: autolearn-equivalent capture ⇒ row visible via `cortex-search`
  (the managed-mode ingest test goes green as a settings-driven test, finally
  de-enving `CORTEX_PROJECT`).
- Provider file single-authorship: OpenKai writes, `cortex-embed --stats` shows
  the backlog draining with the chosen model (the "verify the effect" lesson).
- Settings migration fixtures: old configs with each retired backend value land
  on the documented new state.

## 7 · Open questions for the operator

1. Rerank brand: **Marksman** (recommended) or Deadeye/Hawkeye/Longshot.
2. Keep `local` backend as the offline fallback, or `off | cortex` only?
3. Transcript auto-ingest default off (recommended) or on?
4. Older sharpshooter decision files: leave as plain docs (recommended) or
  one-shot import via `cortex-ingest-memories`?
