/**
 * `openkai chat` — single-prompt print-mode chat (D-P2-6, scope §4).
 *
 * Wires the {@link InProcessTransport} (Agent over OpenRouter) to the local
 * {@link SessionStore} (JSONL v3 tree) and {@link CortexCheckpoint}
 * (debounced `POST /sessions/ingest` + `POST /log` lifecycle). Text deltas
 * stream to stdout; tool calls and usage are logged to stderr; the settled
 * transcript is persisted and checkpointed at turn settlement.
 *
 * The permission gate runs here too (E017 pick 7): a persisted
 * `tools.approval.<tool> = "allow"` override in ~/.openkai/config.json
 * pre-approves a gated tool for headless/CI runs; anything else that would
 * prompt is auto-rejected with the actionable {@link headlessApprovalError}
 * text (no interactive approval channel exists in print mode).
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
} from "@kaidera/openkai-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { readToolApprovals } from "./config.js";
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

/**
 * The actionable headless-approval error (E017 pick 7, omp's no-UI pattern):
 * names the tool, the exact config key that pre-approves it, and the
 * autonomy alternative. Printed to stderr when the gate would ask but this
 * print-mode run has no approval channel to ask through.
 */
export function headlessApprovalError(toolName: string): string {
  return (
    `Tool "${toolName}" requires approval, but this run is headless — no approval channel is available.\n` +
    `Options:\n` +
    `  1. Persist an override: add "tools": { "approval": { "${toolName}": "allow" } } to ~/.openkai/config.json\n` +
    `  2. Raise the autonomy axis: run interactively and /autonomy high (auto-approves every gated tool)\n` +
    `  3. Run interactively (\`openkai\`) to approve the call in the permission overlay`
  );
}

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
  // E017 pick 7: the gate is enabled in print mode too, so a persisted
  // `tools.approval.<tool> = "allow"` override (config.json) unblocks
  // headless/CI runs. Anything that still resolves to `ask` is auto-rejected
  // below with the actionable headless error (no approval channel exists here).
  let transport: InProcessTransport;
  try {
    transport = new InProcessTransport({
      sessionId: store.sessionId,
      modelId,
      provider,
      systemPrompt: options.systemPrompt,
      cwd,
      enablePermissions: true,
    });
    // Consult the persisted per-tool policy live (config edits mid-run apply).
    transport.gate?.setToolPolicySource(() => readToolApprovals());
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
  // A failed turn (error event from the settled assistant message, or the
  // stream itself throwing) must surface as a non-zero exit — the checkpoint
  // flush below still runs either way.
  let turnFailed = false;

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
        case "permission_request":
          // Headless: nothing can answer the prompt. Reject immediately and
          // tell the operator exactly how to unblock the tool (omp pattern).
          process.stderr.write(`${headlessApprovalError(event.toolName)}\n`);
          transport.respond(event.requestId, "reject");
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
          // The transport stream stays open across turns now — print mode
          // exits explicitly at the end of its single turn.
          await transport.close();
          break;
        case "error":
          log(`error: ${event.message}`);
          turnFailed = true;
          break;
        // "connected" is emitted but we already fired the prompt; no action.
        default:
          break;
      }
    }
  } catch (error) {
    log(`run failed: ${error instanceof Error ? error.message : String(error)}`);
    turnFailed = true;
  }

  // Ensure the prompt promise settled (it should have resolved by now); a
  // rejection here is a failed turn even if no error event surfaced.
  await promptPromise.catch(() => {
    turnFailed = true;
  });

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
    exitCode: turnFailed ? 1 : 0,
    sessionId: store.sessionId,
    modelId,
    ingestResult: ingestResult ?? undefined,
  };
}