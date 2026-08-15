# Quickstart

OpenKai allows you to run tool-using agents via a TUI or CLI, with automatic persistence to local disk and optional checkpointing to Cortex.

## Installation

OpenKai will be available as an npm package. 

```bash
# Example install (package name TBD)
npm install -g @openkai/cli
```

## Configuration

OpenKai requires an LLM provider via OpenRouter.

### Required Environment Variables
- `OPENROUTER_API_KEY`: Your OpenRouter API key.

### Optional Environment Variables
- `OPENKAI_MODEL`: The default model to use (e.g., `google/gemini-2.5-flash-lite`).
- `CORTEX_PROJECT`: The Cortex project scope (default: `openkai`).
- `CORTEX_API_URL`: The Cortex API base URL (default: `http://localhost:8501`).

## Your First Run

### Option 1: The TUI (Recommended)
The TUI provides a full-screen experience for chatting and monitoring.
```bash
openkai tui
```

### Option 2: Single-Turn Chat
Run a quick prompt from your shell:
```bash
openkai chat --prompt "Explain the OpenKai fusion core"
```

### Option 3: Fused Execution
Use the Fusion core to solve a complex task by pairing an Architect and a Builder:
```bash
openkai fuse --prompt "Design and implement a basic rate-limiter in TypeScript"
```

## Verifying Connectivity
To see if you are connected to a live Cortex instance, stream the project events:
```bash
openkai events --print
```
