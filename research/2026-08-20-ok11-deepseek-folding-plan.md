# OK-11 Folding Plan — DeepSeek Harness lessons into OpenKai

**Date:** 2026-08-20 · **Status:** PROPOSED (was PARKED as OK-11-candidate; the CTO called
time on 2026-08-20) · **Source ADR:** research/2026-08-19-adr-ok9-deepseek-harness-cordis.md

The ADR describes the destination (Cordis-style plugin architecture). This plan is the
road there — sequenced so every increment ships value on its own and none of them breaks
the shipped surface. The rule from the ADR that disciplines the whole effort: **adopt the
principles, not the framework** — no Cordis dependency until Phase 3 proves we need it.

## What we actually take from DeepSeek (the adopted list)

From the ADR §3, ordered by value-per-disruption:

1. **Durable session log invariant** — "model-visible means logged". Already ~true
   (`SessionEvent` stream); the work is *enforcing* it as an invariant with a test.
2. **Waterfall events** — `tools/pre-execute`-style middleware interception (auth,
   telemetry, rate limiting) instead of hardcoded call chains.
3. **The inbox pattern** — one inbox into the turn driver; immediate vs deferred
   messages. Replaces the `steer()`/`prompt()` duality with a cleaner primitive.
4. **Turn enclosure** — a turn opens before its first input and closes once nothing
   is owed. Stronger than fire-and-forget; makes "did it finish?" a state query, not
   a guess. (0.1.9's settled row is the UI half; this is the model half.)
5. **Scoped registrations** — per-agent tool scopes so subagents carry their own
   tool sets (the `task` tool already approximates this).
6. **Plugin container** — every capability a replaceable plugin with revertible
   effects. The big one; done LAST because the earlier phases shape it correctly.

## Phases → epics (each ships independently)

### Phase 0 — contract tests first (E019, 0.1.9)
Pin today's behaviour so the refactors have a safety net:
- Session-log invariant test: every model-visible token/tool call appears in the
  session entries (assert over `SessionStore.readEntries` after a scripted turn).
- Turn lifecycle event order test (exists: `event-mapping` in tui.test.ts).
**Effort:** days. **Risk:** none — tests only.

### Phase 1 — waterfall events + inbox (E020, 0.1.10)
- `core/session/events.ts`: introduce the middleware chain (`next()` delegation) at
  the tool-execution seam — the permission gate becomes the FIRST middleware, not a
  hardcoded wrapper. Telemetry/redaction become middleware too.
- Inbox: `prompt()`, `steer()`, injected context, and abort all become inbox
  messages with a priority class. `InProcessTransport` internals change; the
  SessionTransport interface does NOT.
**Acceptance:** gate/telemetry order is middleware-configurable in tests; steer keeps
its semantics via the inbox; 100% suite green.

### Phase 2 — turn enclosure (E021, 0.1.11)
- The transport tracks open/close explicitly: `turn_begin` … `turn_end` is already
  the event pair; enclosure adds the *obligation ledger* (open tool calls, pending
  permission requests, queued steers) so "settled" is computed, not timed.
- The TUI's busy state keys off the ledger (no more `done`-flag watching).
**Acceptance:** a turn cannot report settled with an open tool call or an unanswered
permission request (test: kill the model mid-tool — the ledger shows the debt).

### Phase 3 — capability seams (E022, 0.1.12)
- Extract `core/lsp`, `core/mcp`, `core/memory`, `core/fusion` behind typed service
  keys (`ctx.lsp` etc. per the ADR table). No DI framework — a 100-line container
  with register/get/dependencies and cycle detection.
- **Decision gate:** by here we know whether the lightweight container suffices or
  Cordis earns its dependency. Evaluate Cordis v4 maturity then, not now.
**Acceptance:** each capability loads/unloads through the container in tests;
replacing `core/memory` with a stub needs zero changes elsewhere.

### Phase 4 — plugin container + hot reload (E023, 0.1.13)
- `PluginLoader` reading `~/.openkai/plugins.yml` (+ `.patch.yml`), revertible
  effects (`dispose()`), boot-time composition of the ADR's plugin table.
- Hot reload for the safe set (theme, status, models) — LSP/MCP reloads keep
  connections alive per the ADR's temporal-composability rule.
**Acceptance:** swap the theme plugin at runtime without dropping the session;
unload MCP and every MCP tool disappears from the registry cleanly.

## Explicitly not adopted

- **Cordis as a dependency in Phase 1–2** — young framework; the container decides.
- **Full plugin sandboxing** — third-party plugin trust is a KOS bundling question
  (ADR open question 3); deferred until KOS integration has a concrete requirement.
- **The dsh YAML profile format verbatim** — our config stays `config.json`-centred;
  plugins.yml maps to it, not the other way.

## Open questions carried from the ADR (now with owners)

1. Cordis-or-container → decision gate at Phase 3 (kai@openkai).
2. Fusion roles as plugin instances → design input to Phase 3 (ren@openkai: the
   panel is already multi-transport; plugin-ising it is mostly mechanical).
3. KOS plugin sharing → blocked on the KOS cutover handoff (main@openkai).
4. Plugin versioning across releases → Phase 4 design input (no third-party
   plugins before then, so this can wait).
