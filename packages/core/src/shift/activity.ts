/**
 * Shift — routing event types and the redacting activity sink (E002 Inc 02).
 *
 * Routing events (stage classified, model selected, fallback triggered, budget
 * hit) flow to `.openkai/activity.jsonl` through the SAME seam that session
 * events use: the `onActivity` callback wired in
 * {@link packages/core/src/session/local-transport.ts} → `appendActivity` in
 * `packages/cli/src/tail.ts`. This module provides the event shape and a
 * redacting wrapper — so a new routing path never writes to the activity log
 * directly, bypassing the sanitiser.
 *
 * SECURITY (F7/F6c class): every string field on a routing event is passed
 * through {@link redactSecrets} BEFORE it reaches the sink. A provider error
 * that echoes an API key back in a 401/429 body is redacted at this boundary,
 * not merely "somewhere in the tree" — the reproducer in the test suite proves
 * the redaction fires on this exact path.
 *
 * The PRODUCTION path is: ShiftRouter → createRedactingSink (core-side
 * redaction) → the caller's sink, which in production is `appendActivity`
 * (the existing seam in tail.ts) → `redactStrings` (CLI-side belt-and-braces
 * redaction) → activity.jsonl. Both layers fire; the reproducer proves it.
 */

import { redactSecrets } from "../secrets.js";
import type { Stage } from "./stages.js";

/** A routing decision event — emitted when a stage is routed to a model. */
export interface RoutingEvent {
  /** Event discriminator — always one of the routing kinds. */
  kind: "routing" | "fallback" | "routing_error";
  /** The stage this routing decision applies to. */
  stage: Stage;
  /** The model id selected for this stage (absent on terminal errors). */
  model?: string;
  /** The provider id for this model. */
  provider?: string;
  /**
   * Zero-based position in the fallback chain (0 = primary). Present on
   * `routing` and `fallback` events.
   */
  attempt?: number;
  /** Human-readable reason (classification basis, error summary, etc.). */
  reason?: string;
  /** Token usage from a successful call (present on `routing` when known). */
  usage?: { totalTokens?: number };
}

/** The activity sink shape — same callback convention as `onActivity`. */
export type ActivitySink = (event: RoutingEvent) => void;

/**
 * Redact every string field on a routing event. Returns a NEW object — the
 * original is never mutated. This is the security boundary: a provider error
 * body that contains a secret-shaped span (`sk-…`, `nvapi-…`, etc.) is
 * replaced with `[redacted-secret]` before the event reaches the file or the
 * `openkai tail` renderer.
 *
 * Non-string fields (numbers, booleans) pass through untouched.
 */
export function redactRoutingEvent(event: RoutingEvent): RoutingEvent {
  return {
    kind: event.kind,
    stage: event.stage,
    model: event.model !== undefined ? redactSecrets(event.model) : undefined,
    provider: event.provider !== undefined ? redactSecrets(event.provider) : undefined,
    attempt: event.attempt,
    reason: event.reason !== undefined ? redactSecrets(event.reason) : undefined,
    usage: event.usage,
  };
}

/**
 * Create a redacting activity sink. The sink applies {@link redactRoutingEvent}
 * to every event before forwarding it to the underlying sink — so even if a
 * caller forgets to redact, the boundary holds.
 *
 * The underlying sink in production is the same `appendActivity` call that
 * session events use (wired in `runtime.ts`/`fuse.ts`), ensuring routing
 * events land in the same `.openkai/activity.jsonl` file through the same
 * writer — never a parallel one.
 */
export function createRedactingSink(sink: ActivitySink): ActivitySink {
  return (event: RoutingEvent) => {
    sink(redactRoutingEvent(event));
  };
}