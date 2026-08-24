/**
 * One-call completion over pi-ai's StreamFunction<Api> — the primitive every
 * fusion role, the synthesiser, and the gate validator share.
 *
 * The stream function is injectable: production passes an OpenRouter-backed
 * `models.streamSimple`, tests pass a `createFauxCore` scripted stream. No
 * provider logic lives here.
 */

import type {
  Api,
  Context,
  Model,
  OptionsForApi,
  StreamFunction,
  Usage,
} from "@oh-my-pi/pi-ai";
import { contentText, newRunId } from "./helpers.js";

export interface CompletionResult {
  text: string;
  usage: Usage | undefined;
  latencyMs: number;
}

export interface CompletionRequest {
  system: string;
  prompt: string;
}

/**
 * Run one completion and settle it. Every caller builds a FRESH Context per
 * call — this helper never accepts, stores, or reuses message history, which
 * is the mechanical root of the "never replay one model's turns as another's
 * history" invariant.
 */
export async function complete(
  streamFn: StreamFunction<Api>,
  model: Model<Api>,
  request: CompletionRequest,
): Promise<CompletionResult> {
  const context: Context = {
    // v18: systemPrompt is a string[] now.
    systemPrompt: [request.system],
    messages: [
      { role: "user", content: request.prompt, timestamp: Date.now() },
    ],
  };
  const started = Date.now();
  // v18: StreamFunction takes the options argument (non-optional in the type).
  const message = await streamFn(model, context, {} as OptionsForApi<Api>).result();
  const latencyMs = Date.now() - started;
  if (message.stopReason === "error" || message.stopReason === "aborted") {
    throw new Error(
      `completion failed (${message.stopReason}): ${message.errorMessage ?? "no detail"}`,
    );
  }
  return {
    text: contentText(message.content),
    usage: message.usage,
    latencyMs,
  };
}
