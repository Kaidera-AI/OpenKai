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
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { Models } from "@earendil-works/pi-ai";
import { mapAgentEvent } from "./events.js";
import { readOnlyTools } from "./tools.js";
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
  readonly modelId: string;
  private readonly agent: Agent;
  private readonly queue: EventQueue;
  private seq = 0;
  private closed = false;

  constructor(options: InProcessTransportOptions) {
    this.sessionId = options.sessionId;
    this.modelId = options.modelId;

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

    const tools = options.tools ?? readOnlyTools(options.cwd);
    const systemPrompt =
      options.systemPrompt ??
      "You are OpenKai, a helpful coding assistant. Use the read-only tools (read_file, list_files, grep) when asked to inspect files.";

    this.queue = new EventQueue();

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

    // Bridge agent events onto the SessionEvent queue. When the agent emits
    // `agent_end` we push the `session_end` event and then close the queue so
    // the `events()` generator terminates naturally without an external close().
    this.agent.subscribe((event: AgentEvent) => {
      for (const mapped of mapAgentEvent(event)) {
        this.seq += 1;
        this.queue.push({
          ...mapped,
          sessionId: this.sessionId,
          seq: this.seq,
        } as SessionEvent);
      }
      // After agent_end, close the queue so the consumer's for-await ends.
      if (event.type === "agent_end") {
        this.queue.close();
      }
      return Promise.resolve();
    });
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
}