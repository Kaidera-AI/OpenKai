# Handoff: kai@openkai (this session) -> kai@openkai (future session) — E023 Inc 06, the memory/Cortex upgrade
> **Superseded for current work.** This is the pre-remediation handoff. Use
> `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/DISPOSITION_REN_INC06.md` and
> [`HANDOFF_GITHUB_OPENKAI_FINALISATION.md`](HANDOFF_GITHUB_OPENKAI_FINALISATION.md)
> for the current implementation, validation, and release boundary.


**Date:** 2026-09-03 · **Trigger:** the operator opens a new session and points it
at this document ("complete the upgrades to openkai"). Read this entire file
first, then the reading order in §2, then confirm the §3 decisions **in the
operator's message** before touching code. This document is the scope; the
design doc is the spec; the operator's consent is the gate.

## 0 · Authority and ground rules

- You are kai@openkai (lead) in an OpenKai dev session. Operate on the fork:
  `~/DevVault/openkai-fork`, branch policy = cut `e023/inc-06-memory-cortex`
  from main (was @ `7e908eb296` when this handoff was authored; main may have
  moved — re-check with `git log --oneline -5`).
- **The epic opens only on explicit operator consent** (docs/RELEASE_SOP.md).
  The trigger message IS the consent for Inc 06 code. It is NOT consent to
  re-tag, republish, or ship 0.1.11 — the cut rides Inc 05's consent flow.
- UK English in all prose, ledgers, UI description strings. No re-tags. Skip
  formatters/linters/project-wide suites mid-flight; run the gate suite once
  at the end of each increment step.
- Programme of record (docs/ledgers) lives in `~/DevVault/OpenKai` on
  `maintenance/0.84-line`; commit+push there for every ledger line you amend.
  Fork code pushes to `origin` (Kaidera-AI/openkai-fork). **Do not push
  product main (`Kaidera-AI/OpenKai`)** from this session — that sync belongs
  to the github session via `docs/HANDOFF_GITHUB_SYNC_2026-09-03.md` cadence.

## 1 · What you are building (one paragraph)

Settings > memory becomes Kaidera Cortex: enum `off | local | cortex`; the
Hindsight remote service and Mnemopi SQLite backends retire with migration
rows; the Sharpshooter backend retires with its delta extractor + friction
filter ported into a new **cortex-ingest** settings group (named after the
Cortex command); that group also carries an embedding-model picker (local =
Ollama rung, or any model from every configured provider — NVIDIA NIM free,
OpenRouter, Alibaba DashScope — grouped by provider, free/paid badges) writing
`providers.embedding`, and an OPTIONAL rerank picker writing `providers.rerank`
(unset ⇒ vector-only, loud status row, never silent); Cortex status/install
rows detect local appliance / hosted / not-installed (`cortex.apiUrl` +
`cortex.token`, the CORTEX_URL/CORTEX_TOKEN agent-plane contract) with an
operator-confirmed `preflight`+`install` flow; every vectorize-io reference in
docs replaced by github.com/Kaidera-AI/cortex; hosted Cortex on the Kaidera
platform stays PARKED (review v0.1.13) — ship the client rows only.

## 2 · Reading order (programme repo `~/DevVault/OpenKai` unless noted)

1. `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/MEMORY_CORTEX_DESIGN.md`
   (**v2** — the spec; §5 layout, §6 verification are your acceptance list).
2. `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/EPIC_SCOPE.md` — §Memory
   block, §Future (hosted placeholder), §Increments (Inc 06's gate).
3. `docs/HANDOFF_TO_ALPHA_KAIDERA_HOSTED_CORTEX.md` — the parked service's
   client contract; do not build the service.
4. Fork code, in this order: `packages/coding-agent/src/config/settings-schema.ts`
   (memory tab 2948-3422 at authoring time), `memory-backend/resolve.ts` (the
   dispatch), `openkai/cortex-memory.ts` + `openkai/cortex/client.ts` (managed-
   mode client to de-env and extend), `autolearn/controller.ts` (the capture
   gate to reuse), `sharpshooter/extract.ts` (delta schema + friction filter to
   port) and `sharpshooter/paths.ts` (readers to keep), `hindsight/` (retires:
   backend/client/config/state/bank/content/transcript) and `mnemopi/`
   (retires; note `mnemopi/state.ts` imports `hindsight/content` +
   `hindsight/transcript` — move any helper both need BEFORE deleting, or
   delete both dirs in one commit), `tools/memory-recall.ts` +
   `tools/memory-reflect.ts` (hindsight-gated tools — re-gate or retire with
   the backend), `config/model-discovery.ts` (the `/v1/models` probe your
   picker's live enrichment reuses), `docs/memory.md`, `README.md` §13,
   `docs/config-usage.md`.
5. Cortex contract: `~/DevVault/cortex` — `docs/providers-standalone.md`
   (provider file schema, agent plane), `docs/models.md` (provider ladder,
   `:free` rule, re-embed costs), `docs/cli-reference.md` (command verbs the
   UI rows reference), README (install commands for the install flow).

## 3 · Operator decisions to confirm in the trigger message (ask if absent)

1. Rerank picker brand — design recommends **Marksman** (alt: Deadeye/Hawkeye/Longshot).
2. Old sharpshooter decision files: leave as plain docs (recommended) or
   one-shot import via `cortex-ingest-memories`.
3. v0.1.13 review window for hosted Cortex — confirm or move.
If the trigger message is silent on these, proceed with the recommended values
and record the assumption in the increment's ledger line.

## 4 · The work, sequenced

1. **Foundation:** branch; extend `openkai/cortex/client.ts` to settings-driven
   mode (`cortex.apiUrl` default `http://localhost:8501`, `cortex.token`,
   `cortex.project`) removing the env-only gate; status probe (binary
   `cortex --version` on PATH OR `GET <apiUrl>/health`); register the cortex
   backend in `memory-backend/resolve.ts`.
2. **cortex-ingest:** port `sharpshooter/extract.ts`'s delta schema + friction
   filter into the ingest pipeline (post-stop, `cortexingest.enabled` default
   on under backend=cortex, `minToolCalls` gate ported from
   `autolearn.minToolCalls`); `cortexingest.transcripts` default off; lessons
   POST via the client (`POST /memory` per the live contract at `cafb925e15`).
3. **Pickers:** curated per-provider seed catalog (Ollama `nomic-embed-text`/
   `mxbai-embed-large`/`qwen3-embedding`; NVIDIA NIM free `nv-embedqa`/
   `nv-rerank` families; OpenRouter free `:free` + paid; DashScope paid) with
   free/paid badges; live enrichment via `model-discovery.ts`-style `/v1/models`
   probes per configured provider + Ollama `ollama ls`; selection writes the
   shared provider settings file, OpenKai as single author; rerank optional.
4. **Settings rework + migration:** enum + groups per design §5; migration rows
   in `Settings.#migrateRawSettings()` (`hindsight|mnemopi` → `cortex` with the
   one-time notice, `sharpshooter` → `off`).
5. **Retirements:** `src/hindsight/` + `src/mnemopi/` (shared content/transcript
   helpers moved first), sharpshooter scheduler/consolidate/write path
   (extract ported, `paths.ts` readers kept), managed-skills minting,
   fastembed worker arg `__omp_worker_mnemopi_embed` dispatch leg in `cli.ts`,
   memory-recall/reflect tool re-gating.
6. **Docs:** README §13 + `docs/memory.md` + `docs/config-usage.md` rewritten;
   every `vectorize-io|github.com/vectorize-io` string →
   `https://github.com/Kaidera-AI/cortex`.
7. **Gates (design §6 is the acceptance list):** captured lesson visible via
   `cortex-search` with NO env vars (settings-driven); `cortex preflight`/
   `cortex-doctor` green after the TUI install flow; `cortex-embed --stats`
   draining with the chosen model; migration fixtures per retired value;
   picker shows every configured provider group with badges; rerank-unset row
   visible. Then the full gate suite (build/typecheck/openkai/composer/cli +
   golden).
8. **Ledgers:** evidence lines into the E023 folder; one-line append to
   `Program/PROGRESS.md`; CHANGELOG 0.1.11 section entry drafted (ships with
   Inc 05 consent).

## 5 · Exit criteria for Inc 06

All §4 steps green with recorded evidence; design §6 verification lines each
proven on a compiled drive; PROGRESS + scope ledgers amended and pushed to
`maintenance/0.84-line`; fork branch pushed to origin; a disposition-ready note
for the next adversarial pass (ren → K3 → qwen3.8 per standing goal 7). STOP
there — the ship decision is Inc 05 + CTO consent, never this session's.

## 6 · Reporting back

One ledger line per step in the epic folder; final message to the operator:
what landed (commits), the acceptance evidence table, the three §3 assumptions
used (if any), and anything that moved the KOS minimum version (it should not).
