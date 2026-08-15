# OpenKai

OpenKai is a standalone open-source agent harness and TUI. It combines the pi-lineage substrate (pi-ai, pi-tui, pi-agent-core) with Cortex durable memory to provide a professional-grade operator interface for LLM agents.

![Status: Alpha](https://img.shields.io/badge/status-alpha-orange)

## Core Capabilities

- **Durable Memory:** Integrated with Cortex for persistent project and team-wide memory, distinguishing it from ephemeral chat interfaces.
- **TUI-First Experience:** A high-density, alt-screen terminal interface for managing complex agent workflows.
- **Fusion Core:** A multi-role execution slice that pairs an Architect and a Builder to produce attributed, validated synthesis.
- **Session Persistence:** Local JSONL v3 session trees for branchable, resumable conversations.

## Quickstart

### Installation
*(NPM package name TBD at release)*

```bash
# Placeholder for installation command
npm install -g @openkai/cli
```

### Setup
Set your OpenRouter API key:
```bash
export OPENROUTER_API_KEY=your_key_here
```

### Common Commands
- **Launch TUI:** `openkai tui` (or just `openkai`)
- **Quick Chat:** `openkai chat --prompt "Your prompt here"`
- **Fused Run:** `openkai fuse --prompt "Complex task here"`
- **Live Events:** `openkai events --print`
- **Manage Sessions:** `openkai sessions`

## Documentation
Detailed guides are available in the `/docs` directory:
- [Quickstart](docs/quickstart.md)
- [Commands Reference](docs/commands.md)
- [Session Management](docs/sessions.md)
- [Fusion Core](docs/fusion.md)
- [Operational Modes](docs/modes.md)
