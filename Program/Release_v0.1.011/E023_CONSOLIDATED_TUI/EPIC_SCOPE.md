# E023 scope — consolidated TUI remediation

**Status:** source remediation is implemented in a working tree. E023 is **not shipped** and this file is not release approval.

## In scope

E023 consolidates existing OpenKai surfaces around five connected user flows:

1. **Start and configure OpenKai** — public command/installers/assets use `openkai`; the TUI leads with `/login`, `/model`, `/settings`, and `/help`.
2. **Work with one or two models intentionally** — advisor teamwork is the default; Settings, Agent Hub, and task-agent frontmatter make single-model mode explicit.
3. **Compare a hard decision** — `/fusion` runs Architect, Builder, and Judge and renders an actionable verdict.
4. **Use shared project memory safely** — Settings-driven Cortex connection, roster-safe writes, opt-in transcript ingest, hostile pasted-text filtering, and visible provider state.
5. **Install/register Cortex with operator control** — `/cortex preflight|install|register|agent|doctor|models` follow confirmation and administrator-token boundaries.

## Explicitly out of scope

The following are not E023 deliverables and must not be claimed in release notes or public docs:

- a new feature/labs/settings tab;
- a public headless Fusion CLI, `fusion report`, or `fusion dashboard` command;
- model-authored Fusion gates running shell commands;
- generic dynamic discovery of arbitrary enrichment providers;
- hosted Cortex service rollout or a platform-side credential workflow;
- unrelated drawer/layout/plugin/obligation-ledger ports;
- broad upstream version sync or a parity-census completion claim;
- a release, package publication, tag, commit, or push.

## Safety invariants

- A Cortex durable write must use an explicit registered writer or the registered project default. No placeholder agent identity may leave OpenKai.
- Automatic decision extraction must not turn pasted fences, quotes, diffs, or logs into durable evidence.
- Transcript ingest stays off until the operator enables it.
- OpenKai does not copy the active chat model credential into a Cortex enrichment-provider selection.
- Installation, project registration, and roster changes require a user confirmation; project registration also requires `CORTEX_ADMIN_TOKEN`.
- Public product surfaces use OpenKai/openkai. Internal runtime compatibility identifiers are not a license to expose legacy branding.

## Exit criteria

E023 can enter release review only after:

1. `bun --cwd=packages/coding-agent run check` and focused changed-contract tests are green;
2. interactive verification covers `/fusion help`, `/cortex help`, advisor/single-model configuration, and the TUI help tips;
3. a clean-host public installer/binary drive proves the `openkai` executable and `openkai-*` assets;
4. a local Cortex install → registration drive uses a valid admin token;
5. a live provider-application drive proves or explicitly rejects the intended enrichment provider configuration; and
6. the finalization handoff records exact results and remaining compatibility exceptions.

Until then, the correct status is **unreleased, pending external acceptance**.

## Future scope rule

Future work must be proposed independently with one existing surface, one state owner, a user-visible contract, and a focused gate. The future item does not ride E023 merely because it concerns the TUI, memory, models, or installation.
