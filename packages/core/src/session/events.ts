/**
 * AgentEvent → SessionEvent mapping (D-P2-4, scope §3).
 *
 * The pi-agent-core `AgentEvent` runtime shape was verified before this
 * mapping was written (scope §7 risk): `agent_start, turn_start,
 * message_start, message_update×N, message_end, turn_end, agent_end` for a
 * text turn, with `tool_execution_start/update/end` interleaved for tool
 * turns. `message_update` carries the pi-ai `AssistantMessageEvent` whose
 * `type` discriminates the field-addressed delta (`text_delta`/`thinking_delta`
 * with `contentIndex`) — that `contentIndex` becomes the `partId` on the
 * OpenKai `delta` event.
 *
 * The mapping is a pure function: `mapAgentEvent(event) → SessionEvent[]`.
 * The transport owns `seq` assignment (monotonic) and `sessionId` injection so
 * this module stays side-effect-free and testable.
 */

import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessageEvent, Usage } from "@earendil-works/pi-ai";
import type { SessionEvent, UsageSnapshot } from "./transport.js";

/**
 * Distributive Omit — `Omit` does not distribute over unions, so a plain
 * `Omit<SessionEvent, …>` collapses to the common keys only. This distributes
 * over each variant, preserving the discriminant fields.
 */
type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/** A SessionEvent with its `sessionId`/`seq` metadata stripped (caller fills them). */
export type StrippedSessionEvent = DistributiveOmit<SessionEvent, "sessionId" | "seq">;

/**
 * Map one {@link AgentEvent} to zero or more {@link StrippedSessionEvent}s.
 * The caller stamps `sessionId` and assigns `seq` (ascending from 1).
 *
 * Returns an array because `turn_end` emits a usage snapshot, an optional
 * `error` event (when the settled assistant message carries stopReason
 * "error" or an errorMessage), and a turn marker. The common case is exactly
 * one output event.
 */
export function mapAgentEvent(event: AgentEvent): StrippedSessionEvent[] {
  switch (event.type) {
    case "agent_start":
      return [{ kind: "connected" }];

    case "message_update":
      return mapAssistantMessageEvent(event.assistantMessageEvent);

    case "tool_execution_start":
      return [
        {
          kind: "tool_call",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
        },
      ];

    case "tool_execution_update":
      // Partial progress from a running tool (E017 contract #3 — the task
      // tool's live status/currentTool/toolCount/turnDepth rows).
      return [
        {
          kind: "tool_update",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          partial: event.partialResult,
        },
      ];

    case "tool_execution_end":
      return [
        {
          kind: "tool_result",
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          result: event.result,
          isError: event.isError,
        },
      ];

    case "turn_end": {
      const out: StrippedSessionEvent[] = [];
      // The settled assistant message carries final usage.
      if (event.message && "usage" in event.message && event.message.usage) {
        out.push({ kind: "usage", usage: toSnapshot(event.message.usage) });
      }
      // A turn that settled as a provider error (stopReason "error" or an
      // errorMessage on the assistant message) surfaces as an `error` event
      // so the renderer can show it — otherwise the failure is silent text.
      if (
        event.message &&
        "role" in event.message &&
        event.message.role === "assistant" &&
        (event.message.stopReason === "error" || event.message.errorMessage !== undefined)
      ) {
        out.push({
          kind: "error",
          message: event.message.errorMessage ?? `turn ended with stopReason "${event.message.stopReason}"`,
        });
      }
      out.push({ kind: "turn_end" });
      return out;
    }

    case "agent_end":
      return [{ kind: "session_end", messageCount: event.messages.length }];

    // turn_start, message_start, message_end carry no information the
    // print-mode consumer needs at P2 granularity.
    default:
      return [];
  }
}

/** Narrow a pi-ai {@link AssistantMessageEvent} into field-addressed deltas. */
function mapAssistantMessageEvent(event: AssistantMessageEvent): StrippedSessionEvent[] {
  switch (event.type) {
    case "text_delta":
      return [
        { kind: "delta", field: "text", partId: event.contentIndex, delta: event.delta },
      ];
    case "thinking_delta":
      return [
        { kind: "delta", field: "thinking", partId: event.contentIndex, delta: event.delta },
      ];
    // text_start/thinking_start/text_end/thinking_end/toolcall_*/start/done/error
    // are boundary markers; the print-mode renderer works off deltas only.
    default:
      return [];
  }
}

function toSnapshot(usage: Usage): UsageSnapshot {
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: usage.cost,
  };
}