/**
 * `openkai chat` — single-prompt print-mode chat (D-P2-6, scope §4).
 *
 * Wires the {@link InProcessTransport} (Agent over OpenRouter) to the local
 * {@link SessionStore} (JSONL v3 tree) and {@link CortexCheckpoint}
 * (debounced `POST /sessions/ingest` + `POST /log` lifecycle). Text deltas
 * stream to stdout; tool calls and usage are logged to stderr; the settled
 * transcript is persisted and checkpointed at turn settlement.
 *
 * Fail-fast contract: if `OPENROUTER_API_KEY` is missing the command exits 1
 * with a named error before any network or file I/O.
 */

import path from "node:path";
import {
  CortexClient,
  InProcessTransport,
  MissingApiKeyError,
  DEFAULT_MODEL_ID,
  SessionStore,
  CortexCheckpoint,
} from "@openkai/core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { providerKeyStatus, resolveProvider } from "./providers.js";

/** Options for the `chat` command. */
export interface ChatOptions {
  prompt: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
  project?: string;
  api?: string;
  agent?: string;
  /** Suppress non-delta stderr diagnostics. */
  quiet?: boolean;
}

/** Result of a chat run. */
export interface ChatResult {
  exitCode: number;
  sessionId: string;
  modelId: string;
  ingestResult?: { messages_inserted?: number };
}

const AGENT_NAME_DEFAULT = "openkai";

/** Run a single-prompt chat turn. */
export async function runChat(options: ChatOptions): Promise<ChatResult> {
  const provider = resolveProvider(options.provider);
  const modelId = options.model ?? process.env.OPENKAI_MODEL ?? (provider === "openrouter" ? DEFAULT_MODEL_ID : undefined);
  if (!modelId) {
    process.stderr.write(
      `ERROR: no default model for provider "${provider}" — pass --model <id> (or set OPENKAI_MODEL).\n`,
    );
    return { exitCode: 2, sessionId: "", modelId: "" };
  }
  const project = options.project ?? process.env.CORTEX_PROJECT ?? "openkai";
  const agent = options.agent ?? process.env.OPENKAI_AGENT ?? AGENT_NAME_DEFAULT;
  const cwd = process.cwd();

  // ── 1. Fail fast on missing provider credentials (named error, exit 1) ──
  const keyStatus = providerKeyStatus(provider);
  if (!keyStatus.configured) {
    process.stderr.write(
      `${provider} credentials not found: set ${keyStatus.needsKey ?? "the provider credentials"} or export them in your environment.\n`,
    );
    return { exitCode: 1, sessionId: "", modelId };
  }

  // ── 2. Local session store (JSONL v3 tree under .openkai/sessions/) ─────
  const store = new SessionStore();
  await store.ensure();
  const log = (msg: string): void => {
    if (!options.quiet) process.stderr.write(`[openkai] ${msg}\n`);
  };

  // ── 3. Cortex checkpoint + lifecycle events ────────────────────────────
  const cortex = new CortexClient({
    baseUrl: options.api,
    project,
    agent,
  });
  const checkpoint = new CortexCheckpoint({
    client: cortex,
    agent,
    sessionId: store.sessionId,
    sourcePath: path.resolve(store.filePath),
    provider,
    modelId,
    cwd,
    task: options.prompt.slice(0, 200),
  });

  // ── 4. Transport (Agent over OpenRouter) ───────────────────────────────
  let transport: InProcessTransport;
  try {
    transport = new InProcessTransport({
      sessionId: store.sessionId,
      modelId,
      provider,
      systemPrompt: options.systemPrompt,
      cwd,
    });
  } catch (error) {
    if (error instanceof MissingApiKeyError) {
      process.stderr.write(`${error.message}\n`);
      return { exitCode: 1, sessionId: store.sessionId, modelId };
    }
    throw error;
  }

  // ── 5. Emit the `started` lifecycle event ──────────────────────────────
  await checkpoint.logLifecycle(
    "started",
    `openkai chat started (model=${modelId}, session=${store.sessionId.slice(0, 8)})`,
  );
  log(`session ${store.sessionId} | model ${modelId}`);

  // ── 6. Persist the user prompt, then fire the agent turn ──────────────
  const userMsg: AgentMessage = {
    role: "user",
    content: options.prompt,
    timestamp: Date.now(),
  };
  await store.appendMessage(userMsg);

  // Start the agent turn (fire-and-track — events flow via subscribe).
  const promptPromise = transport.prompt(options.prompt);

  // ── 7. Consume the event stream concurrently with the agent run ────────
  let assistantText = "";

  const abort = new AbortController();
  process.on("SIGINT", () => abort.abort());
  process.on("SIGTERM", () => abort.abort());

  try {
    for await (const event of transport.events()) {
      switch (event.kind) {
        case "delta":
          if (event.field === "text") {
            assistantText += event.delta;
            process.stdout.write(event.delta);
          }
          break;
        case "tool_call":
          log(`tool_call: ${event.toolName}`);
          break;
        case "tool_result": {
          const summary =
            typeof event.result === "string"
              ? event.result.slice(0, 120)
              : JSON.stringify(event.result).slice(0, 120);
          log(`tool_result: ${event.toolName} → ${event.isError ? "error" : "ok"} ${summary}`);
          break;
        }
        case "turn_end": {
          // Persist the settled assistant message.
          if (assistantText.length > 0) {
            const assistantMsg: AgentMessage = {
              role: "assistant",
              content: [{ type: "text", text: assistantText }],
              timestamp: Date.now(),
            } as AgentMessage;
            await store.appendMessage(assistantMsg);
            assistantText = "";
          }
          // Checkpoint settled entries to Cortex (debounced).
          const entries = await store.readEntries();
          checkpoint.record(entries);
          break;
        }
        case "session_end":
          break;
        case "error":
          log(`error: ${event.message}`);
          break;
        // "connected" is emitted but we already fired the prompt; no action.
        default:
          break;
      }
    }
  } catch (error) {
    log(`run failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Ensure the prompt promise settled (it should have resolved by now).
  await promptPromise.catch(() => undefined);

  // ── 8. Flush checkpoint + emit `stopped` lifecycle ─────────────────────
  const ingestResult = await checkpoint.flushNow();
  await checkpoint.logLifecycle(
    "stopped",
    `openkai chat stopped (session=${store.sessionId.slice(0, 8)})`,
  );
  await transport.close();

  if (ingestResult) {
    log(`ingested: ${JSON.stringify(ingestResult)}`);
  }

  return {
    exitCode: 0,
    sessionId: store.sessionId,
    modelId,
    ingestResult: ingestResult ?? undefined,
  };
}