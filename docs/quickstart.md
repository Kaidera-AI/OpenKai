# Quickstart

Get OpenKai running in 60 seconds.

## Install

```bash
# Homebrew (macOS/Linux)
brew install kaidera-ai/tap/openkai

# npm (node ≥ 22.19)
npm install -g @kaidera/openkai

# bun
bun add -g @kaidera/openkai

# curl (standalone binary, no node required)
curl -fsSL https://raw.githubusercontent.com/Kaidera-AI/OpenKai/main/scripts/install.sh | sh
```

## Configure a provider

```bash
# One env file, all providers
echo 'OPENROUTER_API_KEY=sk-or-...' >> ~/.openkai/.env

# Or use Kaidera Manifold (aggregator)
echo 'KAIDERA_MANIFOLD_API_KEY=km-...' >> ~/.openkai/.env
echo 'KAIDERA_MANIFOLD_BASE_URL=https://api.kaidera.ai/v1' >> ~/.openkai/.env
echo 'KAIDERA_MANIFOLD_PROJECT_ID=your-project-uuid' >> ~/.openkai/.env
```

See [Providers](providers.md) for the full list of 21 providers.

## First run

```bash
# Check everything is working
openkai info

# Start the TUI
openkai

# Or run a single prompt
openkai chat --prompt "explain this repo's layout"

# Or fuse a task (architect + builder panel)
openkai fuse --prompt "design the caching layer" --gate
```

## What you'll see

1. **Splash** — the Kaidera hexagon plays for ~2.6s (any key skips)
2. **Boot card** — compact hexagon mark with version + provider status
3. **Status bar** — brand glyph, agent pill, provider, git branch, session,
   model, tokens
4. **Composer** — type your prompt, Enter to submit, `↑` for history

## First commands

| Command | What it does |
|---|---|
| `openkai` | Start the TUI |
| `openkai chat --prompt "..."` | Single-turn chat (scriptable) |
| `openkai fuse --prompt "..."` | Architect + builder panel → synthesis |
| `openkai fuse --prompt "..." --gate` | With gate-first validation |
| `openkai sessions` | Browse/resume session trees |
| `openkai models` | Browse 814 models across 21 providers |
| `openkai info` | Self-check: mode, providers, state |
| `openkai upgrade` | Auto-update with rollback |

## Next steps

- [Fusion](fusion.md) — multi-model by default
- [Memory](memory.md) — Cortex-backed project memory
- [Tools](tools.md) — 14+ built-in tools
- [Providers](providers.md) — 21 providers, subscription lanes
- [Brand](brand.md) — Kaidera design system
