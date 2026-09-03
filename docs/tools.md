# Tools

OpenKai's active model can use tools for files, search, edits, shell commands, browser work, code intelligence, debugging, and task delegation. The exact available set depends on the session, model, permissions, and configured extensions.

Do not treat this page as a static exhaustive tool registry. Use the TUI, `/help`, and the active model's tool descriptions for the current contract.

## OpenKai-specific tools

When Cortex memory is available:

- `cortex_search` searches the active Cortex project.
- `cortex_record` writes a deliberate durable memory through a registered writer.
- `learn` records a lesson through the active memory backend.

When Fusion is available:

- `fusion` runs the Architect/Builder/Judge comparison used by `/fusion`.

Cortex tools remain discoverable when memory is off, but they explain how to enable it rather than silently using an unconfigured project.

## Approval and safety

OpenKai asks for approval according to the active approval settings. Do not assume a tool can act on a browser account, filesystem location, or remote service without the operator's consent.

The browser relay is especially sensitive: relay mode can operate a real logged-in Chrome tab. Set a target tab explicitly and do not request consequential actions you do not intend to authorize.

## Task agents

The `task` capability can create worker agents. Open Agent Hub with `Alt+A` to inspect and steer them. The default advisor model is a separate observer, not a worker agent.

## Memory privacy

Cortex transcript ingest is off by default. Known credential patterns are redacted at the outbound boundary, but only enable sharing for conversations that are appropriate for the shared project service.

See [Memory](memory.md), [Cortex projects and agents](cortex-projects-agents.md), and [Sessions](sessions.md).
