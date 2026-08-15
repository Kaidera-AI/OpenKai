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
 */

import type { Usage } from "@earendil-works/pi-ai";

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
  | { sessionId: string; seq: number; kind: "session_end"; messageCount: number };

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
  /** Release transport resources (flush buffers, close streams). */
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