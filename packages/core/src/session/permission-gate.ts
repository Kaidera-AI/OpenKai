/**
 * Permission gate (P4b scope §2 + §3) — the I/O orchestration layer around the
 * pure {@link evaluate} policy engine.
 *
 * The gate is what a gated tool calls before it is allowed to mutate disk or
 * run a shell command. Consultation order (E017 pick 7, omp approval.ts model
 * — deliberately revisiting the session-only-`always` decision, see the E017
 * agent-features dossier pick 7):
 *  1. plan mode — the outermost refusal (read-only; fail-closed);
 *  2. the policy engine via {@link evaluateWithReason} — `allow` approves and
 *     the deny FLOOR is terminal: no override below ever lifts a floor deny;
 *  3. the persisted per-tool policy (`tools.approval.<toolName>` in
 *     ~/.openkai/config.json, consulted live through the injected
 *     {@link ToolPolicySource}) — `"allow"` approves, `"deny"` refuses, a
 *     missing key means prompt-by-default. This layer sits ABOVE the autonomy
 *     axis, so a `"deny"` pin holds even at autonomy `high`;
 *  4. the autonomy axis (operator's live posture: med auto-approves in-cwd
 *     writes, high also bash);
 *  5. the session-scoped `always` cache — a prior `always` for the *same*
 *     call signature suppresses the re-prompt (scope §6 test);
 *  6. otherwise it emits a {@link permission_request} event (through the
 *     injected `pushEvent` callback) and awaits the matching {@link respond}
 *     call; an `always` answer is recorded in the in-memory cache.
 *
 * Persistence itself is the CLI's job (config.ts `readToolApprovals` /
 * `writeToolApproval`); the gate stays storage-agnostic — it is handed a
 * live {@link ToolPolicySource} and re-consults it per request, so a key
 * written mid-session (the overlay's "always (this project)" stop) takes
 * effect immediately.
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
 * answered blocks until the run is aborted — `abort()`/`close()` settle every
 * pending request as `reject` via {@link SessionPermissionGate.rejectAll}, so
 * a blocked tool unblocks as refused; it can never resolve to `allow` on its
 * own (fail-closed). Plan mode ({@link SessionPermissionGate.setPlanMode})
 * adds a gate-level read-only refusal covering in-flight turns whose tool
 * snapshot predates the plan/act toggle.
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { evaluateWithReason, resolveCanonical, type PermissionDecision } from "./permissions.js";
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

  /**
   * Plan mode (read-only): while on, every {@link request} that reaches the
   * gate is rejected without prompting. This covers in-flight turns whose
   * tool snapshot predates the plan/act toggle — the transport swaps the
   * tool set for the NEXT turn, but a tool already executing still calls
   * the gate, and the gate is the last line (fail-closed).
   */
  setPlanMode(on: boolean): void;

  /**
   * Settle every pending request as `reject` with `reason`. Called by the
   * transport on abort()/close() so a tool awaiting approval never hangs
   * past the run's lifetime.
   */
  rejectAll(reason: string): void;
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

/**
 * A persisted per-tool approval policy value (`tools.approval.<toolName>` in
 * ~/.openkai/config.json). The absence of a key means "prompt by default".
 */
export type ToolApprovalPolicy = "allow" | "deny";

/**
 * Live reader for the persisted per-tool policy map. Called on every gated
 * request (step 3 of the consultation order), so config edits — including
 * the permission overlay's "always (this project)" stop — take effect
 * without a restart. Storage lives in the CLI (config.ts); the gate only
 * knows this shape.
 */
export type ToolPolicySource = () => Record<string, ToolApprovalPolicy>;

/** Options for {@link SessionPermissionGate}. */
export interface SessionPermissionGateOptions {
  /** Working directory — the policy root and the diff preview base. */
  cwd: string;
  /** Transport callback that stamps + pushes the event onto the session queue. */
  pushEvent: PushPermissionEvent;
  /**
   * Persisted per-tool policy reader (E017 pick 7). Consulted after the deny
   * floor and BEFORE the autonomy axis; undefined means no persisted layer
   * (prompt-by-default everywhere the engine says `ask`).
   */
  toolPolicy?: ToolPolicySource;
}

/** Max lines kept per diff side (head + elision + tail); large diffs are truncated. */
const DIFF_MAX_LINES = 80;

/**
 * Session-scoped permission gate. The `always` cache lives in this instance
 * only — a new session gets a new transport → new gate → fresh prompts
 * (scope §6 `always`-scoping test). The per-tool POLICY layer is persisted
 * (via the injected {@link ToolPolicySource}; E017 pick 7 — omp's
 * `tools.approval.<tool>` model); the cache itself is never written to disk.
 */
export class SessionPermissionGate implements PermissionGate {
  private readonly cwd: string;
  private readonly pushEvent: PushPermissionEvent;
  /** Live reader for the persisted per-tool policy (config.json tools.approval). */
  private toolPolicy: ToolPolicySource | undefined;
  /** Pending approvals: requestId → resolver (payload carries the reject reason). */
  private readonly pending = new Map<
    string,
    (r: { d: "once" | "always" | "reject"; reason?: string }) => void
  >;
  /** Session-scoped `always` cache: toolName + args signature. In memory only. */
  private readonly alwaysCache = new Set<string>();
  /**
   * Plan mode (read-only): while on, every request is rejected without
   * prompting — the gate-side backstop for in-flight turns whose tool
   * snapshot predates the plan/act toggle.
   */
  private planMode = false;
  /**
   * The autonomy axis (droid's coarse visible layer over the fine rules):
   * off/low = default posture; med auto-approves in-cwd write/edit; high
   * auto-approves bash too. The deny FLOOR is terminal at every level.
   */
  private autonomy: "off" | "low" | "med" | "high" = "low";

  constructor(options: SessionPermissionGateOptions) {
    this.cwd = options.cwd;
    this.pushEvent = options.pushEvent;
    this.toolPolicy = options.toolPolicy;
  }

  /** Set / replace the persisted per-tool policy reader (post-construction wiring). */
  setToolPolicySource(source: ToolPolicySource | undefined): void {
    this.toolPolicy = source;
  }

  /** Set the autonomy axis (operator's live choice; default `low`). */
  setAutonomy(level: "off" | "low" | "med" | "high"): void {
    this.autonomy = level;
  }

  get autonomyLevel(): "off" | "low" | "med" | "high" {
    return this.autonomy;
  }

  /** Toggle plan mode: while on, every request is rejected (read-only). */
  setPlanMode(on: boolean): void {
    this.planMode = on;
  }

  /** Settle every pending request as reject — abort/close unblock path. */
  rejectAll(reason: string): void {
    for (const resolve of this.pending.values()) {
      resolve({ d: "reject", reason });
    }
    this.pending.clear();
  }

  async request(
    toolName: string,
    toolCallId: string,
    args: unknown,
    buildPreview: () => PermissionPreview | Promise<PermissionPreview>,
  ): Promise<PermissionOutcome> {
    // Plan mode is the outermost refusal: even an `allow`-by-policy call that
    // reaches the gate mid-toggle is refused (fail-closed, read-only).
    if (this.planMode) return { decision: "reject", reason: "plan mode — read-only" };

    const { decision, reason } = evaluateWithReason(toolName, args, this.cwd);
    if (decision === "allow") return { decision: "approve" };
    // The deny FLOOR is terminal — consulted before every override layer, so
    // neither a config `allow` nor autonomy `high` ever lifts it.
    if (decision === "deny") return { decision: "reject", reason };

    // Persisted per-tool policy (config.json tools.approval.<toolName>) —
    // consulted live so mid-session writes take effect. Sits above the
    // autonomy axis: a `deny` pin holds even at autonomy high, an `allow`
    // pre-approves even at autonomy off/low (the headless/CI unblock path).
    const policy = this.toolPolicy?.()[toolName];
    if (policy === "allow") return { decision: "approve" };
    if (policy === "deny") {
      return {
        decision: "reject",
        reason: `denied by tools.approval.${toolName} = "deny" in ~/.openkai/config.json`,
      };
    }

    // The autonomy axis (operator's live posture): med auto-approves in-cwd
    // file mutations; high also auto-approves bash. The floor already
    // rejected above — this never lifts a deny.
    if (this.autonomy === "high") return { decision: "approve" };
    if (this.autonomy === "med" && (toolName === "write_file" || toolName === "edit_file")) {
      return { decision: "approve" };
    }

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

    const outcome = await new Promise<{ d: "once" | "always" | "reject"; reason?: string }>(
      (resolve) => {
        this.pending.set(requestId, resolve);
      },
    );

    if (outcome.d === "reject") {
      return { decision: "reject", reason: outcome.reason ?? "rejected by operator" };
    }
    if (outcome.d === "always") this.alwaysCache.add(key);
    return { decision: "approve" };
  }

  respond(requestId: string, decision: "once" | "always" | "reject"): void {
    const resolve = this.pending.get(requestId);
    if (resolve) {
      this.pending.delete(requestId);
      resolve({ d: decision });
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
  // Canonical resolution: previews and the mutations they gate must target
  // the real location, not a lexical path routed through a symlink.
  return resolveCanonical(cwd, rawPath);
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
