# Providers

OpenKai connects to **21 providers** — direct APIs, subscription lanes, and
aggregators. One flag, one model list, one env file.

## Provider list

| Provider | Type | Env var | Notes |
|---|---|---|---|
| **OpenRouter** | Aggregator | `OPENROUTER_API_KEY` | 300+ models, one endpoint |
| **Anthropic** | Direct | `ANTHROPIC_API_KEY` | Claude Pro/Max OAuth also available |
| **OpenAI** | Direct | `OPENAI_API_KEY` | GPT-4o, GPT-4o-mini, o1 |
| **OpenAI Codex** | Subscription | (OAuth) | Codex CLI subscription |
| **Google** | Direct | `GEMINI_API_KEY` | Gemini 2.5 Pro/Flash |
| **GitHub Copilot** | Subscription | (OAuth) | Copilot Pro/Enterprise |
| **DeepSeek** | Direct | `DEEPSEEK_API_KEY` | DeepSeek V3, R1 |
| **Kimi Code** | Subscription | `KIMI_API_KEY` | Kimi K2 subscription |
| **Moonshot AI** | Direct | `MOONSHOT_API_KEY` | Kimi K2 direct |
| **Alibaba Qwen** | Subscription | `QWEN_TOKEN_PLAN_API_KEY` | Qwen 3.8+ coding plan |
| **xAI** | Direct | `XAI_API_KEY` | Grok 4, Grok 4 Fast |
| **Mistral** | Direct | `MISTRAL_API_KEY` | Mistral Large, Codestral |
| **Groq** | Direct | `GROQ_API_KEY` | Ultra-fast inference |
| **Cerebras** | Direct | `CEREBRAS_API_KEY` | Wafer-scale inference |
| **Together** | Direct | `TOGETHER_API_KEY` | Open-source models |
| **Fireworks** | Direct | `FIREWORKS_API_KEY` | Fast open-source models |
| **NVIDIA** | Direct | `NVIDIA_API_KEY` | Nemotron, NIM |
| **MiniMax** | Direct | `MINIMAX_API_KEY` | MiniMax-01 |
| **Z.ai** | Direct | `ZAI_API_KEY` | Z.ai models |
| **Vercel AI Gateway** | Aggregator | `AI_GATEWAY_API_KEY` | Multi-provider gateway |
| **Kaidera Manifold** | Aggregator | `KAIDERA_MANIFOLD_API_KEY` | Kaidera platform `/v1` edge |

## Configuration

### `~/.openkai/.env`

```bash
# Aggregators (recommended — covers 300+ models)
OPENROUTER_API_KEY=sk-or-...
KAIDERA_MANIFOLD_API_KEY=km-...
KAIDERA_MANIFOLD_BASE_URL=https://api.kaidera.ai/v1
KAIDERA_MANIFOLD_PROJECT_ID=your-project-uuid

# Direct providers
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
DEEPSEEK_API_KEY=...
XAI_API_KEY=...
GROQ_API_KEY=...
```

### `~/.openkai/config.json`

```json
{
  "provider": "openrouter",
  "model": "google/gemini-2.5-flash-lite",
  "fusion": {
    "pair": "anthropic/claude-3.5-sonnet+openai/gpt-4o"
  }
}
```

## Commands

```bash
# List configured providers
openkai info

# Check provider status
openkai info --providers

# Set default provider
openkai config set provider anthropic

# Set default model
openkai config set model claude-3.5-sonnet

# Browse all models
openkai models

# Models for a specific provider
openkai models --provider openai
```

## Subscription lanes (OAuth)

Some providers use subscription OAuth instead of raw API keys:

| Provider | Auth method | Env var |
|---|---|---|
| Anthropic | Device flow OAuth | `ANTHROPIC_OAUTH_TOKEN` |
| OpenAI Codex | Device flow OAuth | (none — subscription) |
| GitHub Copilot | Device flow OAuth | (none — subscription) |
| Kimi Code | API key + OAuth | `KIMI_API_KEY` |

OAuth flows run in the TUI: `openkai login --provider anthropic` opens a
browser, you approve, and the token is stored in `~/.openkai/.env` (mode
600).

## Model selection

### Default model

The default model is the first in the provider's catalogue that supports
tool calling and streaming. Override with `--model`:

```bash
openkai --model openai/gpt-4o --prompt "hello"
openkai --model anthropic/claude-3.5-sonnet --prompt "hello"
```

### Fusion pair

For fusion runs, the pair is selected by the bandit (see
[Fusion](fusion.md)) or explicit:

```bash
openkai fuse --prompt "design the API" \
  --architect-model anthropic/claude-3.5-sonnet \
  --builder-model openai/gpt-4o
```

### Smol / Slow / Plan roles

Three model roles for different workloads:

| Role | Default | Use |
|---|---|---|
| **Smol** | `gemini-2.5-flash-lite` | Fast, cheap, lightweight tasks |
| **Slow** | `claude-3.5-sonnet` | Thorough analysis, reasoning |
| **Plan** | `claude-3.5-sonnet` | Architecture planning, strategy |

Override: `--smol <model>`, `--slow <model>`, `--plan <model>`.

## Kaidera Manifold

Manifold is Kaidera's own OpenAI-compatible `/v1` aggregator edge. It
provides:

- Access to Kaidera platform models
- Unified billing and metering
- Project-scoped inference

Config:

```bash
KAIDERA_MANIFOLD_API_KEY=km-...
KAIDERA_MANIFOLD_BASE_URL=https://api.kaidera.ai/v1
KAIDERA_MANIFOLD_PROJECT_ID=your-project-uuid
```

The `X-Project-Id` header is sent with every request. Manifold is the
default provider in KOS open-source edition.
