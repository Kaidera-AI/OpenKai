# Spec: E024 — Cortex completion: the operational model for OpenKai memory

From: intent `intent/cortex-completion.md` (accepted 2026-09-04). Owner: kai@openkai. Reviewer: Ren role (`E024SpecReview`). Status: W1 findings accepted in `DISPOSITION_REN_W1.md`; W3 source-only remediation is GO, while mutation drives and release remain gated by the matrix.

## What we are building
**Memory = Cortex or nothing.** `memory.backend` becomes `off | cortex` (D1). A normal workstation stays **opt-in**: reachability alone never activates shared memory. The managed KOS lane is explicit deployment policy: `CORTEX_PROJECT` activates Cortex and overrides the local `off` value; the UI/status says that policy is active and removing the variable is the exact stop action.

**Operator journey (the contract):**
1. Ordinary `off` → `/cortex status`: shows local appliance / hosted / not installed; project key (settings > folder name unless managed env is present) and registration; default writer; embedding + rerank state ("rerank: off — vector-only" is a loud state, not a warning); `/degradation` items.
2. Not installed → `/cortex preflight` then confirmed `/cortex install` → `/cortex register <project> <agent> <role>` (needs `CORTEX_ADMIN_TOKEN` in the launching shell; the TUI never stores it). This journey is not accepted until the Cortex installer is published and passes on a clean host.
3. Set **Memory Backend = Cortex** → the settings row explains first-turn recall, `cortex_search`/`cortex_record`/`learn`, post-stop decision ingest (friction-gated), transcript ingest **off**, and appliance retention.
4. Reversible ordinary lane: return to `off` to stop every read/write immediately; nothing is deleted. Managed lane: remove `CORTEX_PROJECT` from the launching environment to stop the policy-selected backend; setting `off` while that variable remains set does not override deployment policy.
5. Acceptance state uses only `openkai-acceptance` and `probe:probe`. It is created/reactivated for a drive and archived from a `finally` path; absence of a typed Cortex archive operation blocks every synthetic writing drive.

**Precise states** (each has one status line and one action): API unreachable → "not reachable at <url> — /cortex install or fix Cortex API URL"; project unregistered → "NOT registered — /cortex register (admin token)"; no default writer → write refused *before* any payload: "set Cortex Agent to a registered roster name"; admin token missing at register/provider-apply → "pending-admin: recorded in the provider file; run with CORTEX_ADMIN_TOKEN to apply"; rerank unset → "vector-only"; provider degraded → `/degradation` items printed verbatim in `/memory stats`; managed env present → "managed lane active — remove CORTEX_PROJECT to disable".

**Acceptance isolation:** every synthetic writing drive uses a disposable Cortex appliance and project `openkai-acceptance` with agent `probe:probe`. Lifecycle is start/reactivate → drive → remove agent + archive in `finally`; acceptance requires archived/404 and pre/post hashes proving the production `openkai` project/config/rows were unchanged (D4). Cortex owns the missing typed archive API; OpenKai never reaches into its database.

**Providers:** selection writes `~/.openkai/config.json › providers.embedding|rerank` (OpenKai single author) and applies through `PATCH /admin/cortex/config` with `CORTEX_ADMIN_TOKEN` from the shell only; without it the state is "pending-admin" and visible. Cost/availability policy: Ollama local (free) is the default rung when present; NVIDIA NIM free tier second; OpenRouter paid only when a key exists; no paid provider is ever implied. Fallback is deterministic: unset rerank ⇒ vector-only; unreachable embedding provider ⇒ Cortex reports degradation, OpenKai stops claiming recall quality.

**Migration/retention/data boundaries:** Hindsight banks, Mnemopi SQLite files, `learned.md`, `memory_summary.md`, the complete legacy memory root, and relevant `agent.db` rows are neither imported nor deleted. `local` and every `memories.*` setting migrate to `off`; a one-time notice names the retained paths and states that no importer exists (D2). `memory://` stays registered only to return that pointer. Transcript ingest is opt-in and off by default; acceptance proves both no-ingest and opt-in paths, `cortex-retain --status`, and settings restoration. Roster ownership = registered project agents; deletion/repair = typed appliance operations, never a TUI purge button. A backup is acceptable only when it exists within threshold, passes checksum/integrity validation, and restores non-destructively into a disposable appliance with matching inventory; a missing backup blocks writing drives.

**Hosted Cortex:** wholly deferred behind `HOSTED_CORTEX_CONTRACT.md`, owned with alpha@kaidera. The contract covers endpoint/token issuance, rotation, TLS/auth, tenancy/RLS, roster and archive lifecycle, retention/export/delete, rate/cost limits, observability, compatibility, acceptance, and rollback. No hosted client code enters 0.1.13; `cortex.apiUrl`/token remain generic endpoint settings (D3).

## What we are not building
A default-on memory; a legacy importer; a hosted service inside OpenKai; a second memory pipeline beside Cortex; any TUI delete/purge of shared memory; new feature surfaces (drawers, plugins, headless Fusion) — those re-enter through their own intents.

## Policy applied while writing
`kaidera-sdlc` (plan before code; verification pasted; author never approves); `docs/RELEASE_SOP.md` (consent per version); `docs/DEVELOPMENT_PROCESS.md`; `FORK.md` touch-list (upstream pristine; memory changes in the openkai layer + the sanctioned settings/memory-backend files); design v2 §2–§5; the Cortex access rule (API only, no direct DB).

## Resolved decisions and active dependencies
1. D1: retire `local`; the reversible destination is `off`, with every legacy file and database row left untouched and surfaced by a one-time notice.
2. D0: the CTO confirmed explicit 0.1.12 consent was given in its live release session; record that separately from the waived external gates.
3. D2: no legacy importer. Documentation preserves discovery and retained-file paths.
4. D3: hosted Cortex is deferred behind a cross-project contract and acceptance environment; it does not gate 0.1.13 and contributes no code to its candidate.
5. D4: every synthetic drive uses `openkai-acceptance` / `probe` on a disposable appliance and archives in `finally`.
6. D5: transcript ingest remains off by default; retention follows and is proven against appliance policy.
7. D6: clean-host acceptance has independent KOS and fresh-macOS rows. KOS baseline exists; macOS is blocked until an administrator can create the fresh account.
8. Managed-lane clarification: `CORTEX_PROJECT` is explicit KOS deployment policy and overrides the local backend value. A separate gate proves activation and deactivation.
9. Cortex platform dependencies: publish the local installer used by A4 and provide a typed project archive operation used by A11.
10. Provider mutation and backup restore require disposable appliances. The shared development appliance is observation-only.
11. The stale live installer is `Kaidera-AI/OpenKai` public `main › scripts/install.sh`, not the source-fork copy. W3 prepares a current-`origin/main` consistency branch; changing its default is RELEASE_SOP gated action 5 in W7.
12. The admin token may be loaded for a drive; persisting, printing, or placing it in history is forbidden. Evidence files are redacted.

## Acceptance
`ACCEPTANCE_MATRIX.md` is normative. `PASS` means the complete row ran against the folded 0.1.13 candidate; historical 0.1.12 observations are PARTIAL baseline only. FAIL, BLOCKED, PARTIAL, or PENDING on a pre-publication gate prevents the consent request. Post-publication rows necessarily run after the consented action and must PASS before SHIP closes.

Headline contracts: both clean hosts boot the keyless candidate and execute `/cortex status`; the published Cortex installer completes preflight/install/rollback; isolated acceptance state records, searches, ingests only when opted in, refuses unregistered writers before payload, leaks no synthetic secret to any sink, and archives cleanly; provider and degradation drives restore a scratch appliance; D1 leaves no `local`, `memories.*`, active `memory://`, or changed legacy byte/database row; backup restore is proven; candidate and public channels agree.

## Risks and rollback
Retiring `local` removes offline behavior for users without Cortex; the migration is data-preserving and the destination is honest `off`. Synthetic and provider drives cannot begin without typed cleanup plus pre-drive snapshots; every mutation restores in `finally`. A restore failure halts later drives.

Release is **not atomic across channels**. Prepared source/tag/draft only resumes with `bun run release -- 0.1.13 --resume`; a failed canonical draft workflow is rerun for the same verified provenance. If npm is public while GitHub remains draft, halt channel cutovers, verify the immutable npm payload, and resume the same version. If GitHub is public while installer or tap is stale, keep the release, repair only the failed channel against the same candidate, then rerun every channel check. Any conflicting SHA/version halts and escalates; never overwrite or renumber silently.

## Open questions
No unresolved product choice at build entry. The Cortex installer, archive API, scratch/restore environment, macOS administrator, provider credential, final Ren review, and live 0.1.13 consent are explicit dependencies, not implied passes.
