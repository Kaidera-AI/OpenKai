/**
 * Transport abstraction for the OpenKai agent loop (OK-3, D-P2-4).
 *
 * The CLI (later the TUI) codes against one {@link SessionTransport}
 * interface. The in-process implementation ({@link InProcessTransport}) wraps
 * a pi-agent-core `Agent`; a network `HttpSseTransport` drops in later without
 * consumer changes because the interface is deliberately `fetch`+
 * `EventSource`-shaped.
 *
 * {@link SessionEvent} unifies text/thinking deltas behind one frame with a
 * `field` discriminator (opencode's field-addressed delta pattern): a delta is
 * addressed by `field` + `partId` (the assistant-message content index), so a
 * renderer can place text and reasoning into separate regions without
 * re-parsing the whole partial message. Ascending `seq` per session gives a
 * monotonic order even across concurrent tool executions.
 *
 * Protocol id: `openkai.session.v2` (P4b). v2 adds a `permission_request`
 * outbound event + the {@link SessionTransport.respond} inbound method — the
 * approval channel that was "banned by absence" in v1 is now an explicit
 * refusal boundary. v1 consumers (`openkai chat`, `events --print`) keep
 * working: a client that ignores `permission_request` still sees a coherent
 * stream (scope §2).
 */

import type { Usage } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

/** Session-scoped identifier for one delta stream (text or thinking). */
export type DeltaField = "text" | "thinking";

/** Token-usage snapshot emitted at turn settlement. */
export interface UsageSnapshot {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

/** Maps a pi-ai {@link Usage} into the OpenKai snapshot shape. */
export function toUsageSnapshot(usage: Usage): UsageSnapshot {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: usage.cost,
  };
}


/**
 * Discriminated preview payload for a {@link permission_request} event (scope
 * §2). The renderer branches on `kind`; the engine never formats display
 * strings. `diff` covers file mutations, `command` covers bash.
 */
export type PermissionPreview =
  | { kind: "diff"; path: string; before: string; after: string }
  | { kind: "command"; command: string; cwd: string };

/**
 * Unified event protocol for one agent session. Every variant carries
 * `sessionId` and a monotonic `seq` so a consumer can order, dedupe, or replay
 * the stream without transport-specific knowledge.
 */
export type SessionEvent =
  /**
   * First frame — the session is connected and ready to emit. The
   * `session.connected`-equivalent synthesised from the validated agent start.
   */
  | { sessionId: string; seq: number; kind: "connected" }
  /** A field-addressed incremental text/thinking delta. */
  | {
      sessionId: string;
      seq: number;
      kind: "delta";
      field: DeltaField;
      /** Assistant-message content index addressing this delta stream. */
      partId: number;
      delta: string;
    }
  /** A tool call was dispatched for execution. */
  | {
      sessionId: string;
      seq: number;
      kind: "tool_call";
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  /** A tool call finished execution. */
  | {
      sessionId: string;
      seq: number;
      kind: "tool_result";
      toolCallId: string;
      toolName: string;
      result: unknown;
      isError: boolean;
    }
  /** Usage snapshot emitted at turn settlement (after the assistant message). */
  | {
      sessionId: string;
      seq: number;
      kind: "usage";
      usage: UsageSnapshot;
    }
  /** A turn finished — the assistant message and any tool results are settled. */
  | { sessionId: string; seq: number; kind: "turn_end" }
  /** An error occurred during the run. The session may still emit `session_end`. */
  | { sessionId: string; seq: number; kind: "error"; message: string }
  /** The run finished. `messages` is the full settled transcript. */
  | { sessionId: string; seq: number; kind: "session_end"; messageCount: number }
  /**
   * P4b (protocol v2): a gated tool is about to execute and needs approval.
   * Emitted *before* the tool runs; the consumer answers via
   * {@link SessionTransport.respond}. A consumer that ignores it (v1 clients)
   * simply never answers — the tool then blocks on approval (or, for the
   * non-local path, the transport refuses to accept an answer at all).
   */
  | {
      sessionId: string;
      seq: number;
      kind: "permission_request";
      /** Correlates with the {@link SessionTransport.respond} `requestId`. */
      requestId: string;
      /** The tool call awaiting approval. */
      toolCallId: string;
      toolName: string;
      args: unknown;
      /** Renderer-facing preview (the engine never formats display strings). */
      preview: PermissionPreview;
      /** Short human reason from the policy engine, e.g. `ask — default for write_file`. */
      rule: string;
    };

/**
 * The consumer-facing transport surface. Both the in-process and the
 * (future) network transport implement this so the CLI/TUI never branches on
 * transport kind.
 */
export interface SessionTransport {
  /** Start a new turn from a user prompt. */
  prompt(text: string): Promise<void>;
  /** Inject a steering message after the current assistant turn (best-effort). */
  steer(text: string): void;
  /** Abort the current run, if one is active. */
  abort(): void;
  /** Ordered event stream for this session. */
  events(): AsyncIterable<SessionEvent>;
  /**
   * P4b (protocol v2): answer a {@link permission_request} for `requestId`.
   *
   * **Trust boundary (mandatory, scope §2):** this is implemented on
   * {@link InProcessTransport} ONLY — the approval decision is injected
   * in-process, where the operator's input is the trust root. A network
   * transport MUST NOT accept approvals without authentication; it must
   * `throw` rather than silently no-op. The v1 "remote approval injection
   * banned by absence" guarantee becomes an explicit refusal, not a dropped
   * one. `always` is **session-scoped in memory only** — persisting it to disk
   * is a policy decision out of scope for this slice (scope §9).
   */
  respond(requestId: string, decision: "once" | "always" | "reject"): void;
  /**
   * Context management (E004): the conversation messages. `/clear` resets
   * these, `/compact` trims them, `/shake` strips heavy content, `/context`
   * reads the count. An in-process transport returns the live agent state;
   * a network transport returns its cached copy.
   */
  getMessages(): AgentMessage[];
  /** Replace the conversation messages (the `/clear` context reset). */
  setMessages(messages: AgentMessage[]): void;
  /** The active model's context window (tokens), or 0 when unknown. */
  getContextWindow(): number;
  close(): Promise<void>;
}

/** Options shared by transport constructors. */
export interface SessionTransportOptions {
  /** OpenKai session id (also the Cortex `session_uuid`). */
  sessionId: string;
  /** Model id for the run, e.g. `"google/gemini-2.5-flash-lite"`. */
  modelId: string;
  /** System prompt for the run. */
  systemPrompt?: string;
  /** Working directory the read-only tools operate within. */
  cwd: string;
}