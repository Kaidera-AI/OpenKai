# P2 Scope — OpenKai Agent Loop (single lane), Session Persistence, Transport Abstraction

**Date:** 2026-08-15
**Author:** kai@openkai (lead)
**Status:** SCOPED — ready for execution dispatch
**ADR anchor:** `2026-08-14-openkai-harness-tui-ADR.md` §6 P2 — "Single-lane agent loop through pi-ai with one provider; session persistence into Cortex (OK-4 trajectory tree); transport abstraction (OK-3)"
**Builds on:** P1 (commit `79a1a99`) — `@openkai/core` Cortex client (REST + `/events` SSE bridge), `@openkai/cli events --print`

---

## 1. Goal and non-goals

**Goal.** A user can run `openkai chat --prompt "…"` and hold a single-lane conversation with one LLM through the pinned pi-ai provider layer; the run's events stream through one transport-abstracted interface; the session persists as a branchable trajectory tree and checkpoints into Cortex memory — all verifiable live.

**Non-goals (ADR §5 and sequencing discipline).**
- No TUI chrome (P4). `chat` is print-mode: streamed text on stdout.
- No fusion / multi-model (P3). One provider, one model, one lane.
- No tools beyond a minimal read-only set for the loop to call; no permission engine (P4).
- No HTTP+SSE session server. P2 delivers the transport *abstraction* with the in-process implementation; the network transport lands when the TUI needs headless attach (P4).
- No new Cortex endpoints. Persistence reuses `/sessions/ingest`, `/save-chat/{agent}`, `/log` (verified present, kaidera-os `.agents/api/main.py`).
- No performance claims without a reproducer script (standing rule).

## 2. Decisions (grounded, not from memory)

**D-P2-1 — Agent loop: ADOPT `@earendil-works/pi-agent-core@0.84.2` (pin, exact).**
Findings verdict (`2026-08-14-pi-omp-findings.md` §5): "Adapt pattern / optionally adopt — adopting buys parallel tool execution + compaction hooks for free." Verified on npm: 0.84.2 exists, pure-TS deps only (`diff`, `yaml`, `ignore`, `typebox`, `@earendil-works/pi-telemetry`), exports `.` + `./node`. Verified API surface (`dist/agent.d.ts`): `Agent` with `prompt(input|string)`, `steer`, `followUp`, `subscribe(listener)`, `abort`, `waitForIdle`, `continue`, queue management; `agentLoop`/`runAgentLoop` function forms; compaction harness (`compact`, `prepareCompaction`, retainedTail machinery); telemetry. This is the supported embedder layer — the ADR's "pi-agent-core pattern" resolves to the package itself, keeping the loop's event taxonomy 1:1 with KOS's normalised event contract.

**D-P2-2 — Provider lane: OpenRouter through pi-ai.** One API key (`OPENROUTER_API_KEY`), already the local Cortex embed/rerank lane (health evidence 2026-08-15). pi-ai's OpenRouter provider is bundled (`KnownProvider` includes `openrouter`, verified in installed `pi-ai/dist/types.d.ts`). Model id is configuration, not code: `OPENKAI_MODEL` env, else CLI `--model`; the execution handoff picks the default from pi-ai's bundled catalogue with the constraint *cheap + tool-calling + OpenRouter-available* and records the pick in the return.

**D-P2-3 — Session persistence: pi JSONL v3 tree locally + idempotent Cortex checkpoints (OK-4).**
- **Local trajectory tree:** pi session-format v3 (`id`/`parentId` branching, compaction entries carrying `retainedTail`, `custom` entries for extension state) written under `.openkai/sessions/` (gitignored). pi-agent-core's session + compaction harness supplies the mechanics; OpenKai owns the directory layout.
- **Cortex checkpoints:** `POST /sessions/ingest` — atomic 4-table write, **idempotent on `session_uuid`** (delete + bulk insert), fields verified: `session_uuid, agent, task, source_path, provider, cwd, git_branch, source_kind, metadata, messages[]`. Called at turn settlement (after `agent_end`, debounced) and on session close, so Cortex always holds the full session to the last settled turn. `POST /log` emits lifecycle events (`started`, `stopped`) onto `team_events` — visible through the P1 stream.
- E015's run_span mining stays KOS-side over the ingested messages; OpenKai does not write run_span directly.

**D-P2-4 — Transport abstraction: one `SessionTransport` interface, in-process implementation (OK-3).**
The CLI (later the TUI) codes against:
```ts
interface SessionTransport {
  prompt(text: string): Promise<void>;
  steer(text: string): void;
  abort(): void;
  events(): AsyncIterable<SessionEvent>;
  close(): Promise<void>;
}
```
`SessionEvent` unifies text/thinking deltas behind one frame with a `field` discriminator (opencode's field-addressed delta pattern, OK-3): `{sessionId, seq, kind: "delta", field: "text"|"thinking", partId, delta}`, plus `tool_call`, `tool_result`, `usage`, `turn_end`, `error`, `session_end`. Ascending `seq` per session; `session.connected`-equivalent first frame; events also bridged onto Cortex `team_events` at coarse granularity (turn lifecycle only — never per-token, the event store is not a token firehose).
`InProcessTransport` wraps `Agent.subscribe`. The interface is deliberately `fetch`+`EventSource`-shaped so `HttpSseTransport` drops in later without consumer changes.

**D-P2-5 — Tools for P2: read-only trio.** `read_file`, `list_files`, `grep` — enough for the loop to exercise tool-calling end-to-end. No write/bash until the permission engine exists (P4); the honest-posture rule (ADR §5.6) applies: execution is not sandboxed, and P2 simply doesn't expose mutation.

## 3. Package changes

```
packages/core/src/
  session/
    index.ts            — barrel
    transport.ts        — SessionTransport, SessionEvent taxonomy (D-P2-4)
    local-transport.ts  — InProcessTransport over pi-agent-core Agent
    events.ts           — AgentEvent → SessionEvent mapping (incl. field-addressed deltas)
  persist/
    index.ts            — barrel
    session-store.ts    — JSONL v3 tree writer under .openkai/sessions/ (id/parentId, retainedTail, custom)
    cortex-checkpoint.ts— session → SessionIngest mapper + debounced POST /sessions/ingest, /log lifecycle
packages/cli/src/
  index.ts              — add `chat` + `sessions` commands (events untouched)
  chat.ts               — print-mode chat: streams SessionEvents to stdout, /steer via stdin later (P2: single prompt or --continue)
```

Dependencies: add `@earendil-works/pi-agent-core` `0.84.2` (exact) to `@openkai/cli` (or core if session/ lives there — it does; add to core and re-export through core for cli). `pi-tui` stays pinned, unused until P4. `.gitignore` gains `.openkai/`.

## 4. CLI surface (P2)

```
openkai chat --prompt "…" [--model <id>] [--session <id>] [--cwd <dir>]
    Streams one turn (or resumes --session) to stdout: text deltas as text,
    thinking dimmed (TTY) / `[thinking]` lines (pipe), tool calls as
    `tool: name(args)` lines, final usage line to stderr.
openkai sessions list
    Lists local session trees (id, started, turns, model) from .openkai/sessions/.
openkai sessions show <id>
    Prints the tree (branches, compaction entries) for inspection.
```

## 5. Verification (acceptance)

1. `npm run build && npm run typecheck` green from clean.
2. Live e2e: `OPENROUTER_API_KEY=… openkai chat --prompt "Reply with exactly: OPENKAI-P2-E2E"` prints the reply end-to-end; exit 0.
3. Trajectory: after the run, `.openkai/sessions/` contains the session JSONL v3 tree (inspect: `id`/`parentId` links, message entries).
4. Cortex checkpoint: the session is visible through `POST /sessions/ingest` evidence — `cortex-search "OPENKAI-P2-E2E"` returns the ingested message row (embedding/backfill lag is acceptable; the ingest API response itself is the primary proof).
5. Lifecycle: `openkai events --print` (P1) renders the run's `started`/`stopped` team_events.
6. Auth failure path: missing `OPENROUTER_API_KEY` fails fast with a named error, exit 1.

## 6. Execution dispatch

Single handoff to **bob@openkai** (full-stack-developer; KOS automatic-handoff lane, decision logged 2026-08-15): implement §3–§4, verify §5, return with build output + live e2e evidence + chosen default model. kai reviews the return against this scope; ren (CPO) is outside the auto lane and reviews at phase boundaries per the founding handoff pattern.

## 7. Risks

- **pi-agent-core drift**: pinned exact 0.84.2; namespace migration upstream is watched (ADR risk 1). Mitigation: shrinkwrap/lockfile already in repo.
- **Ingest payload size on long sessions**: full-session re-ingest is idempotent but O(session) per checkpoint. Acceptable at P2 scale; if hot, switch to turn-windowed `source_kind` shards — flagged as a follow-up, not built now.
- **Tool-call event mapping**: pi-ai's `AssistantMessageEvent` taxonomy is verified, but pi-agent-core's `AgentEvent` shape was read from type declarations only; execution verifies the runtime shape before mapping (first task in the handoff).
