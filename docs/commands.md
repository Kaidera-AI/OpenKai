# Commands

Every OpenKai command, organised by purpose.

## Core commands

| Command | Description |
|---|---|
| `openkai` | Start the TUI (alt-screen terminal interface) |
| `openkai tui` | Same as `openkai` |
| `openkai chat --prompt <text>` | Single-turn chat (scriptable, no TUI) |
| `openkai fuse --prompt <text> [--gate]` | Architect + builder panel → attributed synthesis |
| `openkai sessions` | Browse/resume session trees |
| `openkai models` | Browse models across all providers |
| `openkai info` | Self-check: mode, providers, catalogue, state |

## Session commands

| Command | Description |
|---|---|
| `openkai sessions` | List all sessions |
| `openkai sessions --show <id>` | Show a session's transcript |
| `openkai sessions --resume <id>` | Resume a session |
| `openkai sessions --fork <id>` | Fork a session at a boundary |
| `openkai sessions --delete <id>` | Delete a session |
| `openkai sessions --ingest <id>` | Ingest session into Cortex |
| `openkai undo` | Restore work tree to pre-mutation snapshot |
| `openkai undo --history` | Show undo history |

## Model commands

| Command | Description |
|---|---|
| `openkai models` | Browse all models (814 total) |
| `openkai models --provider <id>` | Models for a specific provider |
| `openkai models --search <query>` | Search models by name |
| `openkai fusion report` | Fusion telemetry per model pair |
| `openkai fusion report --pair <a+b>` | Performance for a specific pair |

## Provider commands

| Command | Description |
|---|---|
| `openkai login --provider <id>` | Sign in to a provider (OAuth or API key) |
| `openkai logout --provider <id>` | Sign out of a provider |
| `openkai config set provider <id>` | Set default provider |
| `openkai config set model <id>` | Set default model |

## Tool commands

| Command | Description |
|---|---|
| `openkai lsp <action> [file] [line]` | LSP operations (definition, references, hover, diagnostics, rename, symbols, code_actions, status, reload) |
| `openkai mcp` | MCP server management |
| `openkai mcp status` | List connected MCP servers |

## Hub & connector commands

| Command | Description |
|---|---|
| `openkai serve` | Start hub daemon (session persistence) |
| `openkai bridge --platform slack` | Start Slack connector |
| `openkai bridge --platform telegram` | Start Telegram connector |

## Maintenance commands

| Command | Description |
|---|---|
| `openkai upgrade` | Auto-update with channel detection |
| `openkai upgrade --check` | Check for updates (read-only) |
| `openkai upgrade --rollback` | Rollback to previous version |
| `openkai info` | Self-check |
| `openkai splash` | Replay the brand animation |

## Slash commands (in TUI)

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/model` | Show or change the active model |
| `/models` | Fullscreen model hub (sidebar scopes) |
| `/fuse` | Open fusion menu (pair selection) |
| `/plan` | Toggle plan mode (read-only tools) |
| `/goal` | Set/show/pause/resume session objective |
| `/settings` | Open settings panel (appearance/providers/model/interaction/memory/features) |
| `/setup` | Open onboarding panel (provider sign-in) |
| `/init` | Generate starter AGENTS.md from workspace |
| `/memory` | Open memory panel (project memory status) |
| `/clear` | Clear transcript display + context |
| `/compact` | Compact conversation context |
| `/shake` | Strip heavy tool results from context |
| `/copy [code\|cmd]` | Copy last code block / command to clipboard |
| `/stats` | Session stats: blocks, model, tokens |
| `/context` | Token usage + context window % |
| `/btw` | Side channel (answer renders as system block) |
| `/undo` | Restore work tree to pre-mutation snapshot |
| `/quit` | Exit the TUI |

## Keyboard shortcuts (in TUI)

| Key | Action |
|---|---|
| `Ctrl+K` | Command palette |
| `Ctrl+O` | Toggle thinking density |
| `Ctrl+T` | Cycle theme (auto/dark/light/kaidera-dark/kaidera-light) |
| `Ctrl+R` | Prompt history search |
| `Ctrl+D` | Save editor draft |
| `Ctrl+G` | Open external editor |
| `Esc` | Cancel current overlay / abort turn |
| `Esc-Esc` | Session tree / branch selector |
| `.` | Submit "keep going" (omp shortcut) |
| `Shift+Tab` | Cycle thinking levels |
| `↑` | Previous prompt in history |
| `↓` | Next prompt in history |
