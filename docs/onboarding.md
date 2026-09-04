# Onboarding

The first-run setup for OpenKai. Re-runnable via `/setup` or `/welcome`.

## First run

When OpenKai starts without a completed onboarding, it runs the setup wizard:

1. **Provider sign-in** — choose a provider, enter API key or run OAuth
2. **Model selection** — pick a default model
3. **Theme selection** — dark/light/auto
4. **Memory setup** — local or Cortex-backed

The wizard runs in the TUI and never exits the app. You can re-run it anytime
with `/setup` or `/welcome`.

## Provider setup

### Option A: Aggregator (recommended)

OpenRouter covers 300+ models with one API key:

```bash
openkai login --provider openrouter
# Enter your OpenRouter API key when prompted
```

Or Kaidera Manifold:

```bash
openkai login --provider kaidera-manifold
# Enter your Manifold API key, base URL, and project ID
```

### Option B: Direct providers

```bash
openkai login --provider anthropic
openkai login --provider openai
openkai login --provider google
openkai login --provider deepseek
openkai login --provider xai
```

### Option C: Subscription lanes (OAuth)

```bash
openkai login --provider openai-codex      # OpenAI Codex subscription
openkai login --provider github-copilot    # GitHub Copilot subscription
openkai login --provider kimi-coding       # Kimi Code subscription
```

OAuth flows open a browser, you approve, and the token is stored in
`~/.openkai/.env` (mode 600).

## Model selection

After signing in, the wizard shows available models for the provider:

- **Default model** — the model for regular chat
- **Smol model** — fast, cheap model for lightweight tasks
- **Slow model** — thorough model for complex analysis
- **Plan model** — architecture planning model

Choose with arrow keys, Enter to confirm.

## Theme selection

- **Dark** — dark canvas, graphite text, mint accent
- **Light** — light canvas, paper text, mint accent
- **Auto** — auto-detect from terminal background (OSC 11 query)

## Memory setup

- **Local** — sessions persist as JSONL trees, fully offline
- **Cortex** — sessions checkpoint into pgvector-backed project memory

For Cortex, you'll need:
- `CORTEX_API_URL` — Cortex API endpoint (default: `http://127.0.0.1:8501`)
- `CORTEX_PROJECT` — Active project key

## After onboarding

Once setup is complete:

1. The splash plays (any key skips)
2. The boot card shows version, provider status, and session info
3. The status bar shows brand glyph, agent pill, provider, model, tokens
4. The composer is ready for your first prompt

```bash
# Start chatting
openkai

# Or run a single prompt
openkai chat --prompt "explain this repo's layout"

# Or fuse a task
openkai fuse --prompt "design the caching layer" --gate
```

## Re-running onboarding

```bash
# From the TUI
/setup

# From the CLI
openkai setup
```

## Skipping onboarding

```bash
# Skip onboarding and start with defaults
openkai --skip-setup

# Or set config directly
openkai config set provider openrouter
openkai config set model google/gemini-2.5-flash-lite
```

## Configuration files

| File | Purpose |
|---|---|
| `~/.openkai/.env` | API keys (mode 600, never uploaded) |
| `~/.openkai/config.json` | Session config (model, provider, theme) |
| `~/.openkai/state.json` | Runtime state (splash seen, onboarding complete) |
| `~/.openkai/mcp.json` | MCP server configuration |
| `~/.openkai/memory/todo.md` | Shared project task list |
| `~/.openkai/fusion/runs.jsonl` | Fusion telemetry |

## Next steps

- [Quickstart](quickstart.md) — 60-second setup
- [Providers](providers.md) — 21 providers, subscription lanes
- [Fusion](fusion.md) — multi-model by default
- [Memory](memory.md) — Cortex-backed project memory
- [Tools](tools.md) — 14+ built-in tools
