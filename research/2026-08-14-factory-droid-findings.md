# Factory Droid — research findings for OpenKai

Date: 2026-08-14 (verified against sources on 2026-08-15). Target of CTO ask: "some patterns we can learn from factory and their droid harness which is very clean and well structured" and "the droid TUI is best from a design point of view — not just the harness, the TUI".

**Sources and evidence grades.** Droid itself is **closed-source** (npm package `droid` is `UNLICENSED`; no source repo). However, three primary evidence classes exist and were all mined:

1. **Factory's own docs** (`docs.factory.ai`, Mintlify, every page available as raw Markdown) — VERIFIED doc facts.
2. **Public GitHub org** `github.com/Factory-AI` — SDKs (Apache 2.0), plugins marketplace, GitHub Action, a TUI e2e test framework fork, and a docs/issues repo. Code beats docs where they disagree.
3. **The shipped binary itself** — `droid` v0.197.0 darwin/arm64 (120 MB) downloaded from Factory's CDN with SHA256 verification and analysed via string/dependency fingerprinting. This is primary, locally verified evidence; binary-derived claims are marked **[BIN]**.

Visual/layout claims not confirmable from docs or binary are marked **[INFERENCE from secondary]** and cited to the secondary source.

---

## 1. What it is

Droid is the agent of Factory, "the agent-native software development platform" (https://factory.ai, https://docs.factory.ai/welcome/index.md). The **Droid CLI** is a terminal client exposing the same Factory runtime through "an interactive terminal UI with project context, approvals, MCP tools, Missions, and headless execution" (https://docs.factory.ai/droid-cli/overview.md). It runs in two modes: **interactive (`droid`)** — a chat-first REPL with slash commands — and **non-interactive (`droid exec`)** for automation (https://docs.factory.ai/droid-cli/cli-reference.md).

**Distribution (VERIFIED):** four install channels, all first-class: curl installer (`curl -fsSL https://app.factory.ai/cli | sh`), Homebrew cask (`brew install --cask droid`), Windows PowerShell (`irm https://app.factory.ai/cli/windows | iex`), and npm (`npm install -g droid`) (https://docs.factory.ai/droid-cli/cli-reference.md). The npm package `droid` (https://registry.npmjs.org/droid) is a 5-file, ~26 KB installer shim with a `postinstall` (`node install.js`) that fetches a per-platform binary from `https://downloads.factory.ai/factory-cli/releases/<version>/<platform>/<arch>/<binary>` with published `.sha256` checksums (npm registry metadata; CLI reference "Direct binary download" section). Platforms: linux/darwin/windows × x64/arm64/x64-baseline. [BIN] The binary itself is a **Bun v1.3.14 compiled single-file executable** (`bun build --compile`; `/$bunfs/` embedded filesystem and Bun version strings present).

**Maturity signals (VERIFIED):** 182 published npm versions, `latest` = 0.197.0 shipped 2026-08-15 with releases **roughly daily** through August 2026 (npm registry `time` field; https://docs.factory.ai/changelog/release-notes.md — changelog v0.197.0 dated 2026-08-15). Public changelog runs to ~3,900 lines covering CLI, app and platform with named bug fixes (https://docs.factory.ai/changelog/release-notes.md). npm search shows a companion `@factory/droid-sdk` package at 0.7.0 published by GitHub Actions OIDC trusted publisher (https://registry.npmjs.org/-/v1/search?text=factory+droid). Benchmark posture: Factory claims Droid is "top performing in terminal benchmarks" (https://github.com/Factory-AI/factory README) and publishes a `terminal-bench-leaderboard` repo (https://github.com/Factory-AI/terminal-bench-leaderboard).

---

## 2. TUI design analysis (PRIORITY)

This is the load-bearing section. Droid's TUI advantage is **not** an exotic rendering stack — [BIN] it is **Ink** (React-for-CLI: `node_modules/ink` ×79, `react-reconciler`, `yoga-layout` in the binary) with **jotai** for state and **react-i18next** for localisation — the same boring stack everyone else has. The advantage is *design discipline*: a coherent token system, consistent interaction grammar, restrained defaults, and a year of visible polish iterations in the changelog. Itemised:

### 2.1 Layout and chrome

- **Welcome / first screen.** Full-screen terminal interface; Factory's docs preview caption: "Droid CLI starts in your terminal with modes, autonomy, MCP status, and prompt composer visible" (https://docs.factory.ai/droid-cli/quickstart.md). First run prompts browser sign-in (quickstart). [BIN] The header tagline is a Zork homage — *"You are standing in an open terminal. An AI awaits your commands."* — localised into at least Italian, Japanese, Korean and Chinese. The droid logo is animated ASCII art on startup with a `logoAnimation` setting (`once` / `always` / `off`, default `once`) (https://docs.factory.ai/droid-cli/settings.md). Delight is front-loaded but exactly-once by default.
- **Header.** Shows live session facts (model, autonomy, skills count — changelog v0.171 "The header now shows an accurate skills count") and **follows tool execution as it happens** (v0.182 fix: "The header now follows tool execution as it happens instead of lagging behind the agent") (https://docs.factory.ai/changelog/release-notes.md). Header was deliberately redesigned "with an updated layout for improved readability" (v0.144-ish entry "Header redesign").
- **Footer.** "Redesigned CLI footer with a cleaner layout" (v0.92, 2026-04-02); hosts mode/autonomy state and a **custom status line** (`statusLine: { command, padding, maxRows }` — user command stdout rendered above the input; configured via `/statusline`; failures name the problem and point to `/statusline` instead of leaving a blank row, v0.189) (https://docs.factory.ai/droid-cli/settings.md; changelog). Optional live token-usage indicator at the bottom of the input (`showTokenUsageIndicator`).
- **Changelog in-product.** Release notes display inside the TUI, toggle with `Ctrl+J` (dismiss/restore); auto-hides after first view (v0.89) (https://docs.factory.ai/droid-cli/cli-reference.md; changelog). The product teaches its own evolution in place.
- **Help as a pane, not a wall.** `?` on empty input (or `Ctrl+/` anytime) opens a scrollable keyboard-shortcuts pane; redesigned "so shortcuts are easier to scan" (v0.180) (CLI reference; changelog).

### 2.2 Transcript rendering (streaming, tool calls, diffs)

- **Markdown discipline.** Inline Markdown rendered including inside table cells; inline/display TeX converted to **Unicode math** for terminal output (https://docs.factory.ai/droid-cli/cli-reference.md). [BIN] Code blocks render as a column with a **left border in the theme's muted border colour, padding-left 2** — a consistent "quoted block" affordance (`borderLeft: true, borderColor: text.muted, paddingLeft: 2` in the bundled JSX).
- **Mermaid → ASCII inline.** Fenced `mermaid` blocks render as ASCII art in the terminal with no external viewer; supported: flowchart/graph, sequence, state, class, ER diagrams; unsupported types fall back to raw source + an external link (CLI reference). Implemented with the `beautiful-mermaid` package [BIN] and rendered with **per-element colours that match the current theme** (changelog, "Themed mermaid diagram colors").
- **Charts in the terminal.** "Charts and graphs now render directly in the terminal" (v0.92).
- **Tool call rendering.** Tool call headers carry a **shimmer animation** while running ("Shimmer animation for tool headers", v0.87; later fix for "stale shimmer" left behind, v0.117-ish); spinner banners reflect the true state of the current turn (changelog "Accurate status banners"); spinner animation itself was redesigned "for a refreshed look" (v0.133-ish "CLI spinner redesign"). Tool results have a user-settable `toolResultDisplay: expanded | compact` (settings). Long Execute-tool preview lines are truncated to terminal width (v0.118-ish). Grep/Glob calls display "with the same clean formatting as Read tool calls" (v0.89) — i.e. one visual language for all tool rows.
- **Diffs.** Two render modes: `diffMode: github` (side-by-side, higher fidelity, default and "recommended") or `unified` (single column) (https://docs.factory.ai/droid-cli/settings.md). Inline file diffs show added/removed line counts (v0.187 fix).
- **Performance as a design feature.** "Cached static transcript markdown rendering for faster scrolling" (v0.115); "Large session transcripts now render faster by trimming at the cutoff before derivation" (v0.108-ish); parallel-tool rendering fixed (v0.92); transcript repaints correctly after viewing plan details (v0.166-ish). Long transcripts are the norm for agentic sessions; droid visibly engineered for it.
- **Verbose-vs-clean split.** `Ctrl+O` toggles a detailed transcript view (full message details); the default view hides verbose bodies "for easier reading" (v0.155 "Cleaner Ctrl+O transcripts"). Clean-by-default, detail-on-demand — a core droid design rule.

### 2.3 Approvals, permissions and in-flight control

- **Approval menu semantics.** [BIN] Permission prompts are menu lists with `proceed_once` / `proceed_always` options ("Yes" / "Yes, allow all" / a "remember" label), and the selected row uses either a normal `highlight` colour or a **`highlightDanger` colour for risky options** — danger is encoded in the highlight, not just the label. `Alt+E` toggles an approval-details view (CLI reference keyboard table).
- **"Allow always" raises autonomy.** Choosing an always-allow option *raises the session's Autonomy Level to the level the prompt required* rather than remembering one pattern; sandbox allow-always persists the allowed path/domain instead (https://docs.factory.ai/autonomy-and-safety/auto-run.md). One mental model ("how much rope") instead of an accreting rule list.
- **Orthogonal axes.** Interaction mode (Normal / Spec / Mission) × Autonomy Level (Off / Low / Medium / High) are independent dimensions (https://docs.factory.ai/autonomy-and-safety/specification-mode.md). `Shift+Tab` toggles Normal↔Spec; `Ctrl+L` cycles autonomy; the composer shows a **fixed-width autonomy chip** so cycling doesn't reflow the layout (v0.179 fix "The autonomy chip in the composer now keeps a fixed width").
- **Spec mode has its own colour identity.** Messages sent in spec mode keep a distinct spec colour across repaints and resumes (v0.185 fix) — modes have visual identity, not just behavioural identity.
- **Interrupt etiquette.** `Ctrl+C` cancels the agent, twice quickly exits; double-`Esc` clears the input draft, a third `Esc` opens the **rewind menu** (CLI reference). Rewind is discoverable from the key you already mash.
- **Multi-select questions.** Agent-asked questions can accept multiple answers ("pick several options at once", v0.183).

### 2.4 Session navigation and history

- **`/sessions` as a file manager.** List view with `Ctrl+F` fork-tree for the highlighted session, `Ctrl+R` rename, `Ctrl+X` archive (CLI reference). `/tree` browses and resumes branches of the current session's fork tree. `/favorite` pins sessions. Sessions persist with full tool calls/transcripts and can be forked, resumed days later (https://factory.ai/product/cli).
- **Non-blocking fork.** `/fork` copies the session **in the background, keeps you in the original**, and prints a `droid --resume <id>` receipt you can paste elsewhere (v0.196; CLI reference slash-command notes).
- **Full-text session search from the shell.** `droid search "query"` (alias `droid find`) searches messages, documents and tool results across local sessions with a **local index** (`--reindex` rebuilds), kind filters, hit limits, context-window chars, and `--json` output (CLI reference). [BIN] `bun:sqlite` is embedded — consistent with a SQLite-backed local search index.
- **Side channel.** `/btw <question>` asks a side question "without polluting the main transcript", with `Ctrl+Y` toggling its scroll view (CLI reference; v0.106). Answers the "quick clarification while a plan runs" need without forking.
- **Slash commands while the agent runs.** Read-only/settings commands open over the live stream immediately; mutating ones (`/new`, `/clear`, `/compress`) confirm first; `/model` and `/fast` apply between turns (v0.181; CLI reference).

### 2.5 Input ergonomics

- `!` on empty input toggles **bash mode** — commands run directly in the shell; the prompt glyph changes `>` → `$` while active; `Esc` returns (CLI reference). One keystroke to drop from AI to shell, visible state change.
- `@` triggers fuzzy file-path autocomplete; `Ctrl+V` pastes clipboard images; `Tab` cycles the current model's reasoning-effort levels; `Ctrl+N` cycles models; `Shift+Enter` newline (with `/terminal-setup` to teach your terminal); external editor for long prompts (v0.157 "Edit prompts externally") (CLI reference; changelog).
- Drafts survive: double-Esc clears, input history on Up/Down; cursor position kept across terminal resizes (changelog "Chat cursor on resize").

### 2.6 Colour, typography, theming discipline

- **Token system, not ad-hoc ANSI.** [BIN] The binary embeds Factory's internal UI design directive: "use the core-ui dark design tokens (surface-1/2/3, border-1, text-default/label/subheading, text-highlight), square cards with collapsed borders, uppercase subtitle labels, compact metric cards, muted explanatory copy, and straight 1px divider/border lines instead of rounded gradient cards." The TUI theme object mirrors this (`text.muted`, `text.info`, `colors.code/italic/bold/strikethrough`, `primary`, `warning`, `highlight`/`highlightDanger`). Changelog evidence of enforcement: "migrated hardcoded colors to the theme system" (v0.96-ish), "Theme-aware menu colors — selection colors in slash command menus adapt to the current theme" (v0.97-ish), "Diff colors by theme" (v0.188).
- **Adaptive by default.** "The CLI now auto-detects your terminal background and picks a matching theme" (v0.135), including theme detection over SSH (v0.169-ish fix); `overrideTerminalColors` forces droid's palette over the terminal's; `nerdFont` gates glyph use; multiple light-theme readability passes (v0.90.1, v0.146, v0.156.2). `/themes` picks a theme by ID; shiki `github-light`/`github-dark` embedded for syntax highlighting [BIN].
- **i18n is real.** `/language <locale>` switches TUI display language; [BIN] full i18next catalogues embedded (en/it/ja/ko/zh observed) with plural-aware strings. Nobody else in the field localises the TUI.
- **Consistent interaction grammar.** [BIN] Every menu carries the same footer help line: `↑/↓ Navigate · Enter Select · 1-N Quick select · ESC Cancel` — one grammar, all surfaces, localised.
- **Sound as an attention channel.** Distinct default cues for completion (`fx-ok01`, "soft success bloop") vs awaiting-input (`fx-ack01`, "tactile ripple feedback"), per-event focus modes (`always/focused/unfocused`), optional subagent lifecycle sounds, custom file paths (https://docs.factory.ai/droid-cli/settings.md).

### 2.7 Onboarding and empty states

- First run: welcome screen → browser sign-in → "map the codebase before it edits anything" → one small reviewable change with propose-plan → show-diff → wait-for-approval loop (https://docs.factory.ai/droid-cli/quickstart.md). The quickstart *teaches the approval loop as the product*.
- [INFERENCE from secondary] Third-party hands-on review: "Droid CLI provides a concise and clean TUI… intuitive layout that's easy to navigate. The status bar at the bottom of the screen is particularly useful — better than other tools I've used" (https://surfing.salty.vip/articles/en/quick_review_on_droid_cli_after_free_trial/ — currently 404, quoted via search index). Developers Digest's 2026 review covers multi-model routing and headless CI but its TUI description is generic (https://www.developersdigest.tech/blog/factory-droid-review-setup-2026).
- Diagnostics surface configuration problems instead of failing silently: `/diagnostics` "Show settings configuration errors" with `{{count}} issue(s)` header and "No diagnostics failures found." empty state [BIN]; settings files are JSONC-parsed with `line X, col Y` error reporting [BIN].

### 2.8 Why it reads as "cleaner" than omp/opencode — synthesis

[INFERENCE — editorial synthesis of the verified facts above]:

1. **One visual grammar for everything**: tool rows, menus, approvals, diffs, mermaid, charts all draw from the same token palette and the same menu grammar. opencode's TUI is feature-rich but grew component-by-component; droid reads as one design system applied uniformly (changelog shows repeated "migrate hardcoded colors to the theme system" enforcement passes).
2. **Restraint by default, density on demand**: clean transcript default, `Ctrl+O` for verbose; logo animates once; changelog auto-hides; spinner reflects true state; fixed-width chips prevent layout jitter. The bar is "no pixel moves unless it means something".
3. **State you can see**: mode, autonomy, model, reasoning effort, MCP status, token usage are persistently visible in chrome, each with a single-key cycle (`Shift+Tab`/`Ctrl+L`/`Ctrl+N`/`Tab`). No hidden modal state.
4. **Keyboard-first with discoverability**: every overlay teaches its keys in a consistent footer line; `?` pane; numeric quick-select in menus.
5. **Performance budgeted as UX**: cached markdown, trimmed derivation, resize-safe cursors — smoothness is treated as a design property, and the changelog shows continuous investment.

---

## 3. Architecture map (as publicly knowable)

- **Runtime.** [BIN] Bun-compiled single binary per platform; TUI = Ink + react-reconciler + yoga-layout; state = jotai; i18n = react-i18next; sqlite via `bun:sqlite`; PTY via their own `bun-pty` (repo placeholder exists: https://github.com/Factory-AI/bun-pty, "Fork pseudoterminals in Bun"); git via `simple-git`; logging pino; telemetry OpenTelemetry + Sentry; OAuth via PKCE; ACP (`@agentclientprotocol`) for Zed/JetBrains (https://docs.factory.ai/ide-integrations.md).
- **Monorepo layout.** [BIN] Bundled source paths reveal packages: `droid-core` (dominant), `runtime`, `daemon-core`, `daemon-sdk`, `droid-sdk-core`, `droid-sdk-ext`, `droid-sdk`, `utils`, `common`, `logging`, `updater`, `environment`, `software-factory-db` (Prisma), `bun-usockets`. Clean separation: agent core vs runtime vs daemon vs SDK vs updater as distinct packages.
- **Process/client-server model.** Three ways in: (1) interactive TUI; (2) `droid exec` one-shot; (3) **`droid daemon`** — a long-lived server that SDK clients connect to **over WebSocket** and through which multiple sessions run concurrently (https://github.com/Factory-AI/droid-sdk-typescript README + docs/typescript-sdk-reference.md: "The daemon runtime connects to a daemon over WebSocket and can manage several sessions through one connection"). Changelog references "TUI daemon session switching" and daemon session titles reflecting into the terminal tab (v0.109-ish), i.e. the TUI itself attaches to the daemon. The SDK's Node runtime spawns `droid` from PATH as a subprocess; a custom `transport` can bypass subprocess creation entirely.
- **Wire protocol.** Newline-delimited **JSON-RPC over stdin/stdout** for exec (`--input-format stream-jsonrpc --output-format stream-jsonrpc`; older `stream-json` deprecated). Documented methods: `droid.initialize_session`, `droid.load_session`, `droid.add_user_message`, `droid.session_notification` (assistant deltas, tool events, token usage, errors, turn completion), server→client requests `droid.request_permission` and `droid.ask_user` (https://docs.factory.ai/droid-exec/overview.md). Same control surface is what the TS/Python SDKs wrap.
- **Session model.** Sessions persist locally as JSONL transcripts — hook payloads include `transcript_path: ~/.factory/projects/<...>/session.jsonl` (https://docs.factory.ai/harness/hooks.md). Sessions support resume (`-r`), fork (`--fork`, `/fork`, fork trees), compress (`/compress`), rewind (`/rewind-conversation` — "rewinds the chat and restores your files to an earlier point", v0.156.2), rename, archive, favourite, tags. Optional **cloud session sync** mirrors sessions to web/mobile (settings `cloudSessionSync`, default true). Cloud-side lifecycle via REST: list/create/get/delete(soft)/patch/interrupt/messages at `https://api.factory.ai/api/v0/sessions` (https://docs.factory.ai/api-reference/sessions.md).
- **Config format.** `~/.factory/settings.json` (user), `<project>/.factory/settings.json`, plus `settings.local.json` overrides at both levels, merged with hierarchy precedence; org-managed settings layer on top for enterprise (https://docs.factory.ai/droid-cli/settings.md). JSONC with precise parse errors [BIN]. Legacy surfaces (`.droid.yaml`, `config.json` snake_case) still load and merge with documented priority. Hooks: `hooks.json` per scope (user/project/enterprise/plugin) keyed by event name. MCP: `~/.factory/mcp.json` + `.factory/mcp.json`. Specs default to `~/.factory/specs`; worktrees to `~/.factory/worktrees`; everything under `~/.factory` / `.factory` — **one directory namespace for the whole product** (changelog v0.108: "Files related to Missions now live together under `~/.factory` for easier discoverability").
- **Sandbox/execution isolation.** OS-level sandbox with kernel-enforced filesystem/network policy (https://docs.factory.ai/autonomy-and-safety/sandbox.md); Factory also forked `tursodatabase/agentfs` as `Factory-AI/vfs` ("The filesystem for agents", Rust) — agent-filesystem work in progress [INFERENCE: intended for sandboxed/audited agent file access].
- **TUI testing.** They test the TUI end-to-end with `@factory/tui-test`, a fork of Microsoft's tui-test: an e2e terminal-testing framework driving a headless xterm (`@xterm/headless` + jest-diff snapshots), engines `node >=16.6 <25` **and `bun >=1.3.5`** (https://github.com/Factory-AI/tui-test package.json). The TUI is snapshot-tested like a web app.

---

## 4. Capability inventory

- **Models/providers.** First-party catalogue across Anthropic (11 SKUs), OpenAI (13), Google (4), xAI (1), plus a **"Droid Core" open-models tier** (GLM, Kimi, DeepSeek, MiniMax, Nemotron) with per-model credit multipliers (0.08×–12×) and **per-model reasoning-effort menus** (`none/dynamic/off/minimal/low/medium/high/xhigh/max`, per-model defaults) (https://docs.factory.ai/models.md). `Auto` model uses **Factory Router** to pick per task and upgrades itself when a task needs a stronger model (v0.190; https://docs.factory.ai/model-independence/factory-router.md). Per-model fallback routing (`modelFallbacks`), per-model compaction limits, `/fast` fast mode.
- **BYOK.** `customModels` array in settings: three provider dialects (`anthropic` Messages API, `openai` Responses API, `generic-chat-completion-api` for OpenRouter/Together/Ollama/vLLM); `${VAR}` env interpolation; **keyless endpoints**; `apiKeyHelper` shell-command dynamic credentials with TTL + 401 refresh (org-managed settings only, so an untrusted repo can't execute commands); AWS Bedrock routing with region/profile chain, credential refresh commands, and per-call `requestMetadata` cost-attribution tags (https://docs.factory.ai/model-independence/byok.md). BYOK keys stay local; BYOK models appear in CLI + desktop only.
- **Subagents ("custom droids").** Markdown files with YAML frontmatter (`name`, `description`, `model|inherit`, `reasoningEffort`, `tools` as category (`read-only`/`edit`/`execute`/`web`/`mcp`) or ID array, `mcpServers`) in `.factory/droids/` (project) or `~/.factory/droids/` (personal); validated at load with three enforced tool-policy rules; built-ins `worker` (medium) and `explorer` (light); invoked through the `Task` tool with `complexity` tiers routed to per-tier pinned models (`subagentModelSettings.light/medium/heavy…`), `run_in_background` + `TaskOutput`/`TaskStop` companion tools, and `resume` for follow-up turns; subagents cannot spawn subagents and can't ask the user (https://docs.factory.ai/harness/subagents.md). Import-from-Claude-Code flow converts `.claude/agents/` files.
- **Orchestration.** **Missions**: multi-agent runs with an orchestrator session, worker agents, and validation milestones (scrutiny / user-testing validators), each with pinnable model + reasoning effort; `Mission Control` overlay (`Ctrl+T`) with per-worker token breakdowns and `g`/`G` navigation shortcuts; headless via `droid exec --mission --auto high`; OS wake-lock during missions (`keepSystemAwakeDuringMissions`) (https://docs.factory.ai/missions/running-cli.md, https://docs.factory.ai/missions/reference.md, settings).
- **Memory/knowledge.** No vector store. Durable knowledge = `AGENTS.md` project instructions, skills, and generated **AutoWiki** repo wikis (https://docs.factory.ai/software-factory/wiki/overview.md). Spec-mode plans persist as `YYYY-MM-DD-slug.md` in `.factory/docs` (https://docs.factory.ai/autonomy-and-safety/specification-mode.md).
- **Packaging/auto-upgrade.** Standalone installs **auto-update by default**; `droid update`, `droid update --check`, `droid update --version <v>` (also rolls back); `FACTORY_DROID_AUTO_UPDATE_ENABLED=false` pins a standalone install; **npm builds have auto-update disabled at build time** (pinned by construction — upgrade = explicit `npm install -g droid@x`); enterprise org setting `disableAutoUpdate`; direct binary downloads with SHA256 checksums (https://docs.factory.ai/droid-cli/cli-reference.md). Installed **plugins auto-update on CLI startup** (v0.89).
- **Extension surface.** Skills (`SKILL.md`, progressive disclosure — description-first routing, body loaded on invoke; scopes: project/folder/personal/compat `.agents`/mission/plugin/built-in; documented precedence; `disabledSkills` ledger; `user-invocable` / `disable-model-invocation` flags) (https://docs.factory.ai/harness/skills.md). Custom slash commands (Markdown prompts or executable scripts). **Plugins**: bundles of skills/commands/droids/hooks/MCP with `.factory-plugin/plugin.json` manifests, **marketplace catalogues** (`.factory-plugin/marketplace.json`) sourced from GitHub/git/url/local/**npm**, `#ref`/`@sha` pinning, user/project install scopes, and **Claude Code plugin-layout translation** (`.claude-plugin/`→`.factory-plugin/`, `agents/`→`droids/`) (https://docs.factory.ai/harness/plugins.md; official marketplace https://github.com/Factory-AI/factory-plugins). **Hooks**: 9 lifecycle events (PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, PreCompact, SessionStart, SessionEnd), JSON-on-stdin input, exit-code semantics (2 = block/correct), and a JSON control protocol (`permissionDecision: allow|deny|ask`, `updatedInput` rewriting, `additionalContext` injection, `suppressOutput`) (https://docs.factory.ai/harness/hooks.md). MCP: http/sse/stdio, OAuth incl. CIMD, 40+ server registry, per-server `connectTimeout` (https://docs.factory.ai/harness/mcp.md).
- **Headless/SDK/CI.** `droid exec` (read-only by default, `--auto low|medium|high`, fail-fast on permission violations with non-zero exit, `-o text|json|stream-json|stream-jsonrpc`, `--list-tools`, `--cwd`, `-w/--worktree`, `--tag`, `--restrict/additional/disabled-tools`) (https://docs.factory.ai/droid-exec/overview.md). Official **GitHub Action** (`Factory-AI/droid-action`: review/security/prepare variants, GitLab templates) and **SDKs**: TypeScript `@factory/droid-sdk` (Apache 2.0, https://github.com/Factory-AI/droid-sdk-typescript — runs, sessions, streaming, structured output, permissions, AskUser, SDK-defined MCP tools, daemon connect) and Python (https://github.com/Factory-AI/droid-sdk-python). Exit codes 0/1/2.
- **Permissions/approvals.** Autonomy levels off/low/medium/high; command **allowlist/denylist/blocklist** with precedence rules and **binary resolution** so blocklisted commands can't be smuggled through wrappers, absolute paths, quoting, or command substitution; denylist catches dangerous commands nested in `$(...)`/backticks; org `maxAutonomyLevel` cap clamps everything downstream (https://docs.factory.ai/autonomy-and-safety/auto-run.md, settings). Droid Shield secret scanning (https://docs.factory.ai/autonomy-and-safety/droid-shield.md).
- **Session sharing.** `/share` shares a session with the organisation; cloud sync mirrors to web/mobile; `droid computer register/ssh/port-forward` turns your machine into a remotely drivable Droid Computer (BYOM) (CLI reference; https://docs.factory.ai/droid-computers/byom.md).
- **Naming/primitives (VERIFIED).** *Droid* = the agent; *custom droids* = subagents; *Missions* = orchestrated multi-agent projects; *Mission Control* = the orchestration view; *Skills* = reusable procedures; *Plugins* + *Marketplaces*; *Hooks*; *Specs* (spec mode plans); *Droid Computers* / *BYOM*; *Factory Router*; *Droid Shield*; *Droid Core* (open-model tier). Interaction modes: Normal/Spec/Mission.

---

## 5. Delta findings (beyond the opencode-derived bar)

The opencode findings already established leader-key, command palette, inline-diff approvals, subagent tree navigation, shadow-git undo, attention system. Droid **adds or refines**:

1. **Boring stack, elite polish.** [BIN] Droid's TUI is Ink/React — not a custom native core — yet is the field's design leader. Conclusion for OpenKai: design discipline (tokens, grammar, restraint, perf budgets) beats rendering-stack exoticism. The pi-tui substrate decision stands; droid proves the ceiling is set by design process, not the framework.
2. **Dual-channel distribution with update semantics compiled in per channel** — standalone installer auto-updates (with env kill-switch and org policy), npm build is pinned *at build time*. For OpenKai-as-installable-auto-upgraded-component this is the exact pattern: ship an auto-updating channel for developers and a pinned-by-construction channel for reproducible environments, plus `update --check/--version` that also rolls back.
3. **`droid daemon` + WebSocket SDK + JSON-RPC/stdio exec**: three client classes (TUI, SDK, custom) against one session core, with the documented low-level protocol (`initialize_session`/`add_user_message`/`session_notification`/`request_permission`) as the public contract. The TUI attaches to the daemon; sessions are addressable from REST, SDK, and TUI alike.
4. **Autonomy as a single visible axis with a fixed-width chip and one-key cycle**, orthogonal to interaction mode; "allow always" *raises the axis* instead of accreting pattern rules. Simpler mental model than opencode's pattern-rule memory (which opencode also has — droid deliberately chose coarser, visible state).
5. **`/btw` side channel** — clarifying questions without polluting the main transcript, with its own scroll view (`Ctrl+Y`). No equivalent in opencode's 22 patterns.
6. **Bash mode as a one-keystroke toggle** with prompt-glyph state (`>`→`$`). Cheaper than a shell tool call, keeps flow.
7. **Double-Esc clears draft; third Esc opens rewind** — rewind/undo discoverable from the panic key. Compare opencode's shadow-git `/undo` (explicit command); droid's gesture costs nothing to find.
8. **Background, non-blocking `/fork` with a paste-able resume receipt** (`droid --resume <id>`) — forking as a copy-paste collaboration primitive, and fork trees navigable via `/tree` and `Ctrl+F`.
9. **Local full-text session search as a CLI verb** (`droid search`, alias `droid find`) with a rebuildable local index, kind filters, `--json`. Session history treated as a searchable knowledge base, not just a list.
10. **Spec mode → persisted artefact**: approved plans save as dated Markdown in `.factory/docs`; spec has its own colour identity and its own model/effort settings. Planning is a first-class artefact pipeline, not a mode flag.
11. **Complexity-tier subagent routing** (`light`/`medium`/`heavy` → per-tier model + effort pins, with inherit semantics and org clamping) — cost/latency governance built into delegation UX.
12. **Design-token enforcement as an engineering habit**: recurring changelog entries migrating hardcoded colours into the theme system, theme-aware menus/mermaid/diffs, adaptive terminal-background detection (incl. over SSH), fixed-width chips to prevent reflow. The *process* is the pattern.
13. **TUI snapshot testing with headless xterm** (`@factory/tui-test` fork) — e2e tests that drive the real TUI and diff frames. OpenKai should adopt this outright; it makes TUI refactors safe.
14. **Claude Code compatibility as a strategy**: plugin layouts translated (`.claude-plugin`→`.factory-plugin`, `agents/`→`droids/`), agent import flow, `${CLAUDE_PLUGIN_ROOT}` honoured in plugin hooks, `apiKeyHelper` mirrors `CLAUDE_CODE_API_KEY_HELPER_TTL_MS`. Droid treats the incumbent's ecosystem as an import format.
15. **i18n of the TUI** (`/language`, full catalogues, plural rules) — unique in the field [BIN].
16. **Mermaid→ASCII inline + in-terminal charts**, theme-tinted per element — agent output stays in the terminal instead of bouncing to a browser.
17. **One config namespace** (`~/.factory` + `.factory/` per project, with documented merge/precedence and legacy migration paths) — everything the harness owns lives under one discoverable root.
18. **Sound design as two-channel attention** (completion vs awaiting-input, focus-aware, subagent lifecycle) — refines opencode's attention system with focus modes and per-event overrides.

---

## 6. Reuse verdict for OpenKai

TUI items first. Verdicts assume the ratified baseline (pi-tui substrate, omp-grade bar, standalone product, KOS lane consumption, installable + auto-upgraded).

| # | Item | Verdict | Rationale |
|---|------|---------|-----------|
| 1 | Design-token system with enforcement passes (muted-border code blocks, `highlight`/`highlightDanger`, theme-aware everything) | **ADOPT** | Cheapest highest-leverage design decision; pi-tui must expose a token layer and OpenKai must ban ad-hoc colour from day one. |
| 2 | Consistent menu grammar (`↑/↓ Navigate · Enter Select · 1-N Quick select · ESC Cancel`) on every overlay | **ADOPT** | Zero cost, immediate perceived quality. |
| 3 | Clean-by-default transcript + verbose detail toggle (droid's `Ctrl+O`) | **ADOPT** | Extends the opencode bar; solves streaming-noise vs debuggability. |
| 4 | Persistent chrome for mode/autonomy/model/effort with single-key cycles and fixed-width chips | **ADAPT** | Adopt the visibility and no-reflow discipline; bind keys to OpenKai's leader-key scheme rather than droid's chords. |
| 5 | Modes have visual identity (spec-mode colour) | **ADOPT** | Mode awareness is safety UX. |
| 6 | `/btw` side channel | **ADAPT** | Genuinely novel; implement as a side-thread lane in OpenKai's session model rather than a bolt-on command. |
| 7 | Double-Esc draft clear → triple-Esc rewind menu | **ADAPT** | Gesture onto OpenKai's existing undo primitive (shadow-git per opencode findings); keep droid's discoverability. |
| 8 | Bash mode `!` toggle with glyph change | **ADOPT** | One keystroke; users live in the shell anyway. |
| 9 | Background `/fork` with resume receipt + `/tree` fork navigation | **ADOPT** | Matches KOS's multi-lane worldview; the receipt line is the collaboration hook. |
| 10 | `droid search` local session full-text index | **ADAPT** | OpenKai should search sessions *and* Cortex memory through one verb. |
| 11 | Mermaid→ASCII inline + in-terminal charts | **ADAPT** | omp already renders mermaid ASCII; add theme-tinted per-element colours and the supported-type fallback rule. |
| 12 | Animated logo once + in-product changelog (`Ctrl+J`) | **ADAPT** | Onboarding delight + self-teaching product; tie changelog to OpenKai's auto-upgrade channel ("what just changed"). |
| 13 | Focus-aware two-channel sounds | **ADAPT** | Merge with opencode's attention system (per-event packs) — droid's focus modes are the refinement. |
| 14 | `/language` i18n of the TUI | **IGNORE (for now)** | Real cost, no demand signal for KOS's market; note as differentiator if OpenKai targets non-English enterprise. |
| 15 | Headless-xterm TUI e2e testing (tui-test pattern) | **ADOPT** | Makes the whole TUI bar enforceable in CI. |
| 16 | Dual-channel distribution: auto-updating standalone + pinned npm build (`--check`/`--version` incl. rollback, env + org kill-switches) | **ADOPT** | Directly answers the "installable component with automatic upgrades" requirement; the pinned-channel story keeps KOS reproducible. |
| 17 | `daemon` + WebSocket SDK + JSON-RPC/stdio protocol as the public session contract | **ADAPT** | OpenKai needs one documented session-control protocol that TUI, KOS lanes, and SDKs all speak; JSON-RPC/stdio is proven here, SSE/HTTP in opencode — pick one, document methods like droid does. |
| 18 | Autonomy axis (off/low/medium/high) orthogonal to interaction mode, "allow always raises the axis" | **ADAPT** | OpenKai's permission engine (opencode pattern rules) is finer-grained; layer droid's coarse visible axis on top as the summary control. |
| 19 | Complexity-tier subagent model routing | **ADAPT** | KOS's Ruflo/RuVector lanes give richer routing signals; adopt the tier-pinning UX. |
| 20 | `.factory/`-style single config namespace with documented precedence + legacy migration | **ADOPT** | Boring and correct; pick `.openkai/` + `~/.openkai/` and never spread. |
| 21 | Claude Code compatibility (plugin layout translation, agent import, `apiKeyHelper` semantics) | **ADAPT** | Ecosystem import is how a late entrant bootstraps; target Claude Code and opencode formats. |
| 22 | Hooks protocol (9 events, exit-code 2 semantics, `permissionDecision`/`updatedInput` JSON control) | **ADAPT** | omp already has lifecycle hooks; adopt droid's wire contract (JSON stdin, typed decisions, input rewriting, `suppressOutput`) as the documented shape. |
| 23 | Cloud session sync + mobile handoff | **IGNORE** | Requires Factory's cloud; out of scope for an open-source standalone module (KOS supplies its own sync if wanted). |
| 24 | Credit multipliers / Factory Router / Droid Core model tier | **IGNORE** | Billing-coupled; OpenKai's model abstraction should follow opencode's models.dev-style catalogue instead. |

---

## 7. Citations

**Docs (primary, VERIFIED):**
- https://docs.factory.ai/welcome/index.md — surfaces, install channels
- https://docs.factory.ai/droid-cli/overview.md — CLI positioning, capabilities
- https://docs.factory.ai/droid-cli/quickstart.md — onboarding flow, essential controls, welcome screen caption
- https://docs.factory.ai/droid-cli/cli-reference.md — commands/flags, keyboard shortcuts, bash mode, mermaid/markdown/math rendering, worktrees, auto-update semantics, update/pin commands, exit codes, search
- https://docs.factory.ai/droid-cli/settings.md — settings.json schema, diff modes, sounds, UI display settings, subagent/mission settings, enterprise keys
- https://docs.factory.ai/droid-exec/overview.md — headless mode, autonomy table, output formats, JSON-RPC methods, SDK pointers
- https://docs.factory.ai/autonomy-and-safety/auto-run.md — approvals, allow-always semantics, allow/deny/blocklist precedence, binary resolution
- https://docs.factory.ai/autonomy-and-safety/specification-mode.md — interaction modes, spec persistence to `.factory/docs`
- https://docs.factory.ai/autonomy-and-safety/sandbox.md — OS-level sandboxing
- https://docs.factory.ai/autonomy-and-safety/droid-shield.md — secret scanning
- https://docs.factory.ai/models.md — model catalogue, reasoning levels, multipliers
- https://docs.factory.ai/model-independence/byok.md — custom models, apiKeyHelper, Bedrock
- https://docs.factory.ai/model-independence/factory-router.md — auto routing
- https://docs.factory.ai/harness/subagents.md — custom droids, Task tool, complexity tiers
- https://docs.factory.ai/harness/skills.md — SKILL.md, discovery, precedence
- https://docs.factory.ai/harness/plugins.md — plugin/marketplace formats, sources, Claude Code translation
- https://docs.factory.ai/harness/hooks.md — hook events, I/O contract, transcript_path
- https://docs.factory.ai/harness/mcp.md — MCP registry/config
- https://docs.factory.ai/harness/agents-md.md — AGENTS.md
- https://docs.factory.ai/missions/overview.md, /missions/running-cli.md, /missions/reference.md — Missions + Mission Control
- https://docs.factory.ai/api-reference/sessions.md — sessions REST API
- https://docs.factory.ai/changelog/release-notes.md — all versioned changes cited inline above (v0.89, v0.92, v0.106, v0.108, v0.135, v0.147, v0.155, v0.156.2, v0.157, v0.161, v0.179, v0.180, v0.181, v0.182, v0.183, v0.185, v0.186, v0.187, v0.188, v0.189, v0.190, v0.193–v0.197)
- https://docs.factory.ai/ide-integrations.md — ACP/IDE surfaces
- https://docs.factory.ai/droid-computers/byom.md — BYOM computers

**GitHub (primary code/docs):**
- https://github.com/Factory-AI/factory — public docs/issues repo (README: "top performing in terminal benchmarks"); no source
- https://github.com/Factory-AI/droid-sdk-typescript — Apache 2.0 SDK; README + docs/typescript-sdk-reference.md (daemon over WebSocket, transports)
- https://github.com/Factory-AI/droid-sdk-python — Python SDK
- https://github.com/Factory-AI/droid-action — GitHub Action (CI mode)
- https://github.com/Factory-AI/factory-plugins — official plugin marketplace
- https://github.com/Factory-AI/tui-test — @xterm/headless TUI e2e framework fork
- https://github.com/Factory-AI/vfs — fork of tursodatabase/agentfs ("filesystem for agents")
- https://github.com/Factory-AI/bun-pty — "Fork pseudoterminals in Bun" (placeholder)
- https://github.com/Factory-AI/terminal-bench-leaderboard — benchmark logs

**npm/CDN (primary):**
- https://registry.npmjs.org/droid — 182 versions, `UNLICENSED`, postinstall shim, latest 0.197.0 (2026-08-15)
- https://registry.npmjs.org/@factory/cli — legacy package (bin `factory`, last meaningful early releases)
- https://registry.npmjs.org/-/v1/search?text=factory+droid — `@factory/droid-sdk` 0.7.0
- https://downloads.factory.ai/factory-cli/releases/0.197.0/darwin/arm64/droid (+ `.sha256`) — [BIN] binary analysed locally: Bun v1.3.14 compiled binary; Ink/react-reconciler/yoga-layout/jotai/react-i18next; `bun:sqlite`; beautiful-mermaid; simple-git; @agentclientprotocol; monorepo package paths; design-token directive; i18n catalogues; menu grammar strings; approval option strings; Zork tagline

**Product/secondary:**
- https://factory.ai/product/cli — TUI product page (slash commands, persistent sessions, keyboard-driven positioning)
- https://surfing.salty.vip/articles/en/quick_review_on_droid_cli_after_free_trial/ — [INFERENCE from secondary] hands-on TUI praise (status bar) — link 404s as of 2026-08-15; quoted via search index
- https://www.developersdigest.tech/blog/factory-droid-review-setup-2026 — [secondary] 2026 review/setup guide
- https://deepwiki.com/factory-ai/factory — indexed wiki of the factory repo (JS-rendered; not mined — contents now docs-only)
