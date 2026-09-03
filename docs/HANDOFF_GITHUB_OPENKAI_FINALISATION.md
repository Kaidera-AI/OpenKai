# GitHub finalization handoff — OpenKai
> **Superseded for current state (2026-09-04).** 0.1.12 was published after this handoff; the current authority for Cortex delivery state is `Program/Release_v0.1.013/E024_CORTEX_COMPLETION/STATE.md`. This file remains the implementation/acceptance evidence for the 0.1.12 remediation.

**Purpose:** continue E023 finalization safely from the two local worktrees without mistaking remediation for a release.

## Working trees

| Tree | Purpose |
| --- | --- |
| `/Users/amadmalik/DevVault/openkai-fork` | Source fork: TypeScript/Rust/runtime, installers, packaging, release workflows, source docs, and tests. |
| `/Users/amadmalik/DevVault/OpenKai` | Product/program repository: public documentation, E023 disposition, gate, scope, and handoff record. |

No commit, push, tag, package publication, Homebrew publication, or release is part of this handoff.

## What changed in the source fork

### Cortex and memory safety

- Durable writes resolve an explicit roster agent or the registered project default; missing default fails before payload delivery.
- Memory, transcript ingest, error/result surfaces, and Fusion persistence redact known secret patterns.
- Decision evidence removes fences, quotes, diffs, and log-shaped text before admission.
- Settings-backed transcript construction has a direct test seam for outbound redaction.
- Cortex provider/Fusion config mutations are serialized with unique temp files and lock handling.
- Managed `CORTEX_PROJECT` sessions expose the Cortex Memory settings path.
- `cortex_search` is preserved in exact SDK tool scopes.

### Cortex operator flow

- `/cortex doctor` calls `cortex-doctor` rather than a nonexistent subcommand.
- `/cortex register [project] [agent] [role]` invokes Cortex project initialization after confirmation and requires `CORTEX_ADMIN_TOKEN`.
- `/cortex agent <name> <role> [model]` adds a confirmed roster entry.
- `/cortex install` offers registration after a successful local install.
- `/cortex status` reports the latest embedding/rerank provider application outcome.

### Model teamwork and Fusion

- **Two-model teamwork** is enabled by default.
- Missing task-agent advisor declarations resolve to the advisor role; `advisor: false` and per-agent settings deliberately select a single model.
- `/fusion` is the public Architect/Builder/Judge flow. It has no public gate parameter or headless `fuse` command.
- Fusion verdicts render comparison, retained choice, discarded ideas, and checks. Failure paths retain honest drafts rather than inventing a Judge conclusion.

### Public identity and release path

- Public executable, package wrapper, ACP metadata, help, tips, installers, release builders/manifests/workflow assets, browser-relay zip, Homebrew updater, and documentation URI use `openkai` / `openkai-*` / `openkai://`.
- Installer smoke checks run `openkai --version`.
- Terminal UI branding uses one flat, high-contrast accent; it has no gradient or shimmer effect.
- Internal runtime package names and legacy storage paths intentionally remain compatibility details; they are not public branding.

### Source documentation

- Replaced stale source README and quickstart; added the Cortex, task-agent, advisor, and Fusion guidance needed for ordinary use.
- Updated Browser Relay README, contributor title, fork boundary rules, and task-agent advisor default guidance.

## What changed in the product/program repository

- Replaced stale README, installation, onboarding, quickstart, commands, modes, sessions, tools, memory, Fusion, providers, and fork SOP docs.
- Added `docs/tui-first-steps.md` and `docs/cortex-projects-agents.md`.
- Added `Program/Release_v0.1.011/E023_CONSOLIDATED_TUI/DISPOSITION_REN_INC06.md`.
- Replaced stale E023 feature plan, epic scope, and Inc 06 gate claims with an unreleased evidence-based record.

## Required local validation

From `/Users/amadmalik/DevVault/openkai-fork`:

```sh
bun --cwd=packages/coding-agent run check
bun --cwd=packages/coding-agent test \
  test/openkai-cortex-memory.test.ts \
  test/openkai-cortex-extension.test.ts \
  test/openkai-fusion.test.ts \
  test/openkai-fusion-pairing.test.ts \
  test/model-resolver.test.ts \
  test/openkai-keywords.test.ts \
  test/modes/magic-keywords.test.ts \
  test/welcome-tip.test.ts \
  test/internal-urls/openkai-protocol.test.ts \
  test/update-cli.test.ts
sh -n scripts/install.sh
```

Run a PowerShell parser check for `scripts/install.ps1` when PowerShell is available, then run the installer/release test files that cover changed public asset names.

## Current Windows caveat

The package candidate is intentionally proceeding without a PowerShell parser check or Windows-host installer run. Windows output is untested and must not be called Windows-validated. This exception does not waive the clean-host, Cortex, or enrichment-provider external acceptance checks below.

Behavioral smoke checks:

1. Launch the built/development TUI with the public `openkai` command.
2. Run `/fusion help`; run `/cortex help`; confirm the beginner tips and displayed guidance describe the same roles and identity boundaries.
3. Verify the terminal UI uses a flat accent with no gradient or shimmer effect.
4. Verify default advisor state and deliberate single-model configuration in Settings/Agent Hub.
5. Verify an unregistered implicit Cortex writer fails before a memory write request.

## Required external acceptance before release

These cannot be substituted with mocks or documentation:

1. **Clean host:** install via a public installer or release binary; confirm `openkai --version` and launch the TUI.
2. **Local Cortex:** on a clean machine, run `/cortex install`, then `/cortex register` with a real `CORTEX_ADMIN_TOKEN`; verify status and a memory write/search cycle.
3. **Enrichment provider:** configure the provider where Cortex expects its credential, select it in **Settings → Memory → Cortex Ingest**, and verify live application with `CORTEX_ADMIN_TOKEN`.

Record command, environment class, observed output/status, and exact failure if any. Do not convert an unavailable credential or clean host into a fake green gate.

## Compatibility rule for future edits

Public product surfaces must say OpenKai/openkai. Internal package namespaces, compatibility storage paths, private wire identifiers, tests, lockfiles, and license/attribution text may retain runtime identifiers when changing them risks compatibility. Do not bulk rename those internal details.

## Release boundary

Before a future GitHub action:

1. Review both worktrees for the intended changes.
2. Confirm all local validation and three external checks are recorded.
3. Obtain required release approval.
4. Only then make commits, open a pull request, push, tag, publish a package, or create a release.
