# Run Modes

OpenKai runs in four modes: **standalone** (default), **managed** (Cortex-backed),
**print** (scriptable), and **hub** (daemon).

## Standalone mode (default)

No Cortex required. Sessions persist as local JSONL trees. Memory is
local-only. Fully offline.

```bash
openkai  # starts in standalone mode
```

**What works:**
- All 14+ tools (read-only + gated mutations)
- Fusion (architect + builder panel + synthesis)
- Local sessions and branching
- Theme auto-detection
- Permission engine with shadow snapshots
- Plan/Act toggle

**What's not available:**
- Cortex memory (embeddings, rerank, recall)
- Cross-session memory
- Project-level decisions and handoffs
- Agent coordination

## Managed mode (Cortex-backed)

Attach to a Cortex deployment for durable project memory:

```bash
export CORTEX_API_URL=http://127.0.0.1:8501
export CORTEX_PROJECT=myproject

openkai  # sessions checkpoint into pgvector-backed memory
```

**What works:**
- Everything in standalone mode
- Cortex memory (semantic search, embeddings, rerank)
- Cross-session memory recall
- Project-level decisions and handoffs
- Agent coordination (kai, bob, cole, quill, beat, ren)
- Session ingestion into Cortex
- Fusion telemetry into Cortex

**Configuration:**
- `CORTEX_API_URL` — Cortex API endpoint (default: `http://127.0.0.1:8501`)
- `CORTEX_PROJECT` — Active project key (required)

## Print mode (scriptable)

Single-turn chat without the TUI. For CI/CD, scripts, and batch processing.

```bash
# Single prompt
openkai chat --prompt "explain this repo's layout"

# With a specific model
openkai chat --prompt "review this code" --model anthropic/claude-3.5-sonnet

# JSON output
openkai chat --prompt "list the API endpoints" --format json

# Include thinking blocks
openkai chat --prompt "debug this" --print-thoughts
```

**Features:**
- Read-only tools only (no mutations)
- No approval prompts
- No TUI
- Output to stdout
- Session persisted to `~/.openkai/sessions/`

## Hub mode (daemon)

Long-running daemon for session persistence and chat connectors:

```bash
# Start hub daemon
openkai serve

# Start with a specific socket
openkai serve --socket /tmp/openkai-hub.sock

# Check hub status
openkai serve --status
```

**Hub operations:**
- `list` — list active sessions
- `register` — register a new session
- `touch` — update session last-active timestamp
- `prune` — remove stale sessions

**Chat connectors:**
- Slack Socket Mode — per-thread OpenKai sessions
- Telegram — bot integration
- Discord — bot integration

## Mode detection

OpenKai auto-detects the mode at boot:

1. If `CORTEX_API_URL` and `CORTEX_PROJECT` are set → **managed mode**
2. If `openkai serve` or `openkai bridge` → **hub mode**
3. If `openkai chat --prompt` → **print mode**
4. Otherwise → **standalone mode**

## Mode-specific configuration

### Standalone

```json
{
  "mode": "standalone"
}
```

### Managed

```json
{
  "mode": "managed",
  "cortex": {
    "apiUrl": "http://127.0.0.1:8501",
    "project": "myproject"
  }
}
```

### Hub

```json
{
  "mode": "hub",
  "hub": {
    "socket": "/tmp/openkai-hub.sock",
    "maxSessions": 16
  }
}
```

## Mode comparison

| Feature | Standalone | Managed | Print | Hub |
|---|---|---|---|---|
| TUI | ✅ | ✅ | ❌ | ❌ |
| Tools (read-only) | ✅ | ✅ | ✅ | ✅ |
| Tools (mutations) | ✅ | ✅ | ❌ | ❌ |
| Fusion | ✅ | ✅ | ✅ | ✅ |
| Local sessions | ✅ | ✅ | ✅ | ✅ |
| Cortex memory | ❌ | ✅ | ❌ | ❌ |
| Cross-session memory | ❌ | ✅ | ❌ | ❌ |
| Agent coordination | ❌ | ✅ | ❌ | ❌ |
| Session persistence | ❌ | ❌ | ❌ | ✅ |
| Chat connectors | ❌ | ❌ | ❌ | ✅ |
| Scriptable | ❌ | ❌ | ✅ | ✅ |
| Offline | ✅ | ❌ | ✅ | ❌ |
