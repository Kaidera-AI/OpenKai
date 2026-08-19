/**
 * InProcessTransport — wraps a pi-agent-core {@link Agent} behind the
 * {@link SessionTransport} interface (D-P2-4, scope §3).
 *
 * `Agent.subscribe` listeners are bridged onto a {@link SessionEvent} stream
 * via the pure {@link mapAgentEvent} mapping. The transport owns `seq`
 * assignment (monotonic from 1) and `sessionId` injection. A bounded async
 * queue backs `events()` so a slow consumer never blocks the agent loop.
 *
 * Provider lane: OpenRouter through pi-ai (D-P2-2). The default model
 * catalogue comes from `../credentials.js` `defaultModels()` — builtinModels
 * backed by the persistent credential store. Without an injected `models`
 * collection the transport fails fast with a named error
 * ({@link MissingApiKeyError}) if the OpenRouter key is missing before any
 * network call.
 *
 * P4: the transport accepts an injected {@link Models} collection + provider
 * id so the TUI (and the faux-provider golden-frame tests) can drive the same
 * loop without forking it. When `models` is supplied the OpenRouter key
 * requirement is skipped — the caller owns provider auth (faux needs none).
 * The default path (no `models`) is unchanged so `openkai chat` is
 * byte-for-byte identical.
 */

import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentMessage, AgentTool, AgentEvent } from "@earendil-works/pi-agent-core";
import {
  COMPACTION_SUMMARY_PREFIX,
  COMPACTION_SUMMARY_SUFFIX,
  DEFAULT_COMPACTION_SETTINGS,
  estimateContextTokens,
  findCutPoint,
  generateSummaryWithUsage,
} from "@earendil-works/pi-agent-core";
import type { Message, Model } from "@earendil-works/pi-ai";
import type { Api } from "@earendil-works/pi-ai";
import type { Models } from "@earendil-works/pi-ai";
import { defaultModels } from "../credentials.js";
import { mapAgentEvent } from "./events.js";
import { gatedTools, readOnlyTools, bashTool } from "./tools.js";
import type { MutationHooks } from "./tools.js";
import { ShadowGit } from "../undo/shadow.js";
import type { CastConfig } from "../fusion/casts.js";
import { uuidv7 } from "@earendil-works/pi-ai";
import { shutdownMcp } from "./mcp.js";
import { shutdownLspClient } from "./lsp.js";
import { SessionPermissionGate, type PermissionGate, type PushPermissionEvent } from "./permission-gate.js";

/** The stripped `permission_request` payload the gate pushes onto the queue. */
type PermissionRequestPayload = PushPermissionEvent extends (event: infer E) => void ? E : never;
import type { SessionEvent, SessionTransport, SessionTransportOptions } from "./transport.js";

/** Default model: cheap tool-calling OpenRouter model from the bundled catalogue. */
export const DEFAULT_MODEL_ID = "nvidia/nemotron-3-nano-30b-a3b:free";

/** Error thrown when OPENROUTER_API_KEY is missing — caught by the CLI for a named exit. */
export class MissingApiKeyError extends Error {
  override readonly name = "MissingApiKeyError";
  constructor(provider: string, envVar: string) {
    super(`${provider} API key not found: set ${envVar} or export it in your environment.`);
  }
}

/** Options for constructing an {@link InProcessTransport}. */
export interface InProcessTransportOptions extends SessionTransportOptions {
  /** Override the read-only tool set (default: the P2 trio bound to cwd). */
  tools?: AgentTool<any>[];
  /**
   * Injected {@link Models} collection (P4). When supplied the transport
   * resolves the model from it via `getModel(provider, modelId)` and skips
   * the OpenRouter API-key requirement — the caller owns provider auth. Used
   * by the faux-provider golden-frame tests; production paths leave this
   * unset and use the built-in OpenRouter catalogue.
   */
  models?: Models;
  /**
   * Provider id to resolve the model under (default: `openrouter`). Ignored
   * when `models` is unset. Pairs with {@link models} for injection.
   */
  provider?: string;
  /**
   * Prior message entries to seed the agent transcript (P4 session resume).
   * Passed to the Agent as `initialState.messages` so a resumed session has
   * model context. Empty by default (fresh session).
   */
  initialMessages?: AgentMessage[];
  /**
   * P4b: enable the permission gate. When true the transport owns a
   * {@link SessionPermissionGate} and exposes the gated tool set
   * (write_file / edit_file / bash) behind {@link SessionTransport.respond}.
   * When false (default — the `openkai chat` v1-compat path) the transport
   * uses the read-only trio and `respond()` throws (no approval channel).
   */
  enablePermissions?: boolean;
  /**
   * Activity sink: every session event is also offered here (for the live
   * activity feed behind `openkai tail`). Fire-and-forget; never awaited.
   */
  onActivity?: (event: SessionEvent) => void;
  /**
   * Extra tools merged INTO the built-in set — never a replacement for it.
   * With the gate enabled they go through {@link gatedTools}' extraTools
   * slot; without it they append to the read-only set. This fixes the
   * "MCP replaces everything" bug: built-ins are always present.
   * For post-construction injection (e.g. gate-wired MCP proxies) use
   * {@link InProcessTransport.addExtraTools}.
   */
  extraTools?: AgentTool<any>[];
  /** Operator cast config (~/.openkai/config.json "casts") for the task tool's stage→model resolution. */
  castConfig?: CastConfig;
}

/**
 * A bounded async queue for bridging agent events to the consumer stream.
 * Control events (`permission_request`, `turn_end`, `session_end`, `error`)
 * ALWAYS land — the capacity cap applies to deltas/results only; silently
 * dropping a permission prompt deadlocks the run, and dropping turn/session
 * markers corrupts the consumer's state machine. When a droppable event IS
 * dropped, a one-time `error` marker is pushed so the consumer knows the
 * stream has a gap.
 */
class EventQueue {
  private readonly items: SessionEvent[] = [];
  private readonly waiters: Array<(item: SessionEvent | "done") => void> = [];
  private done = false;
  private readonly capacity: number;
  /** Set while an overflow episode is unacknowledged (queue hasn't drained). */
  private overflowMarked = false;

  constructor(capacity = 4096) {
    this.capacity = capacity;
  }

  push(item: SessionEvent): void {
    if (this.done) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(item);
      return;
    }
    // Kinds that must never be dropped, regardless of capacity.
    const isControl =
      item.kind === "permission_request" ||
      item.kind === "turn_end" ||
      item.kind === "session_end" ||
      item.kind === "error";
    if (this.items.length < this.capacity || isControl) {
      this.items.push(item);
      return;
    }
    // Dropped a droppable event — mark the gap once per overflow episode.
    if (!this.overflowMarked) {
      this.overflowMarked = true;
      this.items.push({
        sessionId: item.sessionId,
        seq: item.seq,
        kind: "error",
        message: "event queue overflow — intermediate deltas/results were dropped",
      });
    }
  }

  close(): void {
    this.done = true;
    for (const waiter of this.waiters.splice(0)) {
      waiter("done");
    }
  }

  async next(): Promise<SessionEvent | "done"> {
    if (this.items.length > 0) {
      const item = this.items.shift()!;
      // A drained queue ends the overflow episode — the next drop re-marks.
      if (this.items.length === 0) this.overflowMarked = false;
      return item;
    }
    if (this.done) return "done";
    return new Promise<SessionEvent | "done">((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

/**
 * In-process transport over a pi-agent-core {@link Agent}. The agent runs in
 * the same Node process; events flow through a bounded queue to the consumer.
 */
export class InProcessTransport implements SessionTransport {
  readonly sessionId: string;
  private currentModelId: string;
  private currentThinkingLevel: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" = "off";
  private readonly agent: Agent;
  private readonly queue: EventQueue;
  private seq = 0;
  private closed = false;
  /** P4b permission gate (undefined when permissions are disabled — v1 path). */
  private readonly gateInstance: SessionPermissionGate | undefined;
  private readonly shadow: ShadowGit | undefined;
  private readonly cwd: string;
  private readonly mutationHooks: MutationHooks | undefined;
  private readonly onActivity: ((event: SessionEvent) => void) | undefined;
  /** Stored tool sets for plan/act mode switching (E010). */
  private readonly fullTools: AgentTool<any>[];
  private readonly readOnlySet: AgentTool<any>[];
  private _planMode = false;
  /** The models collection the agent streams through (kept for compaction). */
  private readonly modelsCollection: Models;

  /** Stamp + push a permission_request event onto the session queue. */
  private emitPermissionEvent(e: PermissionRequestPayload): void {
    this.seq += 1;
    this.queue.push({
      ...e,
      sessionId: this.sessionId,
      seq: this.seq,
    } as SessionEvent);
  }

  constructor(options: InProcessTransportOptions) {
    this.sessionId = options.sessionId;
    this.currentModelId = options.modelId;

    const provider = options.provider ?? "openrouter";
    const injected = options.models !== undefined;

    // Register every built-in provider (incl. OpenRouter) backed by the
    // persistent credential store, and resolve the requested model from the
    // catalogue at runtime. When an injected `models` collection is supplied
    // (P4), use it as-is and skip the OpenRouter key requirement — the caller
    // owns provider auth.
    const models = options.models ?? defaultModels();
    this.modelsCollection = models;

    if (!injected && provider === "openrouter" && !process.env.OPENROUTER_API_KEY) {
      throw new MissingApiKeyError("OpenRouter", "OPENROUTER_API_KEY");
    }

    const model = models.getModel(provider, options.modelId);
    if (!model) {
      throw new Error(
        `Model "${options.modelId}" not found under provider "${provider}". ` +
          `Check the id (e.g. "${DEFAULT_MODEL_ID}") or the OPENKAI_MODEL / --model flag.`,
      );
    }

    // P4b: the permission gate. When enabled, the transport owns a
    // session-scoped gate and the gated tool set (write/edit/bash). When
    // disabled (the v1-compat `openkai chat` path) the read-only trio is used
    // and `respond()` is refused — exactly the "remote-approval banned"
    // guarantee, now explicit instead of by absence (scope §2).
    const enablePermissions = options.enablePermissions === true;
    this.queue = new EventQueue();
    this.onActivity = options.onActivity;
    this.cwd = options.cwd;
    this.gateInstance = enablePermissions
      ? new SessionPermissionGate({ cwd: options.cwd, pushEvent: (e) => this.emitPermissionEvent(e) })
      : undefined;
    // Inc 05: shadow-git undo. Snapshots fire after approval, before every
    // gated mutation (write/edit/bash), via the MutationHooks seam.
    this.shadow = this.gateInstance ? new ShadowGit(options.cwd) : undefined;
    this.mutationHooks = this.shadow
      ? {
          beforeMutation: async (tool, summary) => {
            await this.shadow?.snapshot(`before ${tool}: ${summary.slice(0, 120)}`);
          },
        }
      : undefined;
    // extraTools are MERGED into the built-in set (never a replacement):
    // through gatedTools' extraTools slot with the gate, appended to the
    // read-only set without it.
    const extras = options.extraTools ?? [];
    const tools = options.tools ?? (this.gateInstance
      ? gatedTools(options.cwd, this.gateInstance, this.mutationHooks, options.modelId, extras, options.castConfig)
      : [...readOnlyTools(options.cwd), ...extras]);
    this.fullTools = tools;
    this.readOnlySet = readOnlyTools(options.cwd);
    const systemPrompt =
      options.systemPrompt ??
      (this.gateInstance
        ? "You are OpenKai, a helpful coding assistant. Read tools: read_file, list_files, grep, glob, web_fetch. Memory: todo (shared project task list). Code intelligence: lsp (definition, references, hover, diagnostics, rename, symbols, code_actions -- use instead of grep for symbol-aware lookups). Structured edits: hashline_edit (read then PUT/CUT by line). Delegation: task (read-only subagent). Mutations: write_file, edit_file, bash -- these require operator approval; if denied, report it rather than retrying."
        : "You are OpenKai, a helpful coding assistant. Read-only tools: read_file, list_files, grep, glob, web_fetch, todo, lsp (code intelligence). Use them to inspect files when asked.");

    this.agent = new Agent({
      sessionId: options.sessionId,
      streamFn: (m, ctx, opts) => models.streamSimple(m, ctx, opts),
      initialState: {
        systemPrompt,
        model: model as Model<"openai-completions">,
        messages: options.initialMessages ?? [],
        thinkingLevel: "off",
        tools,
      },
      // Identity conversion: AgentMessage[] is already Message[] for standard roles.
      convertToLlm: (messages: AgentMessage[]): Message[] =>
        messages.filter(
          (m): m is Message =>
            "role" in m &&
            (m.role === "user" || m.role === "assistant" || m.role === "toolResult"),
        ),
    });

    // Bridge agent events onto the SessionEvent queue. `agent_end` emits
    // `session_end` — but the queue stays OPEN: the event stream is the
    // SESSION's stream, not one turn's. Closing on agent_end ended the
    // stream after the first turn, and the TUI (whose consume-loop ending
    // means quit) exited on first submit. The queue closes only on
    // close()/abort; print-mode consumers break on `session_end`.
    this.agent.subscribe((event: AgentEvent) => {
      for (const mapped of mapAgentEvent(event)) {
        this.seq += 1;
        const stamped = {
          ...mapped,
          sessionId: this.sessionId,
          seq: this.seq,
        } as SessionEvent;
        this.queue.push(stamped);
        this.onActivity?.(stamped);
      }
      return Promise.resolve();
    });
  }

  /** Whether plan mode is active (read-only tools only). */
  get planMode(): boolean { return this._planMode; }

  /** The session permission gate (undefined when permissions are disabled). */
  get gate(): SessionPermissionGate | undefined {
    return this.gateInstance;
  }

  /**
   * Toggle plan mode: swaps the agent's tool set between full and read-only,
   * AND flips the gate's plan-mode refusal so an in-flight turn whose tool
   * snapshot predates the toggle is still refused at the gate (fail-closed).
   */
  setPlanMode(on: boolean): void {
    if (this._planMode === on) return;
    this._planMode = on;
    this.agent.state.tools = on ? [...this.readOnlySet] : [...this.fullTools];
    this.gateInstance?.setPlanMode(on);
  }

  /**
   * Append tools to the live set post-construction (gate-wired MCP proxies —
   * the gate only exists after the transport is constructed, so discovery
   * runs second). Updates the agent's live tool set unless plan mode is on
   * (the swap back out of plan mode picks them up via {@link fullTools}).
   */
  addExtraTools(tools: AgentTool<any>[]): void {
    if (tools.length === 0) return;
    this.fullTools.push(...tools);
    if (!this._planMode) {
      this.agent.state.tools = [...this.fullTools];
    }
  }
  /** The active model id (mutable: `/model` switches mid-session). */
  get modelId(): string {
    return this.currentModelId;
  }

  /**
   * Switch the model for future turns (pi-agent-core: state.model is
   * forward-looking by contract). The picker resolves the Model from the
   * catalogue; this just applies it.
   */
  setModel(model: Model<Api>): void {
    this.agent.state.model = model as never;
    this.currentModelId = model.id;
  }

  /** Set the reasoning effort for future turns (off…max). */
  setThinkingLevel(level: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"): void {
    this.currentThinkingLevel = level;
    this.agent.state.thinkingLevel = level === "off" ? ("off" as never) : level;
  }

  get thinkingLevel(): string {
    return this.currentThinkingLevel;
  }

  /** Set the autonomy axis (no-op when the gate is disabled). */
  setAutonomy(level: "off" | "low" | "med" | "high"): void {
    this.gateInstance?.setAutonomy(level);
  }

  get autonomyLevel(): string {
    return this.gateInstance?.autonomyLevel ?? "off";
  }

  /**
   * Run a shell command through the SAME gate as model-driven bash (TUI
   * bash-mode, droid's `!` toggle): identical overlay, consent, and floor —
   * the operator's keystroke and the model's tool call are one trust path.
   * Throws when the gate is disabled (print mode).
   */
  async runBash(command: string): Promise<{ text: string; isError: boolean }> {
    if (!this.gateInstance) {
      throw new Error("bash mode requires the permission gate (TUI mode)");
    }
    const tool = bashTool(this.cwd, this.gateInstance, this.mutationHooks);
    const result = await tool.execute(uuidv7(), { command });
    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const isError = text.startsWith("Error") || text.startsWith("Permission denied");
    return { text, isError };
  }

  prompt(text: string): Promise<void> {
    // A closed transport never starts a run (K3: abort+close before prompt
    // raced a full LLM turn — agent.abort() is a no-op without an active run).
    if (this.closed) {
      return Promise.reject(new Error("transport is closed — prompt() refused"));
    }
    return this.agent.prompt(text);
  }

  steer(text: string): void {
    this.agent.steer({ role: "user", content: text, timestamp: Date.now() });
  }

  abort(): void {
    this.agent.abort();
    // Settle any tool awaiting approval — an aborted run must not leave a
    // gated tool hanging on a promise nobody will answer.
    this.gateInstance?.rejectAll("aborted");
  }

  /**
   * P4b: answer a {@link permission_request}. Implemented on this transport
   * only — the trust boundary (scope §2). When the permission gate is not
   * enabled (the v1-compat `openkai chat` path) this throws rather than
   * silently no-op'ing, so the "remote approval injection banned" guarantee is
   * an explicit refusal instead of being dropped.
   */
  respond(requestId: string, decision: "once" | "always" | "reject"): void {
    if (!this.gateInstance) {
      throw new Error(
        "respond() not supported: permission gate is not enabled on this transport. " +
          "Approval injection is only available on the in-process, operator-input path (scope §2).",
      );
    }
    this.gateInstance.respond(requestId, decision);
  }

  async *events(): AsyncIterable<SessionEvent> {
    for (;;) {
      const item = await this.queue.next();
      if (item === "done") return;
      yield item;
    }
  }

  // ── Context management (E004) ──────────────────────────────────────────
  getMessages(): AgentMessage[] {
    return this.agent.state.messages;
  }
  setMessages(messages: AgentMessage[]): void {
    this.agent.state.messages = messages;
  }
  getContextWindow(): number {
    return this.agent.state.model?.contextWindow ?? 0;
  }

  /**
   * LLM-summarising compaction (E017 contract #1 — replaces the naive
   * head+last-pair elision). The conversation before pi-agent-core's
   * `findCutPoint` cut (their `keepRecentTokens` discipline, splitting at a
   * turn boundary) is summarised by `generateSummaryWithUsage` — the
   * structured Goal/Progress/Decisions/Next-Steps checkpoint, or its
   * incremental UPDATE when `previousSummary` is passed. The context becomes
   * `[summaryMessage, ...retainedTail]`: the summary travels as a user-role
   * message mirroring pi's `createCompactionSummaryMessage` wire text, so
   * this transport's role-filtering `convertToLlm` keeps it.
   *
   * Returns the raw summary (persist it and pass it back next call for the
   * incremental path) plus estimated context tokens before/after. Returns
   * `undefined` when there is nothing worth compacting — fewer than two
   * messages, or a cut that would summarise nothing / elide nothing.
   */
  async compactSession(
    previousSummary?: string,
  ): Promise<{ summary: string; before: number; after: number } | undefined> {
    const messages = this.agent.state.messages;
    if (messages.length < 2) return undefined;

    const settings = DEFAULT_COMPACTION_SETTINGS;
    const before = estimateContextTokens(messages).tokens;

    // findCutPoint runs over pi-harness entries; only `type` and `message`
    // are read, so synthesise minimal message entries around our context.
    // (The harness Entry type is not in the package's exports map — this is
    // the structural slice the function consumes.)
    type CutPointEntry = {
      type: "message";
      id: string;
      seq: number;
      parentId: string | null;
      timestamp: number;
      message: AgentMessage;
    };
    const entries: CutPointEntry[] = messages.map((message, index) => ({
      type: "message",
      id: `ctx-${index}`,
      seq: index + 1,
      parentId: index === 0 ? null : `ctx-${index - 1}`,
      timestamp: 0,
      message,
    }));
    const cut = findCutPoint(entries as never, 0, entries.length, settings.keepRecentTokens);
    const historyEnd = cut.isSplitTurn ? cut.turnStartIndex : cut.firstKeptEntryIndex;
    // historyEnd === 0: nothing before the cut to summarise; === length:
    // the retained tail would be empty (a split-turn pathological cut).
    if (historyEnd <= 0 || historyEnd >= messages.length) return undefined;

    const result = await generateSummaryWithUsage(
      messages.slice(0, historyEnd),
      this.modelsCollection,
      this.agent.state.model,
      settings.reserveTokens,
      undefined,
      undefined,
      previousSummary,
    );
    if (!result.ok) throw result.error;

    const summaryMessage: AgentMessage = {
      role: "user",
      content: [
        {
          type: "text",
          text: COMPACTION_SUMMARY_PREFIX + result.value.text + COMPACTION_SUMMARY_SUFFIX,
        },
      ],
      timestamp: Date.now(),
    };
    this.agent.state.messages = [summaryMessage, ...messages.slice(historyEnd)];
    const after = estimateContextTokens(this.agent.state.messages).tokens;
    return { summary: result.value.text, before, after };
  }

  /**
   * Close the session: abort any active run, reject all pending approvals,
   * shut down MCP servers and the LSP client, then close the event queue.
   * A closed session never leaves a language server or MCP child running.
   */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.agent.abort();
    this.gateInstance?.rejectAll("session closed");
    shutdownMcp();
    shutdownLspClient();
    this.queue.close();
  }

  /**
   * Undo the most recent gated mutation: restore the work tree to the
   * previous shadow snapshot. Throws when permissions are disabled (no
   * shadow repo exists) or there is nothing to undo.
   */
  async undoLastMutation(): Promise<string> {
    if (!this.shadow) {
      throw new Error(
        "undo requires the permission gate (shadow-git tracks gated mutations only)",
      );
    }
    const restored = await this.shadow.undo();
    return restored.sha;
  }
}