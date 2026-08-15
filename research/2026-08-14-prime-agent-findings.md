# Prime Agent — engineering findings for OpenKai

- **Repo:** https://github.com/PrimeIntellect-ai/prime-agent (cloned at HEAD `9f95011`, committed 2026-08-14)
- **Licence:** MIT (root `LICENSE`; `packages/tui/package.json` and sibling manifests also declare MIT)
- **Local inspection copy:** shallow clone, all file citations below are repo-relative paths

## 1. What it is

Prime Agent is Prime Intellect's open-source coding/research agent: a TypeScript monorepo forked from and still namespaced after `pi` (`earendil-works/pi`, itself the badlogic/pi-mono lineage — the README "Acknowledgements" section credits `pi` explicitly), with an RLM (Recursive Language Model) layer added on top: a persistent IPython kernel as the model-facing control environment, recursive subagents spawned from Python code, and a "Continual Harness" state ledger. Maturity signals: ~15.9k stars, 1.7k forks, 596 open issues, HEAD commit dated the day of research (2026-08-14) — extremely active, high churn. Releases ship as npm tarballs plus Bun-compiled single binaries via `install.sh` (`.github/workflows/build-binaries.yml`, `install.sh`).

Crucially for KOS: this is **the same pi lineage that omp supersedes**, so most of the base harness is already familiar; the deltas are the daemon/worker/kernel process architecture, the provider-layer refinements, and the packaging story. Mechanism content of `packages/coding-agent/docs/rlm.md` and `docs/long-running-agents.md` is deliberately excluded here (already mined in E015); only architecture facts are reported.

## 2. Architecture map

**Languages:** TypeScript (all four npm packages) + a small Python wheel (`prime-agent-runtime`) that is the kernel-side shim. Process model: client → daemon supervisor → per-session worker → IPython kernel, all separate OS processes (detailed in §4).

```
packages/
  ai/            @earendil-works/pi-ai          unified LLM layer (providers, models, OAuth, MCP)
    src/api-registry.ts        provider-dialect registry (register/unregister by sourceId)
    src/providers/             9 API dialect implementations + register-builtins.ts (lazy loading)
    src/models.generated.ts    20.7k-line generated catalog (from models.dev API)
    src/types.ts               KnownApi vs KnownProvider split, StreamOptions
    src/oauth.ts, src/mcp/     OAuth flows incl. MCP OAuth
  agent/         @earendil-works/pi-agent-core  provider-agnostic agent loop
    src/agent-loop.ts          986-line event-streamed loop (abort racing, tool execution)
    src/agent.ts               Agent class: state, steer/follow-up queues, hook surface
    src/proxy.ts               StreamFn that routes LLM calls through a user server
    src/types.ts               AgentTool/AgentEvent/AgentMessage (extensible via declaration merging)
  tui/           @earendil-works/pi-tui         own TUI framework (not Ink/blessed)
    src/tui.ts, terminal.ts    Component model, ProcessTerminal, differential rendering
    src/editor-component.ts, kill-ring.ts, undo-stack.ts, latex.ts, terminal-image.ts, fuzzy.ts
  coding-agent/  @earendil-works/pi-coding-agent  the actual product ("piConfig": name prime-agent, configDir .prime/agent)
    src/cli.ts → cli-main.ts → main.ts   entry chain (1,704-line main.ts)
    src/core/agent-session.ts            11,288-line God-object: session lifecycle, RLM policy, goals
    src/core/session-manager.ts          2,324-line JSONL transcript store (CURRENT_SESSION_VERSION 3)
    src/core/kernel/                     KernelManager (ZeroMQ/Jupyter), bootstrap, fork-server, state-snapshot
    src/core/rlm-runtime.ts              typed host-request handlers for rlm.run / find_models / list / delete
    src/core/compaction/                 auto-compaction + branch summarisation
    src/core/extensions/                 jiti-loaded extension system (loader/runner/wrapper/builtin)
    src/core/tools/                      bash, edit, ipython, output shaping, file-mutation-queue
    src/modes/                           interactive | print | rpc | json | acp | daemon | session-worker | agent-connection | agents-view
prime-agent-runtime/                       Python wheel (hatchling), src/rlm/{__init__,harness,mcp_base,skill}.py
```

Entry points: `packages/coding-agent/src/cli.ts` runs a dependency-free Node-version guard then dynamic-imports `cli-main.ts`; `runCli()` enables the V8 compile cache, starts a cold daemon concurrently with heavy imports (`maybeStartDaemonEarly`), sets an undici `EnvHttpProxyAgent` with body/header timeouts disabled (long local-LLM SSE stalls), then calls `main()`. Bin entry is `dist/bundle/cli.js` — an esbuild bundle (~2,500 modules → ~20 chunks, halving cold start) while `dist/` stays unbundled for library consumers (`packages/coding-agent/scripts/bundle.mjs`). Binary builds use `bun build --compile` (package.json `build:binary` script).

## 3. Capability inventory

### Multi-provider abstraction — strong, the most reusable part
- **API-dialect ≠ provider split** (`packages/ai/src/types.ts`): 9 `KnownApi` dialects (`openai-completions`, `openai-responses`, `azure-openai-responses`, `openai-codex-responses`, `anthropic-messages`, `bedrock-converse-stream`, `google-generative-ai`, `google-vertex`, `mistral-conversations`) × 31 `KnownProvider` names (incl. openrouter, vercel-ai-gateway, github-copilot, kimi-coding, opencode, huggingface, cloudflare ×2, xiaomi ×4…). A provider maps onto a dialect with a `baseUrl`.
- **Registry with provenance** (`packages/ai/src/api-registry.ts`): `registerApiProvider(provider, sourceId?)`, `unregisterApiProviders(sourceId)` — extensions register and cleanly retract providers. Runtime type-mismatch guard (`Mismatched api`) on every call.
- **Lazy provider loading** (`packages/ai/src/providers/register-builtins.ts`): each built-in dialect's stream function is a `createLazyStream` wrapper that dynamic-imports the heavy SDK module on first use; lazy-load failure produces a well-formed error `AssistantMessage` instead of a crash.
- **Generated model catalog** (`packages/ai/scripts/generate-models.ts` → `src/models.generated.ts`): fetched from the models.dev API with hand-maintained fix-ups (e.g. OpenCode Go mismatches, versioned aliases) and Anthropic cache pricing overlay (`src/cache-pricing.ts`).
- **Rich StreamOptions** (`packages/ai/src/types.ts`): `transport: sse|websocket|websocket-cached|auto`, `cacheRetention`, `serviceTier`, `sessionId` (session-aware provider caching/routing), `onPayload`/`onResponse` interception hooks, custom `headers`, `timeoutMs`, `maxRetries`.
- **Auth resolution order** (`docs/providers.md`): CLI `--api-key` → `auth.json` (0600 perms) → env var → `models.json` custom keys. Auth `key` field supports `"!command"` shell indirection (stdout cached for process lifetime), env-var name, or literal (`docs/providers.md` §Key Resolution). OAuth subscription flows for ChatGPT Codex / Claude Pro-Max / GitHub Copilot (`src/oauth.ts`, `docs/providers.md` §Subscriptions), tokens auto-refresh.
- **Custom providers two ways**: declarative `~/.prime/agent/models.json` (`baseUrl`+`api`+`apiKey`+`models`, per-provider/model `compat` flags like `supportsDeveloperRole`, `supportsReasoningEffort`; hot-reloaded on `/model` open — `docs/models.md`) or full programmatic providers via extension `pi.registerProvider()` incl. custom OAuth (`docs/extensions.md`, example `examples/extensions/custom-provider-gitlab-duo`).
- **Model switching**: `/model` selector, `cycleModel()`/`setModel()` on the session, per-session model-change transcript entries (`ModelChangeEntry` in `session-manager.ts`), scoped model selector TUI component.

### TUI tech
- Own framework `@earendil-works/pi-tui` — **not** Ink, blessed, or OpenTUI. Differential rendering (three strategies), CSI 2026 synchronised output for flicker-free frames, bracketed-paste handling with markers for >10-line pastes, `Component` interface with `render()`, built-ins (Text, Editor, Markdown via `marked`, SelectList, SettingsList, Image, Loader), LaTeX rendering (`src/latex.ts`), terminal images, kill-ring + undo-stack editor, fuzzy autocomplete (`packages/tui/README.md`, `src/tui.ts`, `src/terminal.ts`). Tests run against `@xterm/headless`. ~60 application components in `packages/coding-agent/src/modes/interactive/components/`. Themes are JSON files (`src/modes/interactive/theme/*.json`); keybindings configurable (`src/core/keybindings.ts`).
- Non-interactive surfaces: print mode, JSON mode, RPC mode (LF-delimited JSONL, `src/modes/rpc/`), and **ACP** (Agent Client Protocol via `@agentclientprotocol/sdk`, `src/modes/acp/`) for editor embedding à la Zed.

### Session / context management
- JSONL transcript per session, schema `CURRENT_SESSION_VERSION = 3` with migration (`packages/coding-agent/src/core/session-manager.ts`, `src/migrations.ts`). Entry types beyond messages: compaction, **branch summary**, labels, custom entries, child-usage attribution, session state (active/archived/crash), agent status (`needs_input`/`completed`), git state.
- **Session tree, not just a log**: `context-tree.ts` + `navigateTree(targetId, {summarize?...})` allow in-place branching and branch summarisation (`compaction/branch-summarization.ts`).
- Process-safe **session leases** keyed by canonical JSONL path (`session-lease.ts`, `proper-lockfile`); concurrent open → structured `session_already_active` error naming the owner.
- Auto-compaction driven by `shouldCompact(contextTokens, contextWindow, settings)` with a token estimator (`compaction/compaction.ts`); extension-customisable.
- Session layout: `~/.prime/agent/sessions/<id>.jsonl` + `session-artifacts/<id>/` holding `kernel-state.dill`, `scheduled-jobs.json`, `harness/harness_state.json`, and `sub-xxxxxxxx/` child dirs (`docs/rlm-runtime.md` §Session Artifacts).

### Subagent / orchestration
- `rlm(...)` from model-executed Python spawns real child agents (`docs/rlm-runtime.md`): admission returns an `RLMSpawnHandle` immediately (`rlm_child_id`, `name`, `session_dir`, `model`) — **never the answer**; results arrive via explicit `agent_message` replies or files. Depth-limited (`RLM_DEPTH < RLM_MAX_DEPTH`, default max 1). Exact model selection via bounded catalog search (`rlm.find_models`); unavailable model → spawn fails, **no silent fallback**.
- Parent-scoped child registry survives kernel restart/compaction; daemon-backed children are rehydrated and retained as independently addressable sessions; `delete_subagent` writes a durable tombstone but keeps transcripts.
- Child usage is asynchronously folded into the parent assistant turn via a persisted `child_usage_attributed` entry; context-tree reporting subtracts attributed usage so per-node own-usage and root totals reconcile (`docs/rlm-runtime.md` §Usage and Cost Attribution).
- **Agent-to-agent messaging** (`src/core/agent-messages.ts`): reach limited to parent/siblings/children; 16 KiB max message, 20 pending/session, token-bucket rate limit (capacity 3, refill 1 s); delivery modes auto/steer/follow_up.

### Memory / vector / embeddings
- **None.** No embeddings, no vector store, no retrieval. "Memory" is the Continual Harness ledger: plain `harness_state.json` files (session-local under session artifacts, global under `~/.prime/agent/harness/`), mtime-polled for external modification so host `/refine` writes and kernel writes don't clobber each other (`prime-agent-runtime/src/rlm/harness.py`). Grep for `embedding|vector` across `packages/*/src` hits only an incidental ACP reference.

### Packaging / distribution as an embeddable module
- **Yes, importable:** `npm install @earendil-works/pi-coding-agent` (published; latest observed on npm 0.84.2; the bare `prime-agent` name is NOT on npm — E404). SDK entry `createAgentSession()` / `createAgentSessionRuntime()` with full event subscription, in-memory `SessionManager`, pluggable `ResourceLoader` (`docs/sdk.md`, `src/index.ts` ~400 lines of re-exports, `src/core/sdk.ts`). Direct SDK print/RPC stay in-process so embedders can pass non-serialisable extension factories (`docs/daemon.md` §Client-Owned Workers).
- Three artefact tiers from one source: unbundled `dist/` (library + types), esbuild-bundled `dist/bundle/cli.js` (bin; extensions inside the bundle resolve through jiti `virtualModules` keyed on a `__PI_BUNDLED__` define so they share module instances — `scripts/bundle.mjs`), and `bun build --compile` single binaries per platform (`build:binary` script, `.github/workflows/build-binaries.yml`).
- Self-update via R2-hosted manifest (`latest.json`/`beta.json`: `{version, package, tarball}`), channel-aware `prime-agent update`, two-phase coordinated daemon update with worker checkpoints and atomic manifest (`docs/daemon.md` §Coordinated Updates, `docs/settings.md` §Update Checks).
- Python side: managed kernel venv at `~/.prime/agent/kernel-venv` bootstrapped with `uv` (Python 3.11 + ipykernel + prime-agent-runtime + dill + a default scientific bundle: pandas/numpy/scipy/requests/httpx/pydantic…), `BOOTSTRAP_SCHEMA` staleness marker, `PRIME_AGENT_KERNEL_PYTHON` override (`src/core/kernel/bootstrap.ts`).

### Extension points
- jiti-loaded TS extensions (no compile step), auto-discovered from `~/.prime/agent/extensions/` and `.prime/agent/extensions/`, hot-reloadable via `/reload`; shareable as npm/git packages (`settings.json` `packages: ["npm:@foo/bar@1.0.0", "git:…@v1"]`, production installs) (`docs/extensions.md`, `src/core/extensions/loader.ts`, `src/core/package-manager.ts`).
- `ExtensionAPI` (`src/core/extensions/types.ts`, 1,523 lines): ~30 lifecycle events (`input`, `before_agent_start`, `context`, `before_provider_request` / `after_provider_response`, blockable `tool_call`, modifiable `tool_result`, custom compaction), `registerTool` (typebox schemas), `registerCommand`/`registerShortcut`/`registerFlag`, **`registerProvider`/`unregisterProvider`**, `ctx.ui` (select/confirm/input/notify/custom full TUI components), `pi.appendEntry()` session persistence, custom tool-result rendering.
- Skills are executable Python packages importable in the kernel; prompt templates, themes, context files all flow through a single `ResourceLoader` abstraction.

### Config format
- Layered JSON: `~/.prime/agent/settings.json` global overridden by `.prime/agent/settings.json` project (`docs/settings.md`); `models.json` for custom providers; `auth.json` (0600) for credentials. Notable defaults worth **not** copying: telemetry is opt-out (`telemetry.enabled: true`, pseudonymous events to Prime Intellect); default thinking level `xhigh`.

## 4. Delta findings (NOT in the KOS baseline)

1. **Three-process daemon topology, fully specified.** Client → detached supervisor → one resident worker per root session tree → IPython kernel(s) (`docs/architecture.md`, `docs/daemon.md`). The supervisor owns routing/attachments/health only — never providers, tools, or transcripts. Workers monitor the supervisor socket and self-heal it via an atomic launch lease; a replacement supervisor *adopts* live workers. Worker crash recovery retries at 250 ms/1 s/5 s, then marks the root failed. `prime-agent shutdown|doctor|status` manage the fleet. This is a proven, shipped blueprint for the "sessions survive the terminal" requirement that KOS currently meets only via handoff files.
2. **Generation-fenced event cursors.** Every sequenced event belongs to a worker *generation*; clients hold `{generation, sequence}` cursors, replay is reported complete/partial/unavailable, and the attach snapshot is the durable recovery baseline when replay gaps (`docs/daemon.md` §Reconnect, Replay, and Snapshots). Cleanly solves the TUI-reattach consistency problem.
3. **Idempotent command journal.** Mutating daemon commands are keyed `clientId + commandId`, recorded before dispatch in an append-only journal; repeats return the stored result, uncertain results are reported and never replayed; clients ack so the journal compacts. Directly applicable to OpenKai dispatch gates (cf. KOS's 8-gate handoff dispatch, which has no idempotency story).
4. **Private worker transport with serialise-once fanout.** Supervisor↔worker uses a binary frame (4-byte header length + 4-byte payload length + small JSON routing header + opaque payload); workers serialise a public event once and the supervisor forwards the same buffer to N clients. Assistant streaming uses compact start/delta/end frames and the supervisor reconstructs the full `message_update` once per delta. Backpressure is attachment-local — a blocked client just stops receiving increments; no unbounded per-client queues (`docs/daemon.md` §Private Worker Transport / §Backpressure).
5. **API-dialect × provider matrix with lazy loading and extension-registered providers** (§3). The registry's `sourceId`-scoped unregister means an extension unload retracts its providers — a detail omp/pi's static provider tables lack. Pi-ai also ships `proxy.ts` (packages/agent/src/proxy.ts): a StreamFn that routes all LLM calls through a customer server which owns auth — the cleanest possible enterprise-gateway seam.
6. **Jupyter-over-ZeroMQ kernel with a deadlock-avoiding host bridge.** `KernelManager` (`src/core/kernel/index.ts`, 1,605 lines) speaks stock Jupyter framing (HMAC-SHA256-signed multipart, shell/iopub/control channels) over loopback TCP with a temp connection file. Host-request replies for `rlm.run` deliberately travel on the **control** channel because shell is serialised and a shell-channel reply would deadlock the active `execute_request` (`docs/rlm-runtime.md` §Why Host-Request Responses Use the Control Channel). Handlers are **branded capabilities**: `createHostRequestHandler` wraps implementations, a `WeakSet` records factory provenance, and dispatch supplies a generation-scoped `HostRequestContext` (`requestId`, `AbortSignal`, `isCurrent()`) so revoked generations can't act. Paranoid-but-cheap engineering worth copying verbatim.
7. **Kernel-as-context made durable.** The kernel namespace is snapshotted with `dill` into the session artifact dir (`kernel-state.dill`, debounced writes, final-snapshot timeout with on-disk fallback) and restored on resume (`src/core/kernel/state-snapshot.ts`); a fork server (`kernel/fork-server.ts`) pre-warms kernel processes for fast child startup. Persistent Python state is treated as first-class session state alongside the JSONL transcript — a concrete realisation of "kernel-as-context" beyond the RLM paper mechanism already mined.
8. **Admission-handle subagent protocol.** `rlm()` returns a handle at *task admission* and never blocks on the answer; completion flows back through rate-limited `agent_message` replies or files, and the parent registry (ID/name/dir/status) is rehydratable after kernel restart or compaction (§3). This inverts the omp/pi "call subagent → await result" shape into something that survives detachment — directly relevant to OpenKai fusion panels that should outlive a turn.
9. **Child-usage attribution as a transcript entry.** `child_usage_attributed` entries let aggregate cost flow to the launching parent turn while per-node context accounting stays exact after reload — a persistence-level solution to a problem fusion/multi-model cost tracking will hit immediately.
10. **Steer vs follow-up queues in the core loop.** `agent.ts` has two `PendingMessageQueue`s with modes `all | one-at-a-time`: steering interrupts after the current turn's tool calls; follow-ups wait for idle. Tool execution is configurable `sequential | parallel` (`packages/agent/src/types.ts`, `ToolExecutionMode`). Small, boring, correct — and missing from KOS's fixed event contract.
11. **Startup-performance engineering as a feature.** Dependency-free Node-version guard before any imports, daemon pre-start concurrent with module loading, V8 compile cache, esbuild bin bundle (~2,500 → ~20 files, halved cold start), lazy provider SDK imports, `__PI_BUNDLED__` jiti virtualModules so extensions share bundle module identity (`scripts/bundle.mjs` header comment, `cli.ts`, `cli-main.ts`). TUI cold-start budget is clearly treated as a release-blocking concern.
12. **Honest non-sandbox.** Execution is explicitly not sandboxed (README warning; docs/rlm-runtime.md §Trust Boundary); `@anthropic-ai/sandbox-runtime` appears only in an example extension (`examples/extensions/sandbox/index.ts`), not the shipped path. Worker/kernel process separation is for lifecycle containment only. OpenKai should not cite prime-agent as a sandboxing reference.

**Corrections / refinements to baseline assumptions:**
- Prime Agent is not a from-scratch harness: it *is* pi (package names, `piConfig`, README acknowledgement). Anything KOS knows about pi-mono internals transfers; the fork's value-add is daemon + kernel + harness state.
- No retrieval step exists here either — harness "memory" is a JSON ledger with mtime reload, weaker than Cortex's pgvector store. Cortex is ahead on this axis.
- Immaturity signals worth noting: the npm workspace manifests read 0.7.2 while the published line is at 0.84.x and `packages/tui/README.md` admits "the source workspace manifest still keeps an inherited package name until the namespace migration is complete"; `packages/coding-agent/package.json` exports a `./hooks` subpath pointing at `./dist/core/hooks/index.js` but **no `src/core/hooks/` exists** at HEAD (verified by `find`) — a dangling public export. 596 open issues against very fast commit velocity. Default `RLM_MAX_DEPTH = 1` (root can spawn children; grandchildren need config). A `TODO` at the top of both `kernel/index.ts` and `tools/ipython.ts` questions whether the persistent kernel survives the arrival of RLM-1 weights — the flagship abstraction is itself provisional.

## 5. Reuse verdict for OpenKai

| Item | Verdict | Notes / licence constraint |
|---|---|---|
| `@earendil-works/pi-ai` provider layer (API-dialect registry, lazy providers, models.dev generator, OAuth, proxy StreamFn) | **Adopt as dependency** (OpenKai is TS on the pi/omp lineage) | MIT, published on npm. Pin a version: namespace migration to `prime-agent-*` is in flight. The dialect×provider matrix and `sourceId`-scoped unregister are the patterns to keep even if the dep is later vendored. |
| models.dev catalog generation (`scripts/generate-models.ts`) | **Adapt pattern** | Generate OpenKai's catalog from models.dev with a hand-fix overlay; don't copy the 20k-line generated file. models.dev data licence [UNVERIFIED]. |
| `@earendil-works/pi-agent-core` loop (steer/follow-up queues, before/after tool hooks, sequential/parallel tool execution) | **Adapt pattern** (omp already supersedes this loop) | MIT. Lift the queue-mode and hook semantics into OpenKai's loop rather than adding a second dependency beside omp. |
| `@earendil-works/pi-tui` | **Candidate dependency, decide against OpenTUI first** | MIT. Differential rendering + CSI 2026 + xterm-headless testing are proven at pi/omp scale; but it's a bespoke framework with migration churn, and the OpencodeTuiResearch sibling covers the OpenTUI alternative. |
| Daemon supervisor design (leases, generations, command journal, serialise-once transport, two-phase update) | **Adapt pattern** | MIT. Don't port wholesale — start with supervisor + resident workers + generation cursors; add binary transport only if fanout profiling demands it. This is the single biggest architectural delta for OpenKai's "sessions outlive the terminal". |
| Kernel host-bridge engineering (control-channel replies, branded capability handlers, generation-scoped revocation, dill namespace snapshots, fork server) | **Adapt pattern** | MIT. Only if OpenKai keeps a Python kernel lane; for a pure-TS kernel the *capability-branding + generation fencing* ideas transfer independent of Jupyter. |
| Admission-handle subagent protocol + child-usage attribution entries | **Adapt pattern** | MIT. Handle-at-admission + message-back results is the right shape for fusion panels and background subagents; the attribution transcript entry solves fusion cost accounting. |
| Extension system (jiti loading, auto-discovery dirs, `registerProvider`, npm/git packages) | **Adapt pattern** | MIT. omp already has skills/subagents; prime-agent's contribution is provider-registration-as-extension and package-manager distribution. |
| Extension SDK surface (`createAgentSession`, `createAgentSessionRuntime`, in-memory SessionManager, ResourceLoader) | **Adapt pattern** | MIT. This is the "installable module" contract OpenKai wants; note the runtime/session split (session replacement forces re-subscription) as an API-design lesson. |
| `prime-agent-runtime` Python shim, harness ledger, goals/heartbeat mechanisms | **Ignore** (already mined in E015) | MIT but mechanism-only; KOS's Cortex already exceeds the JSON-ledger memory. |
| Telemetry (opt-out pseudonymous), R2 self-update pipeline, install.sh | **Ignore** | Distribution plumbing specific to Prime Intellect infra; OpenKai ships via npm. |

## 6. Citations

- Repo: https://github.com/PrimeIntellect-ai/prime-agent (HEAD `9f95011`, 2026-08-14); licence `LICENSE` (MIT)
- `packages/coding-agent/docs/architecture.md` — process topology, prompt execution flow
- `packages/coding-agent/docs/daemon.md` — supervisor/workers, leases, protocol v4, idempotency journal, backpressure, coordinated updates
- `packages/coding-agent/docs/rlm-runtime.md` — kernel bridge, control-channel rationale, child execution sequence, registry, usage attribution, artifact layout, trust boundary
- `packages/coding-agent/docs/providers.md` — auth resolution order, `!command` key indirection, subscriptions, env-var table
- `packages/coding-agent/docs/models.md` — `models.json` custom-provider format, compat flags, hot reload
- `packages/coding-agent/docs/extensions.md` — ExtensionAPI, discovery locations, packages via npm/git, `/reload`
- `packages/coding-agent/docs/sdk.md` — `createAgentSession`/`createAgentSessionRuntime` embeddable contract
- `packages/coding-agent/docs/settings.md` — layered settings, telemetry default, update manifest shape
- `packages/ai/src/types.ts` (KnownApi/KnownProvider, StreamOptions), `src/api-registry.ts`, `src/providers/register-builtins.ts`, `scripts/generate-models.ts`, `src/models.generated.ts`
- `packages/agent/src/agent-loop.ts`, `src/agent.ts`, `src/types.ts` (QueueMode, ToolExecutionMode, hook surface), `src/proxy.ts`
- `packages/tui/README.md`, `src/tui.ts`, `src/terminal.ts`, `packages/tui/package.json`
- `packages/coding-agent/src/core/kernel/index.ts`, `bootstrap.ts`, `fork-server.ts`, `state-snapshot.ts`; `src/core/rlm-runtime.ts`; `src/core/agent-messages.ts`; `src/core/session-manager.ts`; `src/core/compaction/compaction.ts`; `src/core/agent-session.ts` (header comment); `src/core/extensions/types.ts`
- `packages/coding-agent/scripts/bundle.mjs` (bundle rationale), `packages/coding-agent/package.json` (exports, `build:binary`, dangling `./hooks` export), `src/cli.ts`, `src/cli-main.ts`, `src/main.ts`
- `prime-agent-runtime/pyproject.toml`, `src/rlm/harness.py`
- `.github/workflows/build-binaries.yml`, `install.sh`
- npm registry: `@earendil-works/pi-coding-agent` published (0.84.2 observed); `prime-agent` returns E404 (checked 2026-08-14)
