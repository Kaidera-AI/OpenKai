# OpenKai commands

Use `/help` inside the TUI for the live command list. This page covers the OpenKai-specific everyday commands without inventing separate CLI subcommands.

## Start and model setup

| Command | Purpose |
| --- | --- |
| `/help` | Show available commands. |
| `/login` | Connect a model provider. |
| `/model` | Choose a model or configure model roles. |
| `/settings` | Change durable settings. |

## Work with agents

| Control | Purpose |
| --- | --- |
| `Alt+A` | Open Agent Hub. |
| `Enter` on an agent | Read or steer that agent. |
| `.` | Tell the active agent to continue. |
| `Ctrl+R` | Search/reuse an earlier message. |
| `Ctrl+D` | Leave safely and preserve an unfinished draft. |

## Fusion

| Command | Purpose |
| --- | --- |
| `/fusion <task>` | Ask Architect, Builder, and Judge to compare a difficult task. |
| `/fusion help` | Explain the three roles. |
| `/fusion` | Open the model-pair menu when the TUI is available. |

See [Fusion](fusion.md) for the verdict format and when to use it.

## Cortex

| Command | Purpose |
| --- | --- |
| `/cortex` or `/cortex status` | Show connection and registration status. |
| `/cortex preflight` | Run read-only installation checks. |
| `/cortex install` | Install local Cortex after confirmation. |
| `/cortex register [project] [agent] [role]` | Register the project and first writer; requires `CORTEX_ADMIN_TOKEN`. |
| `/cortex agent <name> <role> [model]` | Add a roster agent after confirmation. |
| `/cortex doctor` | Run the installed Cortex verifier. |
| `/cortex models` | Refresh supported Cortex model discovery. |
| `/memory stats` | Show memory backend and retrieval/provider status. |

## Command names that do not exist

Do not document or automate `openkai chat`, `openkai tui`, `openkai fuse`, `fusion report`, or `fusion dashboard` as public commands. Start the TUI with `openkai`; use `/fusion` and the `/cortex` family inside it.
