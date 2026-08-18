# Changelog

All notable changes to OpenKai are documented here. The project adheres to [Semantic Versioning](https://semver.org/); the release tag style is `v0.01.001` (npm-normalised as `0.1.1`).

## [0.1.5] — v0.1.005 (the harness release: omp functionality, droid feel, Kaidera brand)

Twenty-plus increments (E002–E011) fold the best of omp (functionality) and
droid (look & feel) onto the Kaidera brand mark, per the CTO formula. The
CLI and core bump to 0.1.5 in lockstep.

### Brand & boot
- **Kaidera hex-node mark** (ren): 15-line circuit hexagon for the splash,
  sharp 8-line compact variant for the boot card; gradient engine lifted from
  omp (5-stop truecolour diagonal gradient + shine traversals, 256-colour
  fallback). Splash plays on **every** launch (any key skips; `openkai splash`
  replays). Boot card: hex + wordmark + capability row + daily tip.
- **Theme auto-detection** (OSC 11 query, COLORFGBG fallback, 150ms budget);
  config `theme: auto|dark|light|<pack>`.

### TUI / settings
- **`/settings` vs `/setup` split**: six-tab config panel (appearance /
  providers / model / interaction / memory / features) with status-line
  presets; `/setup` opens onboarding (provider sign-in). `/welcome` removed.
- **In-TUI sign-in**: OAuth device-flow overlay (Claude Pro/Max, Codex, Kimi,
  Copilot) + key-entry overlay writing `~/.openkai/.env` (0600). No hand-editing.
- **Two-sided status line** (omp footer layout): brand glyph + agent +
  provider + `git:<branch>` + persist + session + state + `plan` + `ctx:%`
  left, tokens + model right; presets default/minimal/compact/full.
- **Opaque overlays** (no transcript bleed), `/model` five-level picker
  (provider→model→effort→partner-provider→partner-model) with ctx+cost
  columns, `/models` fullscreen hub (recent/all/per-provider scopes).
- **`/autonomy` picker**, **`/plan`** (Cline Plan/Act: read-only at the gate),
  **`/goal`** lifecycle, **`.`** keep-going, **Ctrl+R** history search.

### Context & memory
- **`/compact` `/shake` `/clear` `/context` `/stats`** operate on the real
  conversation via `transport.getMessages/setMessages/getContextWindow`.
- **Auto-compact** (OpenCode): elide the middle at 80% context (feature-gated).
- **`/memory`**: shared multi-agent, multi-instance project memory
  (`.openkai/memory/`), surfaced on boot; **`/init`** generates AGENTS.md.

### Tools (6 → 12+)
- `glob`, `web_fetch`, `todo`, **`hashline_edit`** (line-anchored structured
  edits with content-hash staleness validation), **`task`** (read-only
  subagent), **`lsp`** (symbol-aware code intelligence), **MCP** proxy
  (`~/.openkai/mcp.json`, JSON-RPC over stdio).

### Hub & connectors
- **`openkai serve`**: loopback-only HTTP hub (refuses non-loopback hosts and
  starts only with `OPENKAI_HUB_TOKEN`); `POST /prompt` bearer-gated, read
  endpoints token-free on loopback. **`openkai bridge`**: pipe-line chat
  connector relaying into the hub.

### Security posture (ahead of the K3 adversarial pass)
- Verified invariants: cwd containment, `.env`/`.ssh` deny floor on read AND
  write, hashline stale-tag refusal, `bash` never auto-allowed, hub read-only
  by construction. 225/225 green.

### Packaging
- npm: `@kaidera/openkai@0.1.5` + `@kaidera/openkai-core@0.1.5` (dist-tag
  `latest`), release tag `v0.1.005`. Standalone binaries rebuilt.

## [0.1.4] — Inc 09 parity pack (TUI liveness + activity feed)

Publishes the unpublished Inc 09 delta that main carried under the stale 0.1.3
version string, and re-syncs all three channels (npm, standalone binaries,
Homebrew tap) so the UAT plan is executable end-to-end. The CLI and core are
bumped to 0.1.4 **in lockstep** (the CLI pins `@kaidera/openkai-core@0.1.4`) so
an install resolves the matching core at publish time — the exact skew that made
0.1.1 and 0.1.3 invisible is closed.

### TUI / Inc 09
- **Slash autocomplete** on `/`, a provider→model picker (`/model`), effort cycle (`/effort`), and fast mode (`/fast`).
- **TUI liveness + activity feed**: animated busy chip (braille frame + current action + elapsed seconds, awaiting/attention priority preserved), provider chip in the chrome, an `onActivity` sink in the transport, a `.openkai/activity.jsonl` feed, and the `openkai tail [-f]` command to watch the machine think from a second terminal.
- **`openkai update`** alias for upgrade: Homebrew-managed installs refuse self-upgrade (Homebrew owns the Cellar) with `brew upgrade` guidance; npm guidance uses the scoped name.

### Packaging
- npm: `@kaidera/openkai@0.1.4` + `@kaidera/openkai-core@0.1.4` (dist-tag `latest`).
- Standalone binaries rebuilt from the certified main tip and attached to `v0.01.004` (darwin-arm64/x64, linux-arm64/x64).
- Homebrew tap `Formula/openkai.rb` repointed to `v0.01.004` with recomputed sha256 values.

### Security baseline
- Security-critical sources (`packages/core/src/fusion/{fuse,gate,synthesis}.ts`) are logic-identical to the E001-certified line (only trailing-newline whitespace differs); `scripts/security-audit.sh` PASSED; 110/110 green.

### Known gaps
- F10 (LOW): `list_files` on a `.ssh` *directory* node still lists filenames (contents remain denied).

## [0.1.3] — TUI stability fix

- Fixes the TUI exit-after-first-turn regression (the session stream no longer closes on `agent_end`; chat exits explicitly on `session_end`; drain helpers break on `session_end`).
- Bare-launch flags: `openkai --provider X` launches the TUI directly.

## [0.1.2] — security patch

**0.1.1 shipped without the certified E001 security fixes and should not be used.** The fix-line was certified on a branch that had diverged from the release line, so the published tarballs were built without it. Upgrade with `npm install -g @kaidera/openkai@0.1.2`.

### Security
- **F4 (HIGH) — deny-floor escape.** A protected name used as a *directory* component (`.env/production`, `server.pem/privkey`) bypassed the permission deny floor and was allowed. `matchesDenyFloor` now tests every ancestor prefix of the path, not just the final segment.
- **F7 / F7b (HIGH) — secret leakage in persistence.** Sessions stored provider keys and secret-shaped values verbatim in world-readable files, and the Cortex `/sessions/ingest` leg was unredacted. Redaction now happens at the write seam and the wire seam via the shared `secrets` module (by NAME and by secret-shaped VALUE), and session files are created `0700`/`0600`.
- **F6b / F6c (HIGH) — spoofable consent surface.** The permission overlay and transcript tool cards rendered model-supplied terminal escapes (OSC 52 clipboard writes, CSI screen clears) verbatim, letting a model forge or erase the approval prompt. Every model-influenced field — tool name, command, diff path, diff body, rule/reason, and tool arg **keys** as well as values — is sanitised and newline-flattened at the render boundary.
- **F5 / F5b (MED) — content/existence oracle.** `edit_file` read its target before the permission gate ran, leaking the content and existence of floor-protected and out-of-cwd files. `guardPath` now precedes any read.
- **F9 (MED) — fusion gate fail-open.** A designed gate with no consent channel executed model-authored shell with the parent environment inherited. Absent consent is now a refusal, and approved checks run with a scrubbed child environment.

Each fix ships with an executable reproducer; the suite is 110/110 green, and reverting the fix sources and rebuilding fails exactly the nine security reproducers.

### Known gaps
- F10 (LOW): `list_files` on a `.ssh` *directory* node still lists filenames (contents remain denied).
- The standalone binary channel (`scripts/install.sh`, Homebrew tap) still points at the `v0.01.001` release assets, which were built from the vulnerable line. Use the npm channel until those assets are rebuilt.

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
