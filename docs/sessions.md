# Session Management

OpenKai treats conversations as durable, branchable trees rather than linear chat logs.

## Storage
Sessions are persisted locally in the `.openkai/sessions/` directory relative to where the CLI is run. 

## JSONL v3 Tree
OpenKai uses a JSONL (JSON Lines) v3 format for sessions. Each entry in the session file is a discrete event (user prompt, agent response, tool call, tool result) linked by parent IDs, allowing the harness to represent divergent conversation paths and resumes.

## Resuming Sessions
You can resume a previous conversation in the TUI:

```bash
openkai tui --session <session-id>
```

## Inspecting Sessions
To list all local sessions or view the full entry tree for a specific session, use the `sessions` command:

```bash
# List all sessions
openkai sessions

# Show full tree for a specific session
openkai sessions --show <session-id>
```

## Cortex Checkpointing
When a Cortex API is configured, OpenKai automatically checkpoints sessions via `POST /sessions/ingest` and `POST /log`. This ensures that your local history is backed up to the durable project memory.
