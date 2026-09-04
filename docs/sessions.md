# Sessions

OpenKai sessions are **branchable JSONL trees** — every turn is a node, every
fork is a branch. Sessions persist locally by default and checkpoint into
Cortex when attached.

## Structure

```
~/.openkai/sessions/
  ├── <session-id>/
  │   ├── meta.json          # Session metadata (model, provider, created)
  │   ├── transcript.jsonl   # Turn-by-turn transcript
  │   ├── state.json         # Session state (goal, plan mode, plan)
  │   └── branches/
  │       ├── main.jsonl     # Main branch
  │       └── <fork-id>.jsonl # Forked branches
  └── index.json             # Session index (id → metadata)
```

## Lifecycle

1. **Create** — `openkai` or `openkai chat --prompt ...` starts a new session
2. **Turn** — each prompt/response pair is a turn, appended to the transcript
3. **Fork** — `openkai sessions --fork <id>` creates a branch at a boundary
4. **Resume** — `openkai sessions --resume <id>` continues from the last turn
5. **Checkpoint** — managed mode checkpoints into Cortex memory
6. **Archive** — sessions are never auto-deleted; archive manually

## Commands

```bash
# List all sessions
openkai sessions

# Show a session's transcript
openkai sessions --show <id>

# Resume a session
openkai sessions --resume <id>

# Fork a session
openkai sessions --fork <id>

# Delete a session
openkai sessions --delete <id>

# Ingest into Cortex
openkai sessions --ingest <id>
```

## Session state

Each session carries:

- **Model** — the active model (can change mid-session with `/model`)
- **Provider** — the active provider
- **Goal** — optional session objective (set with `/goal`)
- **Plan mode** — read-only tools (toggle with `/plan`)
- **Messages** — the conversation transcript
- **Usage** — token counts, cost per turn

## Fusion sessions

Fusion runs create **three separate sessions**:

1. **Architect session** — fresh context, plans and critiques
2. **Builder session** — fresh context, implements
3. **Synthesis session** — fresh context, merges with attribution

Each session is independent — no shared message arrays, no history replay
across models. The synthesis session merges with mandatory attribution.

## Session trees

Sessions can be forked into branches:

```
main
  ├─ turn 1
  ├─ turn 2
  ├─ fork-a
  │   ├─ turn 3 (fork)
  │   └─ turn 4 (fork)
  └─ turn 3 (main)
```

Each branch is a separate JSONL file. The main branch is `main.jsonl`;
forks are `<fork-id>.jsonl`.

## Cortex checkpointing

In managed mode (`CORTEX_API_URL` + `CORTEX_PROJECT` set), sessions are
checkpointed into Cortex memory:

- Every turn is ingested as a structured document
- Turns are embedded as semantic vectors (see [Memory](memory.md))
- Session metadata is stored in the project memory graph
- Fusion runs are ingested as separate sessions with their own embeddings

## Resume behaviour

When you resume a session:

1. The full transcript is loaded into the agent context
2. The active model and provider are restored
3. The session state (goal, plan mode) is restored
4. The session tree is loaded (forks visible in `Esc-Esc`)
5. The composer is ready for the next prompt

## Draft persistence

Editor drafts are saved on `Ctrl+D` and restored on resume:

```bash
# Draft saved automatically
Ctrl+D

# Draft restored on resume
openkai sessions --resume <id>
```

## Session export

```bash
# Export a session to HTML
openkai sessions --show <id> --export html

# Export to JSON
openkai sessions --show <id> --export json
```

## Auto-resume

With `autoResume` enabled, OpenKai resumes the most recent session on launch:

```json
{
  "autoResume": true
}
```
