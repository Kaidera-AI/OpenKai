# Changelog

All notable changes to OpenKai are documented here. The project adheres to [Semantic Versioning](https://semver.org/); the release tag style is `v0.01.001` (npm-normalised as `0.1.1`).

## [0.1.1] — v0.01.001 (first public release)

### Harness
- Single-lane agent loop on `pi-agent-core` (0.84.2 pinned) with pi-ai's 30+ provider substrate; `openkai chat` print mode and `openkai`/`openkai tui` alt-screen TUI share one `SessionTransport` (field-addressed deltas, `openkai.session.v1`).
- Providers: `--provider` across chat/tui/fuse — OpenRouter aggregator plus direct anthropic, openai, google, deepseek, kimi-coding, moonshotai, qwen-token-plan, xai, mistral, groq, cerebras, together, fireworks, nvidia, minimax, zai, vercel-ai-gateway; OAuth subscription lanes for openai-codex and github-copilot. `.env` autoload with env-wins semantics.
- Session persistence: pi JSONL v3 branchable session trees under `.openkai/sessions/`; idempotent Cortex checkpoints (`/sessions/ingest`) and lifecycle events when KOS-managed; standalone-local mode needs nothing.

### TUI
- pi-tui shell: transcript (markdown), composer, status chrome (mode/model/session/tokens/persist mode), slash commands, command palette with fuzzy filter, prompt stash + frecency history, `/btw` side channel, `/undo`, focus-aware attention notifications, per-agent identity pills.
- Permission engine (protocol v2 approval channel): allow/ask/deny, last-match-wins rules, terminal deny floor, inline diff previews, once/always/reject; gated `write_file`/`edit_file`/`bash`. Remote approval injection refused by construction (respond() is in-process only).
- Shadow-git undo: full-tree snapshots before every approved mutation; `openkai undo` restores.
- Droid design discipline: theme-token-only colours, one interaction grammar, clean-by-default density, brand splash exactly once.

### Fusion
- `openkai fuse`: FU-1 role-split panel (architect + builder, separate fresh sessions, parallel), FU-2 attributed synthesis (unattributed merges hard-error), FU-3 gate-first validation (validator-designed executable checks, baseline-must-fail-RED, verbatim feedback, repair-once, loud halt).
- `openkai fusion report|advise`: FU-5 per-pair telemetry rollups; FU-4 deterministic invocation policy (no model calls on the dispatch path); Beta-bandit routing with per-complexity posteriors.

### Security
- E001 gate: per-increment `scripts/security-audit.sh` + white-box review protocol. Canonical realpath containment (symlink-escape fix), case-insensitive + NFC-normalised deny floor, floor enforcement at the tool layer for read-only tools, recursive-grep re-guarding.

### Packaging
- MIT licence; npm packages `@openkai/core` + `@openkai/cli`; standalone per-platform binaries via `bun build --compile`; dual-channel auto-upgrade with rollback and kill-switch; `openkai info` self-check.
