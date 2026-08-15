# Commands Reference

All commands are executed via the `openkai` binary.

## Global Options
These options can be used with most commands to override environment defaults.

| Flag | Description | Default |
|---|---|---|
| `--project <key>` | Cortex project scope | `$CORTEX_PROJECT` or `openkai` |
| `--api <url>` | Cortex API base URL | `$CORTEX_API_URL` or `http://localhost:8501` |
| `--agent <name>` | Agent name for Cortex writes / X-Agent-Name | N/A |

---

## Commands

### `openkai` / `openkai tui`
Launches the pi-tui alt-screen TUI shell.

**Options:**
- `--model <id>`: OpenRouter model id (default: `$OPENKAI_MODEL`).
- `--session <id>`: Resume a specific session by id.
- `--system-prompt <text>`: Override the default system prompt.

### `openkai chat`
Runs a single-prompt agent turn over OpenRouter and streams the reply to stdout.

**Required Options:**
- `--prompt <text>`: The user prompt for the turn.

**Options:**
- `--model <id>`: OpenRouter model id (default: `$OPENKAI_MODEL` or `nvidia/nemotron-3-nano-30b-a3b:free`).
- `--system-prompt <text>`: Override the system prompt.
- `--quiet`: Suppress stderr diagnostics.

### `openkai sessions`
Lists local persisted sessions or inspects a specific session tree.

**Options:**
- `--show <id>`: Show full entries for the specified session id.

### `openkai fuse`
Runs a task through the fusion core: pairs an Architect and a Builder in parallel, then produces an attributed synthesis.

**Required Options:**
- `--prompt <text>`: The user prompt for the fusion run.

**Options:**
- `--architect-model <id>`: Model for the Architect role (default: `$OPENKAI_MODEL`).
- `--builder-model <id>`: Model for the Builder role (default: same as architect).
- `--judge-model <id>`: Model for synthesis and gate validation.
- `--gate`: Enable gate-first validation (FU-3).
- `--max-rounds <n>`: Gate repair cap, 1-10 (default: 3).

### `openkai events`
Streams live Cortex team events (SSE) to stdout.

**Required Options:**
- `--print`: Required to enable streaming output.

**Options:**
- `--last-id <id>`: Resume streaming after a specific event id.
- `--count <n>`: Events per server read, 1-200 (default: 50).
- `--ping <seconds>`: Server keep-alive cadence, 1-60 (default: 15).
- `--keepalive`: Print `: ping` keep-alive ticks to stdout.
- `--verbose`: Print connect/retry diagnostics to stderr.

---

## Help
Use `-h` or `--help` with any command to see the usage text.
