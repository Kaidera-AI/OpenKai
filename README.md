# OpenKai

OpenKai is Kaidera's terminal-first coding agent. Its TUI lets you choose models, supervise worker agents, use an advisor for a second opinion, ask an explicit Fusion team to compare hard choices, and optionally share durable project memory through Cortex.

## Start with the TUI

```sh
openkai
```

Then use these three commands:

```text
/login       connect a provider
/model       choose the active model
/settings    change durable preferences
```

Ask a small question about the current folder first. Type `/help` at any time.

| Need | Control |
| --- | --- |
| Continue the previous conversation | `.` |
| Search conversation history | `Ctrl+R` |
| Leave safely and keep an unfinished draft | `Ctrl+D` |
| Watch or steer a worker agent | `Alt+A`, select an agent, then `Enter` |
| Ask a deliberate model team | `/fusion your task` |
| Check Cortex and memory health | `/cortex status`, `/memory stats` |

## Two ways to use more than one model

**Two-model teamwork is the normal mode.** The active model works while an advisor model checks progress and sends notes. Turn it off in **Settings → Model → Two-model teamwork** when you deliberately want one model. A child agent can also be set to one-model mode in Agent Hub.

**Fusion is a focused comparison for a difficult decision.** `/fusion` starts an Architect, a Builder, and a fresh Judge. The Architect plans, the Builder gives an independent answer, and the Judge tells you what agrees, which choice to keep, what to set aside, and what to check.

```text
/fusion design a safe migration for this service
/fusion help
```

## Optional Cortex memory

Cortex is a shared project notebook. Enable it from **Settings → Memory**, then:

```text
/cortex status
/cortex install
/cortex register [project] [agent] [role]
```

Installation and registration ask before changing anything. Registration requires `CORTEX_ADMIN_TOKEN`; a normal API token cannot create a shared project or roster.

## Documentation

- [TUI first steps](docs/tui-first-steps.md)
- [Installation](docs/install.md)
- [Cortex projects, agents, profiles, personas, and steering](docs/cortex-projects-agents.md)
- [Memory](docs/memory.md)
- [Fusion](docs/fusion.md)
- [Providers](docs/providers.md)
- [Commands](docs/commands.md)
- [Modes](docs/modes.md)
- [Sessions and agent steering](docs/sessions.md)
- [Tools](docs/tools.md)
- [Fork boundary and upstream compatibility](docs/FORK-SOP.md)
- [Finalization handoff](docs/HANDOFF_GITHUB_OPENKAI_FINALISATION.md)

## Release status

The tracked E023 memory, Fusion, advisor, installer, and branding work is **unreleased** until the source fork passes its focused validation and the required clean-host/local-Cortex checks are recorded. Documentation names the intended public `openkai` command and `openkai-*` release assets; it does not claim that an unpublished build has shipped.

**Windows validation caveat:** this package candidate has not received a PowerShell parser check or a Windows-host install run. It may be packaged by explicit approval, but it must not be represented as Windows-validated.
