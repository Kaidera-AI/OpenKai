# Pi (pi-mono) + Oh My Pi (omp) — findings for OpenKai

**Date:** 2026-08-14
**Agent:** PiOmpResearch
**Scope:** (a) four local KOS research docs on the pi lane; (b) `badlogic/pi-mono` package inventory and extension surface; (c) how omp extends pi; (d) build-on-top options for OpenKai.

---

## 1. What it is

**pi-mono** (now resolved as `earendil-works/pi`; `github.com/badlogic/pi-mono` redirects) is Mario Zechner's TypeScript AI-agent toolkit monorepo: a unified multi-provider LLM API (`pi-ai`), an agent runtime (`pi-agent-core`), a differential-rendering terminal UI library (`pi-tui`), and an interactive coding-agent CLI (`pi-coding-agent`). Maturity: ~90.4k stars, 11.2k forks, very active; monorepo version 0.84.2 at time of writing; MIT licence.

**Oh My Pi (omp)** (`can1357/oh-my-pi`, omp.sh) is a hard **source fork** of pi-mono — not an extension package — re-published under the `@oh-my-pi` npm scope with ~80k lines of Rust N-API natives, Bazel build, subagents, LSP/DAP, browser, memory, and a Claude Code-compatible plugin marketplace. Maturity: ~24.8k stars, active; locally installed as omp 17.3.4 (compiled Mach-O binary via Homebrew tap `can1357/tap`); MIT licence. This session runs on omp.

**What KOS already knows (local docs, tight summary — no re-derivation):**

- `docs/design/research/pi-cli-interface.md` (2026-06-02, pi 0.78.0): there is no `pi exec`; the lane uses the root command `pi --provider openai-codex --model <m> --mode json -p --no-session [--no-tools | --tools read,grep,find,ls] [--thinking <level>] [--system-prompt <s>] "<prompt>"`. `--mode json` emits a JSONL event stream (session header → `agent_start`/`turn_start`/`message_*`/`tool_execution_*`/`turn_end`/`agent_end`); text deltas ride `message_update.assistantMessageEvent.text_delta`; usage on `turn_end` is `{input, output, cacheRead, cacheWrite, cost.total}`. `--mode rpc` exists for long-lived clients. Auth is subscription OAuth in `~/.pi/agent/auth.json`; `pi config` is interactive and unsafe for automation.
- `docs/design/research/stream-pi-gap.md`: console harness contract is `session|delta|result|error|done`; `pi` was then a graceful stub. A real `_stream_pi` must mirror the Codex lane skeleton: argv-list spawn (never shell), purpose-built env policy (scrub metered keys for subscription mode; inject only selected provider keys for API mode), structured parser with text fallback, timeout/kill/done-once robustness, no secrets in error paths.
- `docs/design/research/stream-pi-wiring-design.md` (wave-1 synthesis): `_build_pi_command` / `_pi_child_env` (strips `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `OPENAI_API_KEY`, `CODEX_API_KEY`, `ANTIGRAVITY_API_KEY`; adds `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0`) / `_parse_pi_frame` (session→session, text_delta→delta, thinking_delta→thinking, tool_execution_start→tool, turn_end+usage→result with `tokens_in=input+cacheRead`, `tokens_out=output`, `cost_usd=cost.total`). Routing `harness="pi"` → `_stream_pi` is implemented.
- `docs/design/research/retest-bob-pi.md`: pi harness + write tool confirmed working end-to-end with `gpt-5.3-codex-spark` (RETEST-PI/PI2 verified).

## 2. Architecture map

**pi-mono** (`packages/`, TypeScript, Node ≥ 22.19, ESM, Bun-compilable to standalone binaries via `scripts/build-binaries.sh`):

| Package (npm) | Role |
|---|---|
| `@earendil-works/pi-ai` (`packages/ai`) | Unified multi-provider LLM API; provider collections, auth resolution (API key + OAuth), token/cost tracking, context serialisation and cross-provider handoff. Ships per-provider subpath imports and a `pi-ai` CLI bin. |
| `@earendil-works/pi-agent-core` (`packages/agent`) | Stateful `Agent` loop: tool execution (parallel default, sequential opt-in), steering/follow-up queues, compaction hooks, event streaming. Includes a `harness/` subtree (session stores, compaction, prompt templates, skills loader, telemetry, tools `bash`/`edit-diff`). |
| `@earendil-works/pi-tui` (`packages/tui`) | Terminal UI library: differential rendering, CSI 2026 synchronised output, main/alt-screen renderers, overlays, components; native prebuilds for win32/darwin. |
| `@earendil-works/pi-coding-agent` (`packages/coding-agent`) | The `pi` CLI + SDK. Four modes: interactive TUI, print (`-p`), JSON (`--mode json`), RPC (`--mode rpc`); extension/skills/prompt-template/theme loaders; pi-package manager (`pi install/remove/update/list/config`). |
| `@earendil-works/pi-telemetry` (`packages/telemetry`) | Vendor-neutral telemetry contracts, reference adapter, conformance tests, typed schemas. |
| `@earendil-works/pi-protocol` (`packages/protocol`) | Transport-neutral CBOR protocol for remote pi sessions. |
| `@earendil-works/pi-client` (`packages/client`) | Transport-neutral client for remote pi sessions over framed CBOR (incl. `./unix` transport). |
| `@earendil-works/pi-server` (`packages/server`) | Experimental server package for pi. |
| `@earendil-works/pi-session-backend-sqlite-node` (`packages/session-backends/sqlite-node`) | SQLite session backend split out of agent-core so the core avoids native deps; accepts a runtime SQLite factory. |
| `@earendil-works/pi-evals` (`packages/evals`) | Private eval suite (vitest-evals); not published. |

Process model: single Node/Bun process; extensions load in-process via jiti (no isolation); RPC mode is a stdio protocol for foreign hosts; `pi-client`/`pi-server`/`pi-protocol` add a newer CBOR remote-session path.

**omp** (`can1357/oh-my-pi`): same monorepo skeleton forked — `packages/{ai, agent, coding-agent, tui}` plus omp-specific `catalog`, `natives` (N-API over six Rust crates: pi-shell, pi-natives, pi-ast, pi-iso, pi-voice, pi-walker, plus vendored brush-shell + 67 in-process CLI utilities), `mnemopi` (SQLite memory engine), `snapcompact`, `hashline` (line-anchored edit format), `browser-relay`, `collab-web`, `metaharness`, `stats`, `omptype` (ArkType-compatible validator), `utils`, `wire`. Distributed as compiled standalone binaries and `@oh-my-pi/pi-coding-agent` on npm. Four entry points: TUI, `omp -p`, `omp --mode rpc` (plus `--mode rpc-ui`), and `omp acp` (Agent Client Protocol for editors). Config/state under `~/.omp/agent/` (SQLite-backed: `agent.db`, `history.db`, `models.db` — observed locally).

## 3. Capability inventory

- **Multi-provider abstraction (pi-ai):** 30+ built-in providers (OpenAI, Azure, OpenAI Codex subscription OAuth, Anthropic, Google/Vertex, DeepSeek, Mistral, Groq, Cerebras, xAI, OpenRouter, Vercel AI Gateway, Bedrock, GitHub Copilot OAuth, Hugging Face, Kimi, MiniMax, Qwen, Xiaomi MiMo, llama.cpp router, any OpenAI-compatible endpoint …). A provider owns its model catalogue + auth + stream behaviour; a `Models` collection routes requests. Per-provider subpath imports (`@earendil-works/pi-ai/providers/anthropic`) keep bundles small; provider SDKs load lazily. Unified `stream`/`complete` with typed events (`text_delta`, `thinking_delta`, `toolcall_*`, `done`, `error`), unified `Usage` with `cacheRead`/`cacheWrite`/`cost.total`, cross-provider context handoff mid-session, context serialisation, custom providers via `createProvider()`, a faux provider for tests.
- **TUI tech (pi-tui):** genuinely reusable standalone library. Shared `TUI` interface with `TuiMainScreen` (preserves scrollback) and `TuiAltScreen` (app-owned viewport, `VStack`/`HStack` layout, `ScrollView` with mouse/wheel, OSC 133 prompt navigation, Ctrl+Shift+F search); differential rendering + CSI 2026 synchronised output; overlays with anchor/percentage/absolute positioning and focus management; `Focusable` IME cursor protocol; built-ins: Text, TruncatedText, Input, Editor, Markdown, Loader, SelectList, SettingsList, Spacer, Image (Kitty/iTerm2 inline images), Box, Container, VStack, HStack, ScrollView; bracketed paste; file/slash-command autocomplete.
- **Session/context management (pi-coding-agent):** JSONL session files, **tree structure** via `id`/`parentId` (v3 format) enabling in-place branching (`/tree`, `/fork`, `/clone`), compaction entries that now embed `retainedTail` (materialised post-compaction context for checkpoint rebuild), `custom`/`custom_message` entries for extension state, labels/bookmarks, auto-migration from v1/v2. Auto-compaction on overflow. Sessions under `~/.pi/agent/sessions/--<cwd>--/`.
- **Subagent/orchestration:** pi has **none by design** ("No sub-agents. Spawn pi instances via tmux, or build your own with extensions"). omp adds first-class subagents (`task` tool, isolated worktrees, schema-validated yields, Agent Hub UI), ten model **roles** (default/smol/slow/plan/commit/vision/designer/task/advisor/tiny), per-role fallback chains, path-scoped model sets, round-robin credentials.
- **Memory/vector/embeddings:** pi: none. omp: `mnemopi` SQLite memory engine + `retain`/`recall`/`reflect`/`memory_edit` tools + `learn`/`manage_skill`; `checkpoint`/`rewind` context tools. No vector store in either (KOS Cortex pgvector remains differentiated).
- **Packaging/distribution as an embeddable module:** pi publishes all core packages to npm with explicit `exports` maps; `pi-coding-agent` exports `.` (SDK: `createAgentSession`, `ModelRuntime`, `SessionManager`, `createAgentSessionRuntime`), `./rpc-entry`, `./client`. Standalone binary builds via `bun build --compile`. omp mirrors this under `@oh-my-pi/*` (SDK exposes `ModelRegistry`, `SessionManager`, `createAgentSession`, `discoverAuthStorage`) plus Homebrew/Nix/installer channels.
- **Extension/plugin mechanism:** see Delta findings (§4) — this is the key surface.

## 4. Delta findings (not in the KOS baseline)

1. **Repo identity moved.** pi-mono now resolves to `github.com/earendil-works/pi`; npm scope is `@earendil-works/*` (README badge and all package.json `repository` fields confirm). Version drift: local lane research targeted pi 0.78.0 (2026-06-02); upstream is 0.84.2 and the locally installed pi is 0.84.2. New flags since: `--thinking max`, `--exclude-tools`, `--no-builtin-tools`, `--session-dir`, `--tui-mode fullscreen`, `--approve/--no-approve` project-trust overrides.
2. **omp is a fork, not a pack.** The contract question "how does omp extend pi — skills? extensions?" resolves as: **none of the above — omp forked the pi-mono source tree** (README: "Fork of Pi by @mariozechner"). It re-exports renamed packages under `@oh-my-pi/*` and adds Rust natives + Bazel. Consequence: tracking upstream pi means merge-from-fork, not package upgrades. omp additionally *keeps and extends* pi's extension runtime, so omp is simultaneously a fork of pi and a host for pi-style extensions.
3. **pi extension API surface (upstream).** Default-export factory `(pi: ExtensionAPI)`, loaded via jiti from `~/.pi/agent/extensions/`, `.pi/extensions/`, `-e <path>`, or pi packages. Methods: `registerTool`, `registerCommand`, `registerShortcut`, `registerFlag`, `registerProvider` (async factories may fetch remote model lists before registration flush), `on(event)`, `appendEntry` (session persistence), `registerEntryRenderer`. Events include `project_trust`, `session_start`, `resources_discover`, `input`, `before_agent_start`, `tool_call` (can block), tool execution lifecycle. `ctx.ui`: `notify`, `confirm`, `select`, `input`, `setStatus`, `setWidget`, `custom()` full TUI components; extensions can replace the editor, add widgets above/below it, status lines, custom footers, overlays. Distribution: **pi packages** via npm/git (`pi install npm:@foo/pi-tools`, `pi install git:github.com/user/repo@v1`), declared by a `pi` key in package.json (`extensions`/`skills`/`prompts`/`themes`) or conventional dirs; installs land in `~/.pi/agent/{npm,git}/`; project trust gates project-local code.
4. **omp extension API is a strict superset worth copying.** Adds: `sendMessage`/`sendUserMessage` with `deliverAs: steer|followUp|nextTurn` + `triggerTurn`; `session_stop` hook that may `{continue, additionalContext}` or `{decision:"block"}` (capped at 8 continuations, never fires for subagent sessions); `before_provider_request` (may **replace the provider request payload**) and `after_provider_response`; `tool_call` may **revise tool input** (revalidated before scheduling/persistence/approval); `tool_result` middleware chain; `setActiveTools`/`getAllTools`; `ctx.models` facade (`list/current/resolve/family` — family tokens for cross-family reviewer selection); per-family `setServiceTier` (OpenAI flex/scale/priority, Anthropic priority, Google flex/priority); managed `ctx.setInterval/setTimeout` (raw timers that throw take down the whole session — extensions run in-process with no isolation); `mcp_notification` with bounded FIFO buffering; schema builders `pi.zod`/`pi.arktype`/`pi.typebox`.
5. **omp plugin/marketplace distribution is Claude Code-compatible.** Marketplaces are git repos/directories with `.omp-plugin/marketplace.json` (or `.claude-plugin/marketplace.json` fallback, same schema). Plugins install at user or project scope (`~/.omp/plugins/installed_plugins.json` vs `.omp/plugins/`), symlinked into a `node_modules` tree with `omp-plugins.lock.json`; npm-sourced marketplace plugins are parsed but rejected ("not yet supported"); `package.json` `omp.extensions` declares extension modules; `/reload-plugins` refreshes skills/commands/MCP; tools/hooks/extension modules need a session restart. omp also **auto-inherits** rules/skills/MCP servers from `.claude`, `.cursor`, `.windsurf`, `.gemini`, `.codex`, `.cline`, `.github/copilot`, `.vscode` on first run.
6. **pi RPC framing gotcha.** RPC mode is strict LF-delimited JSONL; Node `readline` splits on Unicode line separators inside JSON payloads and corrupts frames — clients must split on `\n` only. omp adds `--mode rpc-ui` (tool cards/selectors/dialogs as `extension_ui_request` frames the host must answer) and an ACP server (`omp acp`) mapping tools to editor routes (`fs/read_text_file`, `terminal/create`, `session/request_permission`).
7. **pi SDK layering for embedders.** `createAgentSession({sessionManager, modelRuntime, tools, model})` returns `{session}` with `prompt/steer/followUp/subscribe/setModel/compact/navigateTree/abort`; a `ResourceLoader` injects extensions/skills/templates/themes/context files; `createAgentSessionRuntime`/`AgentSessionRuntime` own session replacement (`newSession/switchSession/fork/importFromJsonl`) — this is the layer pi's own interactive/print/RPC modes are built on, i.e. a supported embedder surface, not internals.
8. **pi-agent-core loop mechanics.** Parallel tool execution by default (sequential per-tool opt-in; any sequential tool in a batch forces the batch sequential); `beforeToolCall` can block with `terminate: true`; `shouldStopAfterTurn` hook for graceful loop exit (used for compaction); `transformContext` → `convertToLlm` pipeline separates app messages from LLM messages; awaited subscribers (`agent_end`) count toward run settlement.
9. **Session format v3 specifics.** Compaction entries carry `retainedTail` (full rebuilt post-compaction context) so consumers need not walk pre-compaction history; `custom` entries persist extension state without entering LLM context; `custom_message` entries do enter context; version auto-migration on load. Session tree + retainedTail is a concrete, battle-tested answer to KOS's "trajectories pruned hourly unmined" problem.
10. **pi-ai bundling/engineering facts.** Tree-shakable per-provider factories; provider SDK chunks lazy-load on first request; static catalogue reads are synchronous last-known lists; auth resolves per provider with a credential store + programmatic OAuth (incl. CLI login flow); "only tool-calling models are included" policy; browser usage supported. Engine floor Node ≥ 22.19.
11. **pi's deliberate non-features** (philosophy): no MCP, no subagents, no permission popups, no plan mode, no built-in todos, no background bash ("use tmux") — all delegated to extensions. No built-in permission/sandbox system at all; containerisation doc offers Gondolin micro-VM extension, plain Docker, OpenShell. OpenKai must decide explicitly whether to inherit this minimalism or omp's batteries.
12. **omp TUI/runtime deltas relevant to "friendlier TUI":** time-travelling stream rules (regex aborts mid-token, injects rule as system reminder, retries from same point; survives compaction); `ask` tool structured option-picker cards (also surfaced over ACP); tool-call cards with edit previews; Agent Hub (`Alt+A`) for live subagent transcripts/steering/kill; TTSR; snapcompact bitmap-frame context compression. These are fork-code features — reusable as patterns, not as imports (omp packages are published but coupled to its natives).

## 5. Reuse verdict for OpenKai

| Item | Verdict | Licence constraint |
|---|---|---|
| `@earendil-works/pi-ai` | **Adopt as dependency** (option 2) — the cleanest multi-provider abstraction available; per-provider subpath imports; unified usage/cost; OAuth handled. KOS's per-provider Python auth juggling disappears. | MIT; Node ≥ 22.19 engine; pins exact deps upstream. |
| `@earendil-works/pi-tui` | **Adopt as dependency** if OpenKai's TUI is TS — standalone, no agent coupling, differential rendering + overlays + alt-screen layouts are exactly the "friendlier TUI" substrate. | MIT; native prebuilds (darwin/win32) ship in package. |
| `@earendil-works/pi-agent-core` | **Adapt pattern / optionally adopt** — the `Agent` loop, event taxonomy (`agent_start`→`tool_execution_*`→`agent_end`) maps 1:1 onto KOS's normalised event contract; adopting buys parallel tool execution + compaction hooks for free. | MIT. |
| `@earendil-works/pi-coding-agent` SDK (`createAgentSession`, `AgentSessionRuntime`) | **Adapt pattern; adopt only if OpenKai wants pi's session/resource semantics wholesale** — heavier (pulls CLI deps, jiti, theme assets), but it is a supported embedder layer. | MIT. |
| Session JSONL v3 tree + `retainedTail` compaction | **Adapt pattern** for Cortex trajectory persistence (replaces unmined hourly pruning with branchable, checkpointed trees). | MIT (design is documented). |
| pi/omp extension API (registerTool/events/ctx.ui) | **Adapt pattern** — OpenKai's own plugin API should mirror `sendMessage` deliverAs semantics, `session_stop` continue/block, and `tool_call` input revision; these are the mature parts. | MIT. |
| omp marketplace (Claude Code-compatible catalog, user/project scopes, lock files) | **Adapt pattern** for OpenKai distribution; do not depend on omp itself. | MIT. |
| omp fork code (natives, mnemopi, hashline, snapcompact) | **Ignore as dependency** (Rust/Bazel/native coupling, fork churn); mine as design reference. KOS already runs *on* omp — that is a runtime choice, not a build surface. | MIT. |
| pi-protocol/pi-client/pi-server (CBOR remote sessions) | **Ignore for now** — experimental; KOS's handoff-filed dispatch already covers the use case. | MIT. |

### Build-on-top option 1 — OpenKai as an omp extension/pack

**Feasibility: HIGH for features, LOW for product identity.** The omp ExtensionAPI genuinely supports custom tools, providers (`registerProvider`), commands, shortcuts, message renderers, full custom TUI components via `ctx.ui.custom()`, editor replacement, widgets, status lines and overlays; distribution exists via npm (`omp.extensions` in package.json), `omp plugin link`, and the marketplace. Fusion could be built today as `advisor`-style cross-family reviewer + `session_stop` gates using `ctx.models.family()` to pick contrasting models. **Limits:** the core chrome (transcript, footer, editor frame, keymap) remains omp's — "friendlier TUI than omp" is only achievable within overlay/widget/editor-replacement boundaries, not a redesign; extensions run **in-process with no isolation** (a throwing raw timer tears down the session — omp docs warn explicitly); you ride the fork's release cadence and its breaking-change surface (`pi.pi` package exports are exposed but version-locked). Licence: MIT — no constraint. Evidence: `docs/extensions.md`, `docs/marketplace.md`, `docs/extension-loading.md` in can1357/oh-my-pi.

### Build-on-top option 2 — pi-mono app importing pi-ai / pi-tui (± pi-agent-core, pi-coding-agent SDK) as libraries

**Feasibility: HIGH — the recommended surface for an installable OpenKai module.** All needed packages are published with explicit exports maps: `pi-ai` (`.` + `./providers/*` + `./api/*` + `./oauth`), `pi-tui` (single entry, component library), `pi-agent-core` (`Agent` loop), `pi-coding-agent` (`.` SDK with `createAgentSession`/`AgentSessionRuntime`, `./rpc-entry`, `./client`). OpenKai keeps its own TUI (built on pi-tui), its own orchestration/fusion layer (KOS's Python orchestrator talks to the TS side, or ports), its own session/memory backing (Cortex pgvector), and imports only the provider matrix + agent loop + renderer. Version pinning against upstream releases is normal npm practice; upstream pins direct deps exactly and publishes shrinkwrap, so supply-chain posture is good. Costs: Node ≥ 22.19/Bun runtime requirement for the module; extension-host semantics would need re-hosting if wanted (or skip). Licence: MIT — no constraint. Evidence: package.json exports maps, `docs/sdk.md`, `packages/ai/README.md` (provider factories, bundling/tree-shaking).

### Build-on-top option 3 — ponytail-thin wrapper (subprocess `--mode json` / `--mode rpc`)

**Feasibility: PROVEN but strategically wrong for OpenKai.** This is precisely what KOS already ships for the pi lane (argv contract in `pi-cli-interface.md`, env scrub + parser mapping in `stream-pi-wiring-design.md`, verified working in `retest-bob-pi.md`), and it remains the right answer for KOS-the-orchestrator driving foreign harnesses. RPC mode upgrades it to a long-lived protocol (strict LF-only framing — gotcha #6). But a wrapper inherits the host's TUI wholesale, cannot deliver OpenKai's friendlier-TUI goal, pays process-per-session overhead, and couples to CLI flag drift (0.78→0.84 already added/changed flags). Verdict: keep as a KOS lane; reject as the OpenKai build surface. Licence: MIT — no constraint. Evidence: local docs + `docs/rpc.md` upstream.

### Build-on-top option 4 — full custom harness + TUI

**Feasibility: HIGH effort, LOW marginal value.** Everything option 2 imports for free would be re-implemented: 30+ provider integrations with OAuth flows and cost tables, a differential renderer with synchronised output and IME handling, session tree/compaction machinery, extension runtime. MIT licensing makes copying legal, so "custom" would really mean "fork and freeze" — i.e. repeating omp's fork decision without its Rust-natives justification. Only sensible if OpenKai's TUI/interaction model diverges so far (e.g. non-terminal surfaces) that pi-tui stops being a substrate. Evidence: component/scope inventory in §2-3.

## 6. Citations

**Local (KOS repo):**
- `docs/design/research/pi-cli-interface.md`
- `docs/design/research/stream-pi-gap.md`
- `docs/design/research/stream-pi-wiring-design.md`
- `docs/design/research/retest-bob-pi.md`
- Local installs verified: `omp/17.3.4` at `/opt/homebrew/Cellar/omp/17.3.4/bin/omp` (Mach-O arm64, brew tap `can1357/tap`, MIT); `pi 0.84.2` at `~/.npm-global/bin/pi`; `~/.omp/agent/` contains `agent.db`, `history.db`, `models.db`, `config.yml`.

**pi-mono / earendil-works/pi (MIT):**
- Repo (redirect target, stars/files): https://github.com/badlogic/pi-mono → https://github.com/earendil-works/pi
- Packages listing: https://github.com/badlogic/pi-mono/tree/main/packages
- pi-ai README (providers, factories, handoffs): https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/ai/README.md
- pi-ai exports: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/ai/package.json
- pi-agent-core README (loop, events, hooks): https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/agent/README.md
- pi-tui README (renderers, overlays, components): https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/tui/README.md and package.json
- pi-coding-agent README (modes, extensions, pi packages, CLI): https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/README.md
- Extensions doc (ExtensionAPI, events, ctx.ui): https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/extensions.md
- SDK doc (`createAgentSession`, `AgentSessionRuntime`): https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/sdk.md
- Session format v3: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/docs/session-format.md
- pi-coding-agent exports: https://raw.githubusercontent.com/badlogic/pi-mono/main/packages/coding-agent/package.json
- pi-client/pi-protocol/pi-server descriptions: respective `packages/*/package.json` (URLs as above pattern); `packages/session-backends/sqlite-node`; `packages/evals` (private).

**omp / can1357/oh-my-pi (MIT):**
- Repo + README (fork statement, natives, roles, SDK exports, entry points): https://github.com/can1357/oh-my-pi
- Packages: https://github.com/can1357/oh-my-pi/tree/main/packages
- omp extensions doc: https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/extensions.md
- omp marketplace doc: https://raw.githubusercontent.com/can1357/oh-my-pi/main/docs/marketplace.md
- Docs index (extension-loading, custom-tools, porting-from-pi-mono, rpc, sdk, tui-*): https://github.com/can1357/oh-my-pi/tree/main/docs
- Homebrew formula (binary provenance, MIT): https://raw.githubusercontent.com/can1357/homebrew-tap/HEAD/Formula/omp.rb

Star counts and versions observed 2026-08-14; fork-addition LoC figures (~80k Rust) are upstream's own README claims [UNVERIFIED by independent count].
