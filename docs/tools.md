# Tools

OpenKai has **14+ built-in tools** — read-only by default, gated by a
permission engine for mutations.

## Tool list

| Tool | Type | Description |
|---|---|---|
| `read_file` | Read | Read a UTF-8 text file (truncated to maxBytes) |
| `list_files` | Read | List directory contents |
| `grep` | Read | Regex search across files |
| `glob` | Read | Pattern file search (`*.ts`, `src/**/*.py`) |
| `web_fetch` | Read | HTTP(S) GET, read-only |
| `todo` | Memory | Shared per-project task list (`.openkai/memory/todo.md`) |
| `lsp` | Code intel | 9 operations: definition, references, hover, diagnostics, rename, symbols, code_actions, status, reload |
| `mcp_status` | Info | List connected MCP servers and their tools |
| `hashline_edit` | Edit | Line-anchored structured edits with staleness validation |
| `task` | Delegation | Read-only subagent with outputSchema + IRC steering |
| `write_file` | Mutation | Write a file (gated by permission engine) |
| `edit_file` | Mutation | Edit a file (gated by permission engine) |
| `bash` | Mutation | Run shell commands (gated, never auto-allowed) |
| + MCP tools | Dynamic | Discovered from `~/.openkai/mcp.json` servers |

## Read tools (always available)

These 7 tools are always available, no approval needed:

- `read_file`, `list_files`, `grep`, `glob`, `web_fetch`, `todo`, `lsp`, `mcp_status`

## Mutation tools (gated)

These 3 tools require operator approval:

- `write_file`, `edit_file`, `bash`

The permission engine evaluates every gated call:

1. **Deny floor** — `.env`, `*.pem`, `*.key`, `id_rsa*`, `.git/config`, `.ssh` are always denied
2. **Rules** — last-match-wins rule evaluation (allow/ask/deny)
3. **Autonomy axis** — `off` (ask every time), `low` (trusted reads), `med` (trusted folder), `high` (full access)
4. **Session cache** — "always" answers are session-scoped, never persisted
5. **Operator prompt** — inline diff preview + once/always/reject

## LSP tool

Symbol-aware code intelligence via language server protocol:

```bash
# Go to definition
openkai lsp definition src/main.ts 42

# Find all references
openkai lsp references src/utils.ts 15 --symbol "formatBytes"

# Rename symbol
openkai lsp rename src/config.ts 30 --symbol "timeout" --new-name "timeoutMs"

# Show diagnostics
openkai lsp diagnostics src/**/*.ts

# Document symbols
openkai lsp symbols src/main.ts

# Workspace symbol search
openkai lsp symbols --query "handler"

# Code actions
openkai lsp code_actions src/main.ts 42

# Server status
openkai lsp status

# Restart server
openkai lsp reload
```

Auto-detects: `typescript-language-server` (tsconfig.json/package.json),
`gopls` (go.mod), `pyright` (pyproject.toml/setup.py).

## MCP integration

Connect to Model Context Protocol servers via `~/.openkai/mcp.json`:

```json
[
  {
    "name": "filesystem",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
  },
  {
    "name": "github",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
    }
  }
]
```

Tools are discovered at boot and registered as native tools. Check status
with `mcp_status`.

## Hashline edit tool

Line-anchored structured edits — the accuracy upgrade from omp:

```
[packages/core/src/session/hashline.ts#1A2B]
PUT 1-5:
+import { readFileSync } from "node:fs";
+const content = readFileSync("config.json", "utf-8");
+const config = JSON.parse(content);
```

- `[path#TAG]` — content-derived 4-hex tag for staleness validation
- `PUT N.=M:` — replace lines N through M
- `CUT N.=M` — delete lines N through M
- `PUT <N:` — insert before line N
- `PUT >N:` — insert after line N
- `PUT N*:` — insert after the syntactic block containing line N
- `REM` — remove the entire file

The tag is a content fingerprint. A stale tag **refuses** the edit instead
of fuzzy-matching — no silent corruption.

## Task tool (subagents)

Spawn a read-only subagent for self-contained subtasks:

```typescript
// Simple delegation
task({ prompt: "summarise the auth module's public API" })

// Typed return (JSON schema)
task({
  prompt: "list all exported functions in src/utils.ts",
  outputSchema: {
    type: "object",
    properties: {
      functions: { type: "array", items: { type: "string" } }
    }
  }
})

// Steer mid-task
steerChild(sessionId, "also check for any deprecated imports")
```

The child runs a fresh `InProcessTransport` with the read-only tool set.
It cannot mutate files or run shell. The parent keeps full control.

## Plan/Act toggle

`/plan` command swaps the agent's tool set:

- **Plan mode** (read-only): `read_file`, `list_files`, `grep`, `glob`,
  `web_fetch`, `todo`, `lsp`, `mcp_status` — 8 tools
- **Act mode** (full): all 14+ tools including mutations

The status bar shows the plan state. Mutations are refused at the gate
without prompting.

## Chat connectors

Bridge external chat surfaces into OpenKai sessions:

```bash
# Start Slack connector (Socket Mode)
openkai bridge --platform slack

# Start hub daemon for session persistence
openkai serve
```

Slack: per-thread OpenKai sessions, DM/broadcast messaging, automatic
conflict resolution between agents.

Hub daemon: Unix socket server for session persistence across terminal
restarts. Operations: list, register, touch, prune.

## Permission engine

The permission engine is **consent, not theatre**:

- **Deny floor**: `.env`, `*.pem`, `*.key`, `id_rsa*`, `.git/config`, `.ssh`
  — always denied, cannot be rule-overridden
- **Rules**: last-match-wins (`allow`/`ask`/`deny`)
- **Autonomy axis**: `off` (ask every time) / `low` / `med` / `high` (full
  access)
- **Session cache**: "always" answers are session-scoped in memory only
- **Bash clamp**: `bash` can NEVER be auto-allowed
- **Shadow snapshots**: before every approved mutation, a shadow-git
  snapshot is taken — `openkai undo` restores

```bash
# Check what would be asked
openkai info --permissions

# Undo the last mutation
openkai undo

# View undo history
openkai undo --history
```
