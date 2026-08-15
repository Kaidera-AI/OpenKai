# Operational Modes

OpenKai can operate in different configurations depending on whether you are using it as a standalone tool or as part of the Kaidera OS (KOS) ecosystem.

## Standalone Local Mode
In this mode, OpenKai runs as a local binary. 
- **Persistence:** Sessions are stored in `.openkai/sessions/`.
- **Memory:** If no Cortex API is provided, OpenKai operates in "local-only" mode, where durable memory is limited to the local session tree.
- **Connectivity:** Requires `OPENROUTER_API_KEY` for LLM access.

## KOS-Managed Mode
When running within Kaidera OS, OpenKai is integrated into the project's infrastructure.
- **Automatic Configuration:** `CORTEX_PROJECT` and `CORTEX_API_URL` are typically provided by the environment.
- **Durable Memory:** Every interaction is automatically checkpointed to the project's Cortex instance, allowing team-wide visibility and retrieval.
- **Identity:** The `--agent` flag is used to identify which specific agent is performing the action in the project logs.

## Environment Configuration

| Variable | Purpose | Default |
|---|---|---|
| `CORTEX_PROJECT` | Defines the memory scope | `openkai` |
| `CORTEX_API_URL` | The endpoint for Cortex memory | `http://localhost:8501` |
| `OPENKAI_MODEL` | The default LLM for chat/TUI | `google/gemini-2.5-flash-lite` |

To switch projects or API endpoints on the fly, use the CLI flags:
```bash
openkai chat --prompt "..." --project my-private-proj --api http://cortex.internal:8501
```
