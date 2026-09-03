# Disposition — REN review of E023 Inc 06

**Status:** implementation remediation complete in the OpenKai program/source worktrees; **not a release authorization**.

This disposition covers the adversarial memory review, the public-product branding rider, feature stitching, installation/project-registration automation, Fusion, advisor defaults, and the documentation correction pass. It supersedes stale claims that the release was already shipped or that a compiled/local-Cortex drive had been completed when it had not.

## Release decision

**NO-GO until the remaining external acceptance checks are recorded.** The code and documentation fixes below are actionable and implemented, but a release still needs:

1. a clean-host installer/binary drive using the public `openkai` command and `openkai-*` assets;
2. a local-Cortex install → registration drive with a real `CORTEX_ADMIN_TOKEN`; and
3. a live enrichment-provider application check with the intended provider credential and administrator token.

These are environment/credential checks, not reasons to weaken the safety behavior or claim an unobserved success.

## A. Source-fork code disposition

### Critical — fixed

| Finding | Disposition | Evidence path |
| --- | --- | --- |
| Transcript ingest could carry secrets beyond the intended boundary. | Redact task and each visible transcript message before the Cortex HTTP boundary; redact Cortex API error bodies and persisted/read memory surfaces. | `src/openkai/cortex/client.ts`, `src/cortex-ingest/controller.ts`, `src/openkai/cortex-memory.ts`, `src/memory-backend/cortex-backend.ts` |
| A pasted code fence, quote, diff, or log line could satisfy delta evidence and poison durable memory. | Clean human text before evidence admission; reject fenced, quoted, diff-style, and log-looking payloads. Apply the cleaner in `admitDelta`, so direct callers cannot bypass it. | `src/cortex-ingest/extract.ts`, `test/openkai-cortex-memory.test.ts` |
| An implicit writer could fall through to a placeholder identity. | Resolve the project roster default before every settings-backed durable write. If no registered default exists, fail with an actionable registration error; never send a placeholder header. | `src/openkai/cortex/settings.ts`, `src/openkai/cortex-memory.ts`, `src/tools/learn.ts` |

### High — fixed

| Finding | Disposition | Evidence path |
| --- | --- | --- |
| Fusion/config/provider writes could race and lose another OpenKai config slice. | Serialize mutations in-process, use a lock file with stale-lock recovery, and write a unique temporary file before rename. Provider selection now uses the mutation path. | `src/openkai/config-io.ts`, `test/openkai-fusion-pairing.test.ts` |
| `/cortex doctor` called a command that does not exist. | Invoke the installed `cortex-doctor` binary, with an explicit missing-binary action. | `src/openkai/cortex-extension.ts` |
| Installation stopped short of making a project usable. | `/cortex install` offers confirmed project registration after install; `/cortex register [project] [agent] [role]` invokes Cortex project initialization; `/cortex agent <name> <role> [model]` adds a confirmed roster member. Registration requires `CORTEX_ADMIN_TOKEN`. | `src/openkai/cortex-extension.ts`, `test/openkai-cortex-extension.test.ts` |
| Hosted/managed Cortex could be active while Memory settings hid the connection rows. | Treat configured `CORTEX_PROJECT` as an active Cortex lane for the Memory UI and memory tool availability. | `src/openkai/cortex/settings.ts`, `src/modes/components/settings-defs.ts`, memory tests |
| SDK exact tool scopes could omit `cortex_search`/other requested OpenKai tools. | Apply the SDK tool-name whitelist to OpenKai built-ins instead of dropping the full built-in set. | `src/sdk.ts` |

### Medium — fixed

| Finding | Disposition | Evidence path |
| --- | --- | --- |
| Provider credentials were described as copied from chat-model configuration despite `api_key` being intentionally empty. | Correct the implementation contract and docs: select a provider/model, configure its enrichment credential where Cortex expects it, and report live/pending application honestly. | `src/openkai/cortex/provider-selection.ts`, provider docs |
| Fusion output prioritized role character counts and surfaced obsolete gate state. | `/fusion` is a public Architect/Builder/Judge workflow. Its verdict names agreement, compared choices, retained choice, discarded ideas, and checks. Failed panel/judge paths preserve drafts without manufacturing a verdict. | `src/openkai/fusion-tool.ts`, `src/openkai/keywords-extension.ts`, `test/openkai-fusion.test.ts` |
| Fusion command errors could be delivered as a verdict card. | Treat a tool error result as a TUI error notification and do not send a false verdict. | `src/openkai/keywords-extension.ts` |
| Two-model teamwork was not the actual default for the main setting or missing task-agent declaration. | Set the session default to enabled; absent task-agent advisor selection resolves to the advisor role; `advisor: false` and Agent Hub/settings overrides deliberately select one-model work. | `src/config/settings-schema.ts`, `src/config/model-resolver.ts`, `src/task/executor.ts`, resolver tests |
| Provider picker state was invisible after a selection. | `/cortex status` reports the latest embedding/rerank provider application outcome; `/memory stats` remains the memory diagnostic surface. | `src/openkai/cortex-extension.ts`, memory backend |

## B. Public product and documentation disposition

### Branding — fixed at public boundaries

The public executable, package wrapper, installers, release binary builders, release manifests, workflow asset names, browser-relay asset, Homebrew updater, ACP identity, CLI/process identity, terminal notification source, terminal protocol labels, help examples, TUI tips, and documentation now use **OpenKai** / `openkai`.

Public binary assets are `openkai-*`. The package wrapper exposes `openkai`. Installer paths use `OPENKAI_INSTALL_DIR` and smoke-test `openkai --version` after install.

The runtime still has internal compatibility names in package imports, legacy state paths, URI schemes, worker selectors, vendor text, and lockfiles. Those are not public product identity. `docs/FORK-SOP.md` documents the exception rule so a future rebrand sweep does not break user state or silently reintroduce old UI branding.

### Documentation — rewritten to match actual public behavior

The program docs now avoid nonexistent commands such as `openkai chat`, `openkai tui`, `openkai fuse`, `fusion report`, and `fusion dashboard`. They document:

- `openkai` as the interactive TUI;
- `/login`, `/model`, `/settings`, `/help`, `.`, `Ctrl+R`, `Ctrl+D`, and `Alt+A`;
- default advisor teamwork and intentional single-model settings;
- `/fusion` and its real three-role verdict;
- `/cortex status|preflight|install|register|agent|doctor|models`;
- roster-safe writer identity, profiles, personality, project instructions, and live steering;
- transcript opt-in, provider credential boundaries, supported model catalog refresh, and pending-admin state.

Key documents:

- `README.md`
- `docs/tui-first-steps.md`
- `docs/install.md`
- `docs/cortex-projects-agents.md`
- `docs/memory.md`
- `docs/fusion.md`
- `docs/providers.md`
- `docs/commands.md`
- `docs/FORK-SOP.md`

The source fork has matching concise README, quickstart, Cortex guide, Browser Relay README, and task-agent default correction.

## C. Plan disposition

The previous feature plan mixed research proposals, stale command names, and unverified “landed” claims. The plan is replaced by a release-oriented record:

- E023 fixes are implemented but remain unreleased pending external acceptance.
- No new feature tab or detached functionality is proposed.
- Normal advisor teamwork is the default; explicit Fusion is the focused multi-role workflow.
- Hosted Cortex, generic provider discovery, new headless Fusion commands, and the historic broad parity/CTO port list are not claimed as this cut's deliverables.
- Future work must enter with one state owner, one existing surface, an observable contract, and a verification gate.

## Tests and verification status

Focused code checks must be run after the final source edits and recorded in the GitHub finalization handoff. Documentation-only edits do not substitute for a behavioral drive. The following tests were added or extended for the changed contracts:

- Cortex secret redaction, hostile pasted evidence, roster writer resolution, missing default failure, and transcript boundary;
- concurrent OpenKai config mutation preservation;
- Cortex slash-command registration/help contract;
- managed Cortex settings visibility;
- advisor default resolution;
- Fusion actionable verdict rendering; and
- public binary/formula naming.

## Remaining handoff

See `docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md` for exact source/program handoff scope, commands to rerun, public compatibility exceptions, and the three external acceptance checks. No commit, push, tag, package publication, or release was performed as part of this remediation.
