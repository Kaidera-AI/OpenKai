# ADR OK-11-candidate — DeepSeek Harness & Cordis: Plugin Architecture for OpenKai

> **PARKED FOR NEXT VERSION** (CTO, 2026-08-19): reviewed after v0.1.007 ships.
> Numbering note: this was drafted as "OK-9" but OK-9 is already the ratified
> shift/fusion orchestration ADR (2026-08-18) and OK-10 is served-TUI
> (2026-08-19) — this document is OK-11-candidate on adoption review.

**Date:** 2026-08-19 · **Author:** Main (engineer) · **Status:** PARKED (next-version review)
**Sources:** deepseek-harness (166k★, MIT), Cordis paper (Peking Univ + DeepSeek, Aug 2026)

## 1. Context

DeepSeek Harness (`dsh`) shipped developer preview on 2026-08-13 with an architecture
where **everything is a plugin** — model adapters, tool registries, session logs,
sandboxes, approval policies, and the agent loop itself are all replaceable Cordis
plugins. It is powered by [Cordis](https://github.com/cordiverse/cordis), a
TypeScript meta-framework built on _spatiotemporal composability_ — revertible
effects plus reactive coeffects. The Cordis paper (80+ pages, Peking University +
DeepSeek) formalises this as a programming paradigm.

OpenKai currently has a monolithic core (`packages/core`) with tightly coupled
session transport, tool definitions, and agent loop. The fusion system (FU-1
through FU-5) is modular but the underlying harness is not. Adopting Cordis-style
plugin architecture would make OpenKai's tools, models, sessions, and UI
surfaces independently replaceable — a critical capability for the KOS bundling
where OpenKai must coexist with Kaidera Manifold, Cortex, and future platform
extensions.

## 2. Decision

### 2.1 Adopt Cordis plugin architecture principles

OpenKai will modularise its harness following the Cordis pattern:

1. **Every capability is a component** — tools, models, sessions, memory, LSP,
   MCP, sandbox, and UI are registered as independent plugins with explicit
   service definitions.
2. **Every dependency is explicit** — plugins declare their dependencies via
   typed service keys; the runtime resolves and injects them.
3. **Every effect is revertible** — plugins register cleanup handlers; unloading
   a plugin reverts all its side effects (file watchers, subprocesses, LSP
   clients, MCP connections).
4. **Components respond to dependency changes** — when a dependency is
   replaced (e.g., model switch), dependents react without restart.

### 2.2 OpenKai plugin surface

| Plugin | Service Key | What it provides |
|---|---|---|
| `core/models` | `ctx.models` | Model adapter registry, provider resolution |
| `core/tools` | `ctx.tools` | Tool registry, guarded execution pipeline |
| `core/session` | `ctx.session` | Append-only session log, event store |
| `core/agent-loop` | `ctx.agentLoop` | Turn driver, step orchestration |
| `core/lsp` | `ctx.lsp` | LSP client lifecycle, server management |
| `core/mcp` | `ctx.mcp` | MCP server connections, tool proxy |
| `core/memory` | `ctx.memory` | Cortex-backed project memory |
| `core/fusion` | `ctx.fusion` | Panel, synthesis, gate, bandit |
| `core/sandbox` | `ctx.sandbox` | Process confinement, filesystem isolation |
| `tui/transcript` | `ctx.transcript` | Scrollback renderer, block management |
| `tui/composer` | `ctx.composer` | Input editor, history, stash |
| `tui/status` | `ctx.status` | Status line segments, presets |
| `tui/theme` | `ctx.theme` | Colour tokens, symbol presets |

### 2.3 Plugin composition model

Plugins are composed at boot from ordered layers:

```yaml
# ~/.openkai/plugins.yml
plugins:
  - core/models       # model adapters (OpenRouter, Anthropic, Manifold, ...)
  - core/tools        # tool registry (read, write, bash, lsp, mcp, task, ...)
  - core/session      # session log + persistence
  - core/agent-loop   # default turn driver
  - core/lsp          # language server integration
  - core/mcp          # MCP server proxy
  - core/memory       # Cortex project memory
  - core/fusion       # architect/builder panel + synthesis
  - core/sandbox      # optional: sandbox confinement
  - tui/transcript    # transcript renderer
  - tui/composer      # input editor
  - tui/status        # status line
  - tui/theme         # Kaidera brand theme
```

Each plugin can be patched or replaced via `~/.openkai/plugins.patch.yml`:

```yaml
# Replace the default theme with a custom one
- id: tui/theme
  config:
    theme: "dracula"
```

### 2.4 Temporal composability — hot reload

When a plugin is replaced (e.g., model switch, tool update), the old plugin's
effects are reverted and the new plugin's effects are applied — without
restarting the process. This preserves session context, LSP state, and MCP
connections across hot reloads.

```typescript
// Plugin lifecycle
interface Plugin {
  id: string;
  dependencies: string[];
  mount(ctx: Context): Disposable;
}

// Disposable = revertible effect
interface Disposable {
  dispose(): void;
}
```

### 2.5 Spatial composability — dependency graph

Plugins declare dependencies explicitly. The runtime builds a DAG and resolves
injection order. Circular dependencies are detected at composition time and
rejected.

```typescript
// Model plugin declares its dependencies
const modelsPlugin: Plugin = {
  id: "core/models",
  dependencies: ["core/config"],  // needs config for API keys
  mount(ctx) {
    const config = ctx.get("core/config");
    const registry = new ModelRegistry(config);
    ctx.provide("ctx.models", registry);
    return { dispose: () => registry.shutdown() };
  },
};
```

## 3. What we learn from DeepSeek Harness

### 3.1 Architecture principles

| Principle | DeepSeek Harness | OpenKai adoption |
|---|---|---|
| **Everything is a plugin** | Models, tools, sessions, sandbox, UI, agent loop | Already partially modular (tools, fusion, LSP, MCP); need to make agent loop and session pluggable |
| **No privileged core** | Every part is replaceable from config | Move from hardcoded `InProcessTransport` to plugin-composed transport |
| **Capability seams** | Service Definition + Provider + Consumer | Already have this pattern in LSP and MCP; extend to all capabilities |
| **Durable session log** | Append-only event log, model-visible means logged | Already have `SessionEvent` stream; need to enforce the invariant |
| **Event-driven extension** | `agent/*`, `tools/*`, `session/*`, `fs/*` events | Already have agent events; need tool and session lifecycle events |
| **Profile + bundle composition** | Ordered layers, patchable config | Adopt for OpenKai plugin config |

### 3.2 Design patterns to adopt

1. **Waterfall events** — `agent/pre-step`, `agent/request`, `tools/pre-execute`
   are waterfall events where listeners call `next()` to delegate. This allows
   middleware-style interception (auth, rate limiting, telemetry).

2. **Scoped registrations** — `agent.ctx` provides per-agent scoped
   registrations. A tool registered on one agent's context is invisible to
   others. This enables subagent-specific tool sets.

3. **Inbox pattern** — Input reaches the driver through one inbox. Some messages
   wake immediately; injected context waits until another message does. This is
   cleaner than our current `steer()`/`prompt()` duality.

4. **Turn enclosure** — A turn is 0+ steps. It opens before its first input is
   claimed and closes once nothing is owed. This is a stronger invariant than
   our current fire-and-forget prompt model.

### 3.3 Technology to incorporate

| Technology | DeepSeek Harness | OpenKai path |
|---|---|---|
| **Cordis** | Meta-framework, effect tracking, coeffect resolution | Evaluate as dependency or build lightweight equivalent |
| **Plugin loader** | Declarative config, reconciliation, HMR | Build `PluginLoader` with YAML config + hot reload |
| **Service container** | Typed keys, dependency injection, lifecycle | Already have TypeScript; add DI container |
| **Event bus** | Typed events, waterfall + serial dispatch | Extend existing `SessionEvent` stream |
| **Session log** | Append-only, model-visible = logged invariant | Enforce invariant in `InProcessTransport` |

## 4. Migration path

### Phase 1: Plugin container (E012)
- Build `PluginLoader` with YAML config parsing
- Extract tool registry as first plugin (`core/tools`)
- Extract model registry as second plugin (`core/models`)
- Keep existing `InProcessTransport` as the default agent loop plugin

### Phase 2: Capability seams (E013)
- Extract LSP as plugin (`core/lsp`)
- Extract MCP as plugin (`core/mcp`)
- Extract memory as plugin (`core/memory`)
- Extract fusion as plugin (`core/fusion`)

### Phase 3: Agent loop plugin (E014)
- Extract agent loop as plugin (`core/agent-loop`)
- Make session log the durable source of truth
- Implement waterfall events for pre-step, request, tools

### Phase 4: Hot reload (E015)
- Implement plugin disposal (revertible effects)
- Implement plugin hot reload without process restart
- Preserve LSP, MCP, and session state across reloads

## 5. Consequences

### Positive
- **Replaceability**: Any component can be swapped without touching the rest
- **Extensibility**: New tools, models, and UI surfaces are plugins
- **KOS integration**: Manifold provider, Cortex memory, and KOS sandbox are plugins
- **Hot reload**: Switch models, add tools, change themes without restart
- **Testability**: Each plugin is independently testable with mocked dependencies

### Negative
- **Complexity**: Plugin container adds abstraction overhead
- **Migration cost**: Existing code must be refactored into plugin shape
- **Learning curve**: Plugin architecture requires new mental model for contributors
- **Cordis dependency**: If we adopt Cordis directly, we take on a young framework (v4, Aug 2026)

### Neutral
- **Performance**: Plugin resolution at boot adds startup cost; mitigated by caching
- **Debugging**: Plugin lifecycle issues require new debugging tools

## 6. References

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — 166k★, MIT
- [Cordis Paper](https://github.com/cordiverse/paper) — "A Programming Paradigm for Spatiotemporal Composability", Aug 2026
- [Cordis Framework](https://github.com/cordiverse/cordis) — TypeScript meta-framework
- [DeepSeek Harness Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Cordis Primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)

## 7. Open questions

1. Should we adopt Cordis directly as a dependency, or build a lightweight
   equivalent? Cordis has 4000+ community plugins on Koishi but is v4 (young).
2. How does the plugin architecture interact with the fusion system? Fusion
   roles (architect/builder) are already separate sessions — should they be
   separate plugin instances?
3. What is the plugin story for KOS? KOS bundles OpenKai — should plugins be
   shared or sandboxed?
4. How do we handle plugin versioning and compatibility across OpenKai releases?