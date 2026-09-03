# Spec: E024 — Cortex completion: the operational model for OpenKai memory

From: intent `intent/cortex-completion.md` (accepted 2026-09-04, planning stage). Owner: kai@openkai. Reviewer: ren (CPO). Status: draft — accepted for planning; build waves open only on CTO decisions D0–D5.

## What we are building
**Memory = Cortex or nothing.** `memory.backend` becomes `off | cortex` (D1). Cortex stays **opt-in**: nothing turns shared durable memory on because an appliance is reachable; activation is an explicit setting change after `/cortex status` has shown *what* will be shared and *how long it is kept*.

**Operator journey (the contract):**
1. `off` → `/cortex status`: shows local appliance / hosted / not installed; project key (settings > env > folder name) and whether it is registered; the default writer; embedding + rerank state ("rerank: off — vector-only" is a loud state, not a warning); `/degradation` items.
2. Not installed → `/cortex preflight` then `/cortex install` (confirm) → offer `/cortex register <project> <agent> <role>` (needs `CORTEX_ADMIN_TOKEN` in the launching shell; the TUI never stores it).
3. Set **Memory Backend = Cortex** → the settings row explains: first-turn recall, `cortex_search`/`cortex_record`/`learn`, post-stop decision ingest (friction-gated), transcript ingest **off**; retention as configured on the appliance (`cortex-retain`).
4. Reversible: back to `off` stops every read/write immediately; nothing is deleted; the appliance keeps what was written (retention/deletion are appliance operations, named in the docs).
5. Managed lane (KOS): `CORTEX_PROJECT` + `CORTEX_API_URL` (+ token) select Cortex without a settings edit; the Memory UI shows the lane as active.

**Precise states** (each has one status line and one action): API unreachable → "not reachable at <url> — /cortex install or fix Cortex API URL"; project unregistered → "NOT registered — /cortex register (admin token)"; no default writer → write refused *before* any payload: "set Cortex Agent to a registered roster name"; admin token missing at register/provider-apply → "pending-admin: recorded in the provider file; run with CORTEX_ADMIN_TOKEN to apply"; rerank unset → "vector-only"; provider degraded → `/degradation` items printed verbatim in `/memory stats`.

**Acceptance isolation:** every synthetic drive uses project `openkai-acceptance` with agent `probe:probe` created for the drive and removed after (`cortex-remove-agent`, project archived); the production `openkai` project never receives a marker (D4).

**Providers:** selection writes `~/.openkai/config.json › providers.embedding|rerank` (OpenKai single author) and applies through `PATCH /admin/cortex/config` with `CORTEX_ADMIN_TOKEN` from the shell only; without it the state is "pending-admin" and visible. Cost/availability policy: Ollama local (free) is the default rung when present; NVIDIA NIM free tier second; OpenRouter paid only when a key exists; no paid provider is ever implied. Fallback is deterministic: unset rerank ⇒ vector-only; unreachable embedding provider ⇒ Cortex reports degradation, OpenKai stops claiming recall quality.

**Migration/retention/data boundaries:** Hindsight banks and Mnemopi SQLite files are neither imported nor deleted (existing contract); if D1 retires `local`, `learned.md` and `memory_summary.md` stay on disk as plain files with a one-time notice and a documented manual path (`cortex-ingest-memories --path`) — no automatic import (D2: no product export/import). Transcript ingest opt-in, off by default; retention per appliance config (90 days messages / 365 decisions+lessons — `cortex-retain --status`); roster ownership = the project's registered agents; deletion/repair = appliance operations, never a TUI button. Backups: the 08-15→08-31 restore incident (`129cc50e`) becomes an OpenKai eval — a scheduled check that `~/.kaidera-os/backups` holds a backup newer than N days before any drive that writes.

**Hosted Cortex:** a distinct workstream owned with alpha@kaidera (`docs/HANDOFF_TO_ALPHA_KAIDERA_HOSTED_CORTEX.md`): tenant/project provisioning, token issuance/rotation, TLS, RLS, roster lifecycle, rate/cost limits, observability, rollback, and the client contract (`CORTEX_URL`/`CORTEX_TOKEN`). OpenKai's part is already the settings rows; nothing else is scheduled until the platform contract and an acceptance environment exist (D3).

## What we are not building
A default-on memory; a legacy importer; a hosted service inside OpenKai; a second memory pipeline beside Cortex; any TUI delete/purge of shared memory; new feature surfaces (drawers, plugins, headless Fusion) — those re-enter through their own intents.

## Policy applied while writing
`kaidera-sdlc` (plan before code; verification pasted; author never approves); `docs/RELEASE_SOP.md` (consent per version); `docs/DEVELOPMENT_PROCESS.md`; `FORK.md` touch-list (upstream pristine; memory changes in the openkai layer + the sanctioned settings/memory-backend files); design v2 §2–§5; the Cortex access rule (API only, no direct DB).

## Flagged concerns
1. D1 conflicts with the completion handoff's "reversible return to `off` or `local`" — owner: CTO; resolution: the CTO's word on "replace all the omp memory stuff" (recommendation: retire `local`).
2. 0.1.12 shipped without a recorded consent line while the external gates were waived — owner: CTO; resolution: record consent or the exception in the ledger (D0) before any 0.1.13 preparation.
3. The admin token is loadable on the dev Mac by the KOS helper; using it in a drive is allowed, persisting or printing it is not — owner: kai; resolution: drives run in a shell where the helper exports it; evidence files are redacted by rule.
4. `install.sh` default still `v0.1.009` — a channel defect that the coordinated release pipeline did not cover — owner: kai; resolution: W3 remediation + a release-verify check.

## Acceptance
See `ACCEPTANCE_MATRIX.md` — every row names the environment, the drive, the expected observable, the evidence file, the owner and its release relevance. Headline: (a) fresh-host install → `openkai --version` = 0.1.12 and the TUI boots keyless; (b) settings-driven cycle on `openkai-acceptance`: status → register → record → search finds the marker → transcript ingest lands → project removed; (c) refusal proof: unregistered writer refused before payload; a pasted secret never appears in Cortex rows, transcript, error text or the provider file; (d) provider apply through the admin plane changes `/health.embed_model` and the backlog drains; (e) D1: no `local` value, no `memories.*` row, no `memory://root`, tests updated.

## Risks and rollback
Retiring `local` removes an offline memory for users without Cortex — mitigated by the migration notice and by `off` being honest. Drives with the admin token: rollback = archive the acceptance project. Provider apply: rollback = re-PATCH the previous config (captured before the change). Release: `bun run release` is atomic per channel set; install.sh is repaired with a verify step.

## Open questions
D0–D5 in the intent; D6 (who runs the clean-host drive, on what host).
