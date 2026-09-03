# OpenKai capabilities

This document describes the current public OpenKai surface. When code and documentation disagree, treat the behavior as a bug to fix rather than inventing a command.

## TUI and sessions

- Start the interactive TUI with `openkai`.
- Use `/login`, `/model`, `/settings`, and `/help` for setup.
- Use `.` to continue, `Ctrl+R` to reuse/search a prior message, and `Ctrl+D` to leave safely with an unfinished draft.
- Use `openkai --continue` or `openkai --resume` for prior sessions.
- Use `Alt+A` to inspect and steer live worker agents.

## Models and teamwork

- OpenKai normally runs a main model with an advisor model that checks the work.
- Turn off **Two-model teamwork** in Settings or for an individual child agent when you intentionally want one model.
- `/fusion <task>` runs Architect, Builder, and Judge for a deliberate hard-choice comparison.
- `/fusion` is interactive; no public `openkai fuse`, `fusion report`, or `fusion dashboard` command is claimed.

## Cortex memory

- Choose **Off**, **Local**, or **Cortex** under Settings → Memory.
- Cortex can recall project context, search through `cortex_search`, write intentional memories, and extract high-signal decision deltas.
- `/cortex status|preflight|install|register|agent|doctor|models` are the supported Cortex command family.
- Registration needs `CORTEX_ADMIN_TOKEN`; transcript ingest is off by default.
- Cortex embedding/rerank choices are visible in Settings → Memory → Cortex Ingest and report live/pending state honestly.

## Tools and permissions

The active tool set depends on the session, model, permission settings, and extensions. The agent can use workspace/file/search/edit/shell/code-intelligence/debug/task tools when enabled. It must follow the active approval policy and protected-path rules.

The browser relay can operate a real logged-in Chrome tab only after explicit relay opt-in. Always target the intended tab and do not authorize unintended consequential actions.

## What is intentionally not promised

- Generic dynamic discovery of every enrichment provider.
- A hosted Cortex rollout or a provider credential-copy mechanism.
- A public headless Fusion CLI or model-authored shell gate.
- A new detached feature/labs tab.

See [Commands](commands.md), [Fusion](fusion.md), [Memory](memory.md), and [Cortex projects and agents](cortex-projects-agents.md).
