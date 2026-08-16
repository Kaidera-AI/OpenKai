/**
 * InProcessTransport — wraps a pi-agent-core {@link Agent} behind the
 * {@link SessionTransport} interface (D-P2-4, scope §3).
 *
 * `Agent.subscribe` listeners are bridged onto a {@link SessionEvent} stream
 * via the pure {@link mapAgentEvent} mapping. The transport owns `seq`
 * assignment (monotonic from 1) and `sessionId` injection. A bounded async
 * queue backs `events()` so a slow consumer never blocks the agent loop.
 *
 * Provider lane: OpenRouter through pi-ai (D-P2-2). The OpenRouter provider
 * reads `OPENROUTER_API_KEY` from the environment; the transport fails fast
 * with a named error ({@link MissingApiKeyError}) if that key is missing
 * before any network call.
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
import type { Message, Model } from "@earendil-works/pi-ai";
import type { Api } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { Models } from "@earendil-works/pi-ai";
import { mapAgentEvent } from "./events.js";
import { gatedTools, readOnlyTools, bashTool } from "./tools.js";
import type { MutationHooks } from "./tools.js";
import { ShadowGit } from "../undo/shadow.js";
import { uuidv7 } from "@earendil-works/pi-ai";
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
}

/** A bounded async queue for bridging agent events to the consumer stream. */
class EventQueue {
  private readonly items: SessionEvent[] = [];
  private readonly waiters: Array<(item: SessionEvent | "done") => void> = [];
  private done = false;
  private readonly capacity: number;

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
    if (this.items.length < this.capacity) {
      this.items.push(item);
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
      return this.items.shift()!;
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
  private readonly gate: SessionPermissionGate | undefined;
  private readonly shadow: ShadowGit | undefined;
  private readonly cwd: string;
  private readonly mutationHooks: MutationHooks | undefined;
  private readonly onActivity: ((event: SessionEvent) => void) | undefined;

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

    // Register every built-in provider (incl. OpenRouter) and resolve the
    // requested model from the OpenRouter catalogue at runtime. When an
    // injected `models` collection is supplied (P4), use it as-is and skip the
    // OpenRouter key requirement — the caller owns provider auth.
    const models = options.models ?? builtinModels();

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
    this.gate = enablePermissions
      ? new SessionPermissionGate({ cwd: options.cwd, pushEvent: (e) => this.emitPermissionEvent(e) })
      : undefined;
    // Inc 05: shadow-git undo. Snapshots fire after approval, before every
    // gated mutation (write/edit/bash), via the MutationHooks seam.
    this.shadow = this.gate ? new ShadowGit(options.cwd) : undefined;
    this.mutationHooks = this.shadow
      ? {
          beforeMutation: async (tool, summary) => {
            await this.shadow?.snapshot(`before ${tool}: ${summary.slice(0, 120)}`);
          },
        }
      : undefined;
    const tools = options.tools ?? (this.gate ? gatedTools(options.cwd, this.gate, this.mutationHooks) : readOnlyTools(options.cwd));
    const systemPrompt =
      options.systemPrompt ??
      (this.gate
        ? "You are OpenKai, a helpful coding assistant. You can read files (read_file, list_files, grep), edit files (write_file, edit_file), and run shell commands (bash). File edits and shell commands require operator approval — if one is denied, report that to the user rather than retrying."
        : "You are OpenKai, a helpful coding assistant. Use the read-only tools (read_file, list_files, grep) when asked to inspect files.");

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

  /**
   * Run a shell command through the SAME gate as model-driven bash (TUI
   * bash-mode, droid's `!` toggle): identical overlay, consent, and floor —
   * the operator's keystroke and the model's tool call are one trust path.
   * Throws when the gate is disabled (print mode).
   */
  async runBash(command: string): Promise<{ text: string; isError: boolean }> {
    if (!this.gate) {
      throw new Error("bash mode requires the permission gate (TUI mode)");
    }
    const tool = bashTool(this.cwd, this.gate, this.mutationHooks);
    const result = await tool.execute(uuidv7(), { command });
    const text = result.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const isError = text.startsWith("Error") || text.startsWith("Permission denied");
    return { text, isError };
  }

  prompt(text: string): Promise<void> {
    return this.agent.prompt(text);
  }

  steer(text: string): void {
    this.agent.steer({ role: "user", content: text, timestamp: Date.now() });
  }

  abort(): void {
    this.agent.abort();
  }

  /**
   * P4b: answer a {@link permission_request}. Implemented on this transport
   * only — the trust boundary (scope §2). When the permission gate is not
   * enabled (the v1-compat `openkai chat` path) this throws rather than
   * silently no-op'ing, so the "remote approval injection banned" guarantee is
   * an explicit refusal instead of being dropped.
   */
  respond(requestId: string, decision: "once" | "always" | "reject"): void {
    if (!this.gate) {
      throw new Error(
        "respond() not supported: permission gate is not enabled on this transport. " +
          "Approval injection is only available on the in-process, operator-input path (scope §2).",
      );
    }
    this.gate.respond(requestId, decision);
  }

  async *events(): AsyncIterable<SessionEvent> {
    for (;;) {
      const item = await this.queue.next();
      if (item === "done") return;
      yield item;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
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