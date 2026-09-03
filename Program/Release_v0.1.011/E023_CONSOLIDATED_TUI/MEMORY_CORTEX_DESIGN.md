# MEMORY / CORTEX DESIGN (v2) — settings > memory, reworked onto Kaidera Cortex

**v2:** 2026-09-03 — folds the operator's 2026-09-03 feedback: sharpshooter
keep-or-retire assessment; the settings group renamed to **cortex-ingest** after
the Cortex command, with an embedding-model picker (local or any configured
provider, free/paid highlighted) and an optional rerank picker; Hindsight fully
replaced; hosted Cortex via the Kaidera platform parked for a later review.
**Owner:** kai@openkai (lead) · **Status:** DESIGN for the operator's final
decision — no code until finalised. **Epic:** E023 (Inc 06).
**Basis:** fork main @ `7e908eb296`; Cortex checkout `~/DevVault/cortex`.

---

## 1 · Where we are today (compressed)

`memory.backend` (settings-schema.ts:2948) offers `off | local | hindsight |
mnemopi | sharpshooter`. The tab's groups: General, Auto-Learn
(`autolearn.enabled/autoContinue/minToolCalls`), Mnemopi (SQLite at
`<agentDir>/memories/mnemopi/mnemopi.db`, fastembed subprocess workers with
`BAAI/bge-base-en-v1.5` / `intfloat/multilingual-e5-large`, optional
OpenAI-compatible embedding endpoint), Hindsight (~25 rows around the remote
service at `hindsight.apiUrl`, default `http://localhost:8888`), Sharpshooter
(`sharpshooter.model`, `intervalMinutes` 5, `injectionTokenLimit` 15000).

How each actually works:
- **Auto-learn**: standing system guidance (keyed on tool presence, prompt-cache
  neutral); with `autoContinue` on and ≥5 tool calls in the turn, ONE private
  capture turn writes lessons to the active backend and mints managed skills
  under `~/.omp/agent/managed-skills`.
- **Sharpshooter**: after each human turn a small-LLM extraction records
  *decision deltas* (architecture/product/style decisions, constraints, rejected
  approaches, corrections) with friction flags (corrective/regression/subtle);
  a 5-minute scheduler consolidates high-friction deltas into three markdown
  files injected into the system prompt. **No vectors anywhere** — it is a
  project-decisions distiller, not a recall backend.
- **Cortex** (`~/DevVault/cortex`): Postgres-backed six-layer appliance,
  API-only; write path embeds every row (768-d) + graph enrichment; read path =
  embed query → vector match → **rerank** → graph expand. Providers ladder:
  Ollama (local) → NVIDIA NIM free → OpenRouter (production; `:free` suffix rule
  on free ids). Transport for agents: `CORTEX_URL` + `CORTEX_TOKEN`
  (providers-standalone.md plane 1). Install: `brew install
  kaidera-ai/kaidera/cortex` or `npx @kaidera-ai/cortex install` after
  `preflight`. The openkai-layer client (`openkai/cortex-memory.ts`) is
  managed-mode only today (`CORTEX_PROJECT` env); default API
  `http://localhost:8501`; tools `cortex_search`/`cortex_record`.

## 2 · Assessment A — do we still need Sharpshooter alongside Cortex?

**Verdict: retire the backend, port its friction gate into cortex-ingest.**

Pros of retiring:
- Cortex already stores decisions/lessons durably; once cortex-ingest lands,
  sharpshooter becomes a second write path to the same facts — dual-write
  drift, two schedulers, two injection surfaces. Cortex's own principle is one
  owner per fact.
- Its output costs 15k prompt tokens per session (flat injection); Cortex's
  retrieval (vector + rerank + graph, plus `cortex-boot` budgeted context on
  the first turn) delivers the *relevant* subset on demand — better
  information economics and no recall misses that flat injection was buying.
- Removes a per-turn small-LLM extraction and a background consolidation run:
  less token spend, less failure surface, one fewer subsystem in the TUI.

Cons of retiring (and the mitigations):
- Its **friction gating is genuinely good** — it filters noise (only
  corrective/regression/subtle deltas survive). Naive ingest-everything would
  pollute Cortex recall. *Mitigation: port the delta extractor + friction
  filter as the high-signal stage of cortex-ingest (default on); the gate
  survives, the file pipeline dies.*
- Offline value: sharpshooter needs only files + a small model, Cortex needs
  the appliance. *Mitigation acceptable: `memory.backend: local` remains the
  offline fallback; Cortex is the recommended engine and the install flow
  closes the gap.*
- Flat injection guaranteed presence; search can miss. *Mitigation:
  `cortex-boot` boot context + auto-recall at turn start; and rerank
  degradation is fail-loud in Cortex (`/degradation`), never silent.*

Disposition: `sharpshooter` value leaves the enum; `src/sharpshooter/` retires
except `extract.ts`'s delta schema + friction logic, which move into the
cortex-ingest pipeline. The three existing decision files stay on disk as
plain docs; a one-shot import via `cortex-ingest-memories` is offered (open
question §8).

## 3 · Assessment B — the cortex-ingest group and the model pickers

The group takes the Cortex command's name (**Cortex Ingest**, keys
`cortexingest.*` mirroring `cortex-ingest*` CLI verbs). It works, with three
honest constraints the operator should see:

1. **"Local embedding" maps to the Ollama rung, not to on-device fastembed.**
   Cortex embeds server-side in its embed-worker; the client never embeds.
   So "local" = Ollama on this machine (live-discovered via `ollama ls`; the
   fork already proves the keyless Ollama lane, `51062c9d1e`). The mnemopi
   fastembed subprocess retires with mnemopi. If Ollama is absent the row
   explains the rung and offers nothing silently.
2. **"List all models from all configured providers" is curated-seed-first,
   live-enriched.** omp's model catalog has no embedding/rerank capability
   tag (models are chat-shaped), and some providers do not expose
   embedding/rerank ids on `/v1/models` (NVIDIA NIM serves dedicated
   endpoints; DashScope likewise). So: a curated seed list per provider
   (guaranteed rows) + live enrichment where supported — `model-discovery.ts`'s
   OpenAI-models-list probe against each configured provider's base URL
   (OpenRouter exposes everything on `/v1/models`), filtered by name
   heuristics (`embed`, `rerank`) against the seeds. Configured providers =
   the bundled catalog ∩ authenticated in models.yml; the openkai secrets
   table corroborates nvidia (`nvapi-`), groq, fireworks, cerebras,
   huggingface; alibaba (DashScope) is in omp's routing code
   (agent-session.ts:7997).
3. **Free vs paid highlighting is a per-row badge, not a filter.** Free:
   Ollama (local, £0), NVIDIA NIM free tier (`nv-embedqa`/`nv-rerank`
   families), OpenRouter `:free` ids. Paid: OpenRouter pay-as-you-go,
   Alibaba DashScope, any provider whose key implies billing. The badge text
   comes from the curated seed rows; live-enriched rows inherit their
   provider's default tier unless the id carries `:free`.

Embedding picker rows (grouped by provider heading): Ollama local
(`nomic-embed-text`, `mxbai-embed-large`, `qwen3-embedding`); NVIDIA NIM free
(`nv-embedqa-*`); OpenRouter (free `:free` rows + paid rows); Alibaba DashScope
(paid). Selection writes `providers.embedding` in the shared provider settings
file — OpenKai is the single author; Cortex consumes the same file
(providers-standalone.md:47-55).

Rerank picker (**optional**, per the operator): same grouped layout, seeded
NVIDIA rerank family + OpenRouter rerank ids (`:free` suffix rule printed in
each free row's description). Unset ⇒ Cortex runs vector-only search and its
`/degradation` surface says so loudly; the TUI status row shows "rerank: off —
vector-only" rather than hiding it. Writes `providers.rerank` when set.

`cortex-ingest` ingest knobs: `cortexingest.enabled` (post-stop high-signal
ingest, friction gate ported from sharpshooter, default on once Cortex is the
backend), `cortexingest.transcripts` (end-of-session transcript ingest,
default off), `cortexingest.minToolCalls` (the old ≤5 gate, config-file only).
Auto-learn's managed-skills minting retires (Cortex holds the lessons).

Each row and group header carries the operator-mandated explanations: what
Cortex is (with `github.com/Kaidera-AI/cortex`), what ingest writes, why
rerank is "the difference between similar words and the right answer", and
what a model change costs ("changing the embedding model re-embeds existing
rows via `cortex-embed` on the next `cortex-maintain`").

## 4 · Assessment C — Hindsight out, Cortex in; hosted Cortex later

Replacing the remote Hindsight service with Cortex: assessed **correct**, one
caveat. Pros: one memory spine, no third-party vendor URL in our product
(surface we do not own), our enrichment providers, our receipts; the KOS
shared-memory goal (standing goal 8) is Cortex-shaped. Con: operators who ran
their own Hindsight banks lose continuity — no importer exists for Hindsight
data; their memories stay on their service. Migration therefore converts the
setting (`hindsight` → `cortex`) with a one-time notice row and never touches
their remote data.

Hosted Cortex through the Kaidera platform: assessed **the right endgame**,
and cheap to prepare now because Cortex already defines the client contract —
`CORTEX_URL` + `CORTEX_TOKEN` (providers-standalone.md plane 1). OpenKai's
settings therefore gain:
- `cortex.apiUrl` (endpoint; default `http://localhost:8501` local appliance),
- `cortex.token` (credential; empty for local, issued for hosted),
- a provisioning row for hosted mode (project key + roster entry, i.e. a
  hosted `cortex-init-project`/`cortex-add-agent` round trip).
The status row distinguishes *local appliance / hosted / not installed*.
Enrichment economics for hosted: free tier ⇒ Ollama-backed enrichment on the
platform side; paid tiers ⇒ OpenRouter — recorded in the handoff below.

Deliverables parked by this turn: handoff `docs/HANDOFF_TO_ALPHA_KAIDERA_HOSTED_
CORTEX.md` (alpha@kaidera adds it to the Kaidera platform project plan) and a
placeholder in our plan (EPIC_SCOPE §Future + PROGRESS.md) to review the hosted
service at **v0.1.13** planning — two cuts after 0.1.11, per "a couple of
versions later".

## 5 · Revised target settings layout

`memory.backend` = `off | local | cortex` (default `off` until Cortex detected,
then suggested; `local` stays the offline summary pipeline).
Groups: **General** (backend, scoping global/per-project); **Cortex** (status
row, apiUrl, token, project key, install action row — `preflight` then
`install` on operator confirmation only — and the GitHub link row);
**Cortex Ingest** (enabled, transcripts, minToolCalls, the embedding picker
grouped by provider with free/paid badges and a "local (Ollama)" rung, the
optional rerank picker); explanations throughout. Hindsight/Mnemopi/old
Sharpshooter groups removed; their keys migrated in
`Settings.#migrateRawSettings()` (`hindsight|mnemopi` → `cortex` + notice,
`sharpshooter` → `off`).

Retired code: `src/mnemopi/` (incl. fastembed workers), `src/hindsight/`,
sharpshooter scheduler/consolidation/write path (extractor ported to
cortex-ingest; `paths.ts` readers kept so existing files remain openable).
Docs rewritten: README §13, `docs/memory.md`, `docs/config-usage.md`; every
`vectorize-io/hindsight` URL → `https://github.com/Kaidera-AI/cortex`.

## 6 · Verification

- `cortex preflight`/`cortex-doctor` green after the TUI install flow;
  capture ⇒ `cortex-search` round trip without `CORTEX_PROJECT` env
  (settings-driven, de-env'd).
- Provider single-authorship: OpenKai writes the file; `cortex-embed --stats`
  shows the backlog draining with the chosen model.
- Picker rows: every configured provider renders a group; free/paid badges
  present on the seeded rows; rerank-unset ⇒ the degradation row visible,
  never silent.
- Migration fixtures: each retired backend value lands on the documented new
  state with its notice row.

## 7 · Open questions for the operator (narrowed)

1. Rerank picker brand: **Marksman** (recommended) or Deadeye/Hawkeye/Longshot —
   cosmetic; decide with final sign-off.
2. Old sharpshooter decision files: leave as plain docs (recommended) or
   one-shot `cortex-ingest-memories` import?
3. Confirm the v0.1.13 review window for the hosted Cortex service.
