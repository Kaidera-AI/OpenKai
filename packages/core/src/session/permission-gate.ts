/**
 * Permission gate (P4b scope §2 + §3) — the I/O orchestration layer around the
 * pure {@link evaluate} policy engine.
 *
 * The gate is what a gated tool calls before it is allowed to mutate disk or
 * run a shell command. It:
 *  1. resolves the policy decision via {@link evaluateWithReason};
 *  2. for `ask`, checks the session-scoped `always` cache — a prior `always`
 *     for the *same* call signature suppresses the re-prompt (scope §6 test);
 *  3. otherwise emits a {@link permission_request} event (through the injected
 *     `pushEvent` callback) and awaits the matching {@link respond} call;
 *  4. records an `always` decision in the in-memory cache (never on disk).
 *
 * The gate owns no queue of its own — it borrows the transport's event push so
 * the consumer's `events()` stream sees `permission_request` in order with
 * the surrounding `tool_call` / `tool_result` frames. {@link SessionPermissionGate}
 * is constructed by {@link InProcessTransport}, which delegates
 * {@link SessionTransport.respond} to {@link SessionPermissionGate.respond}.
 *
 * Deadlock safety (scope §9): the gate's `request()` awaits a promise stored in
 * a `Map`. The agent loop is paused at `await tool.execute(...)`, but the
 * transport's event pump (the consumer's `for await … events()` loop) keeps
 * draining because `pushEvent` is a synchronous non-blocking push and the
 * consumer runs concurrently. `respond()` is called from the operator input
 * path (a separate event-loop task), resolving the awaited promise — so the
 * pump drains while a tool awaits approval. There is no shared turn. No
 * auto-approving timeout is bolted on (scope §9): an approval that is never
 * answered simply blocks until the run is aborted — it can never resolve to
 * `allow` on its own (fail-closed).
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { evaluateWithReason, type PermissionDecision } from "./permissions.js";
import type { PermissionPreview } from "./transport.js";

/** A gated tool's request outcome. */
export type PermissionOutcome =
  /** Approved (either a one-shot `once` or a session-scoped `always` cache hit). */
  | { decision: "approve" }
  /** Refused — by policy (deny floor / out-of-cwd) or by the operator. */
  | { decision: "reject"; reason: string };

/** The surface a gated tool codes against. */
export interface PermissionGate {
  /**
   * Request approval for a gated tool call. `buildPreview` is invoked lazily —
   * only when the decision is `ask` and the cache misses — so an `allow` or
   * `deny` (e.g. a deny-floor `.env` write) never pays the preview cost.
   */
  request(
    toolName: string,
    toolCallId: string,
    args: unknown,
    buildPreview: () => PermissionPreview | Promise<PermissionPreview>,
  ): Promise<PermissionOutcome>;

  /** Answer a pending request (called from the operator input path). */
  respond(requestId: string, decision: "once" | "always" | "reject"): void;
}

/** A stripped event the gate asks the transport to stamp + push onto its queue. */
export type PushPermissionEvent = (event: {
  kind: "permission_request";
  requestId: string;
  toolCallId: string;
  toolName: string;
  args: unknown;
  preview: PermissionPreview;
  rule: string;
}) => void;

/** Options for {@link SessionPermissionGate}. */
export interface SessionPermissionGateOptions {
  /** Working directory — the policy root and the diff preview base. */
  cwd: string;
  /** Transport callback that stamps + pushes the event onto the session queue. */
  pushEvent: PushPermissionEvent;
}

/** Max lines kept per diff side (head + elision + tail); large diffs are truncated. */
const DIFF_MAX_LINES = 80;

/**
 * Session-scoped permission gate. The `always` cache lives in this instance
 * only — a new session gets a new transport → new gate → fresh prompts
 * (scope §6 `always`-scoping test). Nothing here is persisted to disk.
 */
export class SessionPermissionGate implements PermissionGate {
  private readonly cwd: string;
  private readonly pushEvent: PushPermissionEvent;
  /** Pending approvals: requestId → resolver. */
  private readonly pending = new Map<string, (d: "once" | "always" | "reject") => void>();
  /** Session-scoped `always` cache: toolName + args signature. In memory only. */
  private readonly alwaysCache = new Set<string>();

  constructor(options: SessionPermissionGateOptions) {
    this.cwd = options.cwd;
    this.pushEvent = options.pushEvent;
  }

  async request(
    toolName: string,
    toolCallId: string,
    args: unknown,
    buildPreview: () => PermissionPreview | Promise<PermissionPreview>,
  ): Promise<PermissionOutcome> {
    const { decision, reason } = evaluateWithReason(toolName, args, this.cwd);
    if (decision === "allow") return { decision: "approve" };
    if (decision === "deny") return { decision: "reject", reason };

    // `ask` — consult the session-scoped `always` cache first.
    const key = alwaysKey(toolName, args);
    if (this.alwaysCache.has(key)) return { decision: "approve" };

    // Emit the request and await the operator's answer. The preview is built
    // lazily (and may be async for file-reading diff previews) so an `allow`
    // or `deny` (e.g. a deny-floor write) never pays the preview cost.
    const requestId = randomUUID();
    const preview = await buildPreview();
    this.pushEvent({
      kind: "permission_request",
      requestId,
      toolCallId,
      toolName,
      args,
      preview,
      rule: reason,
    });

    const outcome = await new Promise<"once" | "always" | "reject">((resolve) => {
      this.pending.set(requestId, resolve);
    });

    if (outcome === "reject") return { decision: "reject", reason: "rejected by operator" };
    if (outcome === "always") this.alwaysCache.add(key);
    return { decision: "approve" };
  }

  respond(requestId: string, decision: "once" | "always" | "reject"): void {
    const resolve = this.pending.get(requestId);
    if (resolve) {
      this.pending.delete(requestId);
      resolve(decision);
    }
    // Unknown / already-resolved requests are ignored — fail-safe, never allow.
  }

  /** Test accessor: number of unanswered pending requests. */
  get pendingCount(): number {
    return this.pending.size;
  }
}

/** Stable signature for the `always` cache: tool name + canonical args. */
function alwaysKey(toolName: string, args: unknown): string {
  return `${toolName}|${stableStringify(args)}`;
}

/** Deterministic JSON stringification (stable key order) for cache keys. */
function stableStringify(value: unknown): string {
  try {
    if (value !== null && typeof value === "object") {
      return JSON.stringify(value, Object.keys(value).sort());
    }
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return JSON.stringify(value) ?? "undefined";
  }
}

// ── Diff preview builders (used by the gated tools) ───────────────────────

/** Read the current file content for a diff preview (empty if absent/unreadable). */
export async function readForPreview(absPath: string): Promise<string> {
  try {
    return await fs.readFile(absPath, "utf-8");
  } catch {
    return "";
  }
}

/** Resolve a tool `path` arg against the gate cwd. */
export function resolvePreviewPath(cwd: string, rawPath: string): string {
  return path.resolve(cwd, rawPath);
}

/** Truncate a diff side to head + elision + tail (scope §9 diff-rendering cost). */
export function truncateDiff(text: string, maxLines = DIFF_MAX_LINES): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  const half = Math.floor(maxLines / 2);
  const head = lines.slice(0, half);
  const tail = lines.slice(lines.length - half);
  return [...head, `…[${lines.length - maxLines} lines elided]`, ...tail].join("\n");
}

/**
 * Build a diff preview payload. Returns `before` / `after` so the overlay
 * renders token-coloured removed/added lines itself (scope §5); the engine
 * never formats display strings.
 */
export function buildDiffPreview(
  absPath: string,
  before: string,
  after: string,
): { kind: "diff"; path: string; before: string; after: string } {
  return {
    kind: "diff",
    path: absPath,
    before: truncateDiff(before),
    after: truncateDiff(after),
  };
}

/** Re-export the decision type for consumers. */
export type { PermissionDecision };
