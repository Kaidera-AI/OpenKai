# Handoff: operator → kai@openkai — Cortex completion programme planning
> **Accepted 2026-09-04 → E024.** Artifacts: `Program/Release_v0.1.013/E024_CORTEX_COMPLETION/` (`intent/cortex-completion.md`, `STATE.md` = the current authority, `EPIC_SPEC.md`, `PLAN.md`, `ACCEPTANCE_MATRIX.md`). Authoritative decisions D0–D6 are recorded in the intent; execute through the plan's gates.

**Stage:** Accepted plan executed through a reviewed local 0.1.13 candidate; reachable candidate gates are recorded. SHIP remains **MAINTAIN / NO-GO** because external acceptance and publication prerequisites are open. Publication is separately gated by `docs/RELEASE_SOP.md`.

**Current authority (2026-09-04):** `Program/Release_v0.1.013/E024_CORTEX_COMPLETION/STATE.md`. Exact source candidate: `db7f921658c57e943a763a06bf25312d9ac5eef4`; independently re-reviewed by Ren: GO/no findings. Public installer automation tip: `a8674ed27e855dc59f3b15277be1ea6989acd4cf`; the public installer default remains v0.1.009. Local checks, build/smoke/version, release dry-runs, and exact-candidate A3/A8/A10/A10M/A14/A15/A16/A19C/A20 pass. No tag, push, package publication, asset upload, Homebrew/latest-manifest update, public installer repoint, or live release occurred. Missing typed archive/restore/embedding/clean-host prerequisites and exact-version CTO consent remain gate blockers; the absent A13 credential leaves only an informational row blocked. The planning narrative below is retained as historical input; do not use it instead of STATE.

**Authority:** the operator requested a full development plan that closes every known Cortex/OpenKai delivery gap, reaches the intended functionality safely, and follows the binding SDLC process in `docs/DEVELOPMENT_PROCESS.md`.

## 1 · Current state — treat this as the starting evidence, not a future claim

The memory/Cortex implementation itself is complete and released:

- Fork branch `e023/inc-06-memory-cortex` is contained in source `main` and the `v0.1.12` source tag.
- `@kaidera/openkai@0.1.12` is the released local installation.
- The targeted client tests pass: `bun --cwd=packages/coding-agent test test/openkai-cortex-memory.test.ts test/openkai-cortex-extension.test.ts` → **28 pass / 0 fail**.
- Settings now expose `memory.backend = off | local | cortex`; legacy Hindsight/Mnemopi/Mnemosyne migrate to Cortex, Sharpshooter retires, and its friction gate is used by `cortex-ingest`.
- The local Cortex appliance at `http://localhost:8501` is healthy; the `openkai` project is active, registered, and has default writer `kai`; its degradation surface is empty.
- The current OpenKai configuration is **inactive**: `memory.backend = off`, no `CORTEX_PROJECT` override, and no explicit Cortex project/agent settings. When enabled from this repository, the client derives project `openkai` from the working directory and resolves the registered `kai` default writer safely.

Do not mistake “implemented and released” for “operationally accepted”. The old external gates were waived for the 0.1.12 release; they remain unexecuted, not passed:

1. Fresh-host install/binary/TUI drive.
2. Settings-driven local Cortex install/register/record/search cycle using a real admin token where registration is needed.
3. Live embedding/rerank provider application through Settings → Memory → Cortex Ingest.
4. A live OpenKai memory round trip without polluting the production `openkai` project.

Historical handoffs are not the current authority:

- `docs/HANDOFF_KAI_E023_INC06_MEMORY_CORTEX.md` is explicitly superseded.
- `docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md` remains useful implementation and acceptance evidence, but its no-release boundary predates 0.1.12.
- `Program/PROGRESS.md` and older KOS handoffs contain historical registration/release state and require a truth-preserving consolidation rather than another contradictory sibling record.

## 2 · Goal

Produce one accepted programme plan that turns the delivered client stitch into a safe, verifiably operational Cortex memory capability for OpenKai, closes the acceptance/documentation/process gaps, and defines the separate hosted-Cortex delivery path without silently expanding scope or weakening release controls.

The plan must distinguish three tracks:

1. **Current-release operational acceptance** — validate the existing 0.1.12 client and record actual observations.
2. **Client/product remediation** — only changes found necessary by those drives; deliver with tests, review, and a future explicit release decision.
3. **Hosted Cortex capability** — previously parked for the v0.1.13 planning window; own its platform dependency explicitly rather than pretending an OpenKai settings row is a hosted service.

## 3 · Required planning scope

Your intent, spec, and `PLAN.md` must cover all of the following.

### A. Safe local activation and operator experience

- Keep Cortex opt-in. Do **not** make `memory.backend = cortex` the default merely because an appliance is reachable; activation begins shared durable recall/write behaviour.
- Define the operator journey from `off` to Cortex: status/preflight, registration if absent, project/agent resolution, clear consent, first-turn recall, ingest settings, and a reversible return to `off` or `local`.
- Define precise status/error states for unreachable API, missing project, missing default writer, missing admin token, vector-only retrieval, and provider degradation.
- Decide whether the current documentation and command UX are sufficient or need a narrow remediation increment.

### B. Live acceptance without corrupting programme memory

- Design a disposable, named acceptance project and agent for record/search/ingest tests. Never use the production `openkai` project for synthetic markers or transcript fixtures.
- Specify the clean-host environment, install channel, exact commands, required credentials, redaction rules for captured evidence, cleanup, and rollback.
- Include settings-driven proof with no `CORTEX_PROJECT`/token environment shortcuts unless a managed-lane test is explicitly being performed.
- Capture both happy-path and refusal proof: unregistered implicit writers must fail before a payload leaves OpenKai; secrets must not reach Cortex records, transcript ingest, errors, or provider files.

### C. Provider and retrieval functionality

- Plan a real embedding/rerank provider application exercise using the proper Cortex control plane and `CORTEX_ADMIN_TOKEN`; no credential copying into OpenKai source, fixtures, logs, or project settings.
- Verify picker state, provider-file single authorship, model application, embedding backlog/health where available, vector-only behaviour when rerank is unset, and loud `/degradation` reporting for actual failures.
- Record provider cost/availability and a deterministic fallback policy. Do not claim hosted credentials or a configured paid provider where none exists.

### D. Migration, retention, and data boundaries

- Preserve the current migration contract: legacy remote Hindsight banks and Mnemopi SQLite files are not silently imported or deleted.
- Decide with the operator whether an **explicit, auditable, opt-in** export/import capability is a product requirement. If yes, make it a separately reviewed workstream with idempotency, provenance, redaction, dry-run, rollback, and tests; if no, document the retention/discovery path clearly.
- Define transcript retention, project isolation, roster ownership, deletion/repair expectations, and backup/restore evidence. The prior Cortex restore lost historical rows; this programme must include an incident-follow-up/eval rather than treating backup durability as assumed.

### E. Hosted Cortex as a real cross-project deliverable

- Treat hosted Cortex as a distinct platform workstream, owned jointly with the receiving Kaidera platform/Cortex owner named in `docs/HANDOFF_TO_ALPHA_KAIDERA_HOSTED_CORTEX.md`.
- Specify tenant/project provisioning, token issuance and rotation, TLS, RLS/authorisation, roster lifecycle, rate/cost boundaries, observability, support/rollback, and the OpenKai client contract.
- Establish the cross-project API/version contract and acceptance environment before scheduling OpenKai changes that depend on it.
- If a hosted launch cannot fit the next approved release, leave it explicitly deferred with a dependency owner and acceptance criteria. Do not represent it as complete because the local client supports `cortex.apiUrl` and `cortex.token`.

### F. Documentation and programme truth

- Name a single current authority for Cortex delivery state and update it with factual 0.1.12 release status, observed acceptance results, waived/unrun checks, and current configuration state.
- Supersede stale handoff claims by pointer; preserve history rather than rewriting it as if earlier blockers never existed.
- Update user-facing memory/Cortex setup, data-retention, migration, clean-host, provider, and hosted-service boundaries only after the corresponding behaviour is proven.
- Include a handoff/ledger protocol so Kai, Beat, Ren, Quill, Cole, and Bob cannot work from conflicting status documents.

### G. Engineering, review, and release discipline

- Work in the two-repository model and follow `docs/DEVELOPMENT_PROCESS.md`: intent/grill first; accepted spec before plan; accepted plan before waves; one worktree/concern per build wave; independent review; evidence pasted in return.
- Identify every affected source, test, product-document, release, and provider/Cortex contract file before implementation.
- Separate operator-owned credential drives from code-owned work. A missing credential is a blocked gate with recorded evidence, never a synthetic green result.
- Any future release remains subject to `docs/RELEASE_SOP.md`: no tag, publication, asset upload, or distribution-channel change without explicit CTO consent for the named version in that live session.

## 4 · Required planning artefacts

Use the next unallocated programme epic/version only after reconciling the ledger; do not assume a release number or rewrite E023 as though it were unreleased.

Produce, in order:

1. A compact intent with the five required headings, evidence above, scope/non-scope, and a grill record listing only genuine decisions.
2. A current-state reconciliation note that maps source `main`, public 0.1.12, appliance/project state, historical handoffs, and every unresolved acceptance item to one authority.
3. A spec or ADR for the operational model: local opt-in, test-project isolation, provider boundary, migration/retention, hosted dependency, security/privacy, and failure/rollback semantics.
4. One programme `PLAN.md` with waves, owners, worktrees, dependencies, exact files, risk/rollback, proof commands, review handoffs, and stop/go gates.
5. A named acceptance matrix. Each row needs an environment class, command/drive, expected observable result, captured evidence location, owner, and release relevance.
6. A documentation/ledger amendment plan that avoids duplicate “current” handoffs.

The plan should remain executable rather than aspirational. Every planned task must identify its observable contract and verification. Verification is the final stage of each implementation wave, not a deferred appendix.

## 5 · Required wave shape

Use this as the minimum decomposition; refine it only when evidence makes a split necessary.

| Wave | Stage | Deliverable | Dependency / proof |
| --- | --- | --- | --- |
| W0 | INTENT/GRILL | Scope decisions and a reconciled source of truth | No code; operator decisions and fact table accepted |
| W1 | SPEC/PLAN | Operational, privacy, migration, provider, and hosted-service contracts | ADR/spec reviewed by Ren before build dispatch |
| W2 | VERIFY | Isolated local-appliance acceptance drive for the released client | Disposable project; record/search/ingest plus refusal/redaction proof |
| W3 | BUILD/VERIFY | Only client/docs/test remediations discovered in W2 | Changed-contract tests and a real OpenKai drive |
| W4 | VERIFY | Provider selection/application and retrieval-degradation acceptance | Correct control-plane credentials; no secret leakage |
| W5 | BUILD/VERIFY | Hosted-Cortex work, if the platform contract and owner are accepted | Separate cross-project handoff and environment |
| W6 | REVIEW/ADJUDICATION | Ren review, Kai adjudication, evidence consolidation | Each finding dispositioned on the reviewed tip |
| W7 | SHIP or MAINTAIN | Future release preparation or deferred/incident follow-up | Explicit CTO go for a named release; otherwise no publication |

W2 and W4 may be operator-owned external drives; do not substitute mocks for them. W3 and W5 are conditional: they begin only after the preceding evidence establishes a real required change and the plan is accepted.

## 6 · Non-negotiable safety constraints

- Never write synthetic acceptance data to the production `openkai` project.
- Never expose, persist, or copy `CORTEX_ADMIN_TOKEN`, provider credentials, or hosted tokens in logs, handoffs, fixtures, commits, shell history, or settings that should be credential-backed.
- Never turn shared durable memory on without explicit operator consent and a clear retention explanation.
- Never perform destructive migration, automatic legacy-memory import, or bulk deletion without an accepted, reversible design.
- Never call an external/credential-bound gate passed unless its literal observed result is recorded.
- Never publish as part of planning or because a plan/test is complete.

## 7 · Reading order

1. `docs/DEVELOPMENT_PROCESS.md`
2. `docs/RELEASE_SOP.md`
3. `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/PLAN.md`
4. `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/MEMORY_CORTEX_DESIGN.md`
5. `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/DISPOSITION_REN_INC06.md`
6. `docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md`
7. `docs/HANDOFF_TO_ALPHA_KAIDERA_HOSTED_CORTEX.md`
8. Fork source: `packages/coding-agent/src/openkai/cortex/`, `src/openkai/cortex-memory.ts`, `src/memory-backend/cortex-backend.ts`, `src/cortex-ingest/`, `src/config/settings-schema.ts`, `src/config/settings.ts`, and the Cortex test suite.

## 8 · Return required from Kai

Return the accepted planning artefacts, the decision log, the wave/owner/dependency table, the acceptance matrix, exact proposed source-of-truth updates, and every operator/CTO decision still needed. Report blockers as blockers with the missing external prerequisite and the evidence already gathered. Do not return implementation, a release, or unverified green claims.
