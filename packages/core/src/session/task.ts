/**
 * Subagent orchestration (E008, ren's #2): a `task` tool that spawns a
 * child {@link InProcessTransport} with the READ-ONLY tool set (no mutation,
 * no approval channel) to run a self-contained subtask, then returns the
 * settled assistant text. The parent keeps full control; the child is a
 * throwaway reader. This is the lean core of omp's task tool.
 *
 * Lifecycle hardening (ren's adversarial review, E012): the child session ID
 * is a uuidv7 (never Date.now — collisions aliased two children into one
 * slot); the parent's AbortSignal aborts the child transport; and a 5-minute
 * default wall-clock timeout (param-overridable) aborts a runaway child.
 * Both paths close the child transport, which ends its event queue and
 * unblocks the consumption loop.
 */

import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import { uuidv7 } from "@earendil-works/pi-ai";
import { InProcessTransport } from "./local-transport.js";
import { resolveCast } from "../fusion/casts.js";

/** Default child-run wall-clock limit: 5 minutes. */
const DEFAULT_TIMEOUT_SECONDS = 300;

const TaskParams = Type.Object({
  prompt: Type.String({ description: "The self-contained instruction for the subagent." }),
  modelId: Type.Optional(Type.String({ description: "Model for the child (default: the parent's)." })),
  timeoutSeconds: Type.Optional(
    Type.Integer({ description: "Wall-clock limit for the child run (default 300s). On expiry the child is aborted.", minimum: 1 }),
  ),
  outputSchema: Type.Optional(
    Type.String({
      description:
        "Optional JSON contract for the child's answer. The child is instructed to return ONLY a JSON object with these keys; the parent extracts and validates it (required keys present) and returns the parsed JSON as text.",
    }),
  ),
  stage: Type.Optional(
    Type.Union([Type.Literal("plan"), Type.Literal("build"), Type.Literal("review")], {
      description:
        "Dynamic model selection (K3 #6 / OK-9.3): when set and modelId is absent, the child model resolves from the active cast by stage (plan→architect, build→builder, review→judge).",
    }),
  ),
});

/**
 * Extract a JSON object from the child's answer (fenced ```json block first,
 * else the first balanced {...} span) and check every required key exists.
 * Returns the pretty-printed JSON or an error string.
 */
export function extractAndValidateJson(answer: string, schema: string): { json?: string; error?: string } {
  let candidate: string | undefined;
  const fenced = answer.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidate = fenced[1]!.trim();
  if (!candidate) {
    const start = answer.indexOf("{");
    const end = answer.lastIndexOf("}");
    if (start >= 0 && end > start) candidate = answer.slice(start, end + 1);
  }
  if (!candidate) return { error: "no JSON object found in the subagent's answer" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    return { error: `child JSON did not parse: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "child returned JSON that is not an object" };
  }
  // Required keys come from the schema text: "key": patterns.
  const required = [...schema.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g)].map((m) => m[1]!);
  const record = parsed as Record<string, unknown>;
  const missing = required.filter((k) => !(k in record));
  if (missing.length > 0) {
    return { error: `child JSON missing required keys: ${missing.join(", ")}` };
  }
  return { json: JSON.stringify(parsed, null, 2) };
}

/** task: run a read-only subagent and return its settled answer. */
export function taskTool(cwd: string, parentModelId: string): AgentTool<typeof TaskParams, unknown> {
  const textResult = (text: string, details?: unknown) => ({
    content: [{ type: "text", text } as TextContent],
    details,
  });

  return {
    name: "task",
    label: "Task",
    description:
      "Spawn a read-only subagent to run a self-contained subtask (research, scan, summarise) and return its answer. The child cannot mutate files or run shell.",
    parameters: TaskParams,
    async execute(
      _toolCallId: string,
      params: Static<typeof TaskParams>,
      signal?: AbortSignal,
    ): Promise<AgentToolResult<unknown>> {
      // K3 #6 / OK-9.3: dynamic selection — stage resolves the child model
      // from the active cast (plan→architect, build→builder, review→judge);
      // an explicit modelId always wins; else the parent's model.
      const cast = resolveCast();
      const stageModel =
        params.stage === "plan" ? cast?.architectModel
        : params.stage === "build" ? cast?.builderModel
        : params.stage === "review" ? (cast?.judgeModel ?? cast?.architectModel)
        : undefined;
      const childModelId = params.modelId ?? stageModel ?? parentModelId;
      const transport = new InProcessTransport({
        sessionId: `task-${uuidv7()}`,
        modelId: childModelId,
        cwd,
      });

      // outputSchema (subagent steering): append a JSON-contract instruction
      // so the child's settled answer is machine-readable.
      const childPrompt = params.outputSchema
        ? `${params.prompt}\n\nRespond with ONLY a JSON object (no prose) matching exactly this contract:\n${params.outputSchema}`
        : params.prompt;

      // Teardown: on timeout or parent-abort, abort the child run and close
      // the transport — close() ends the event queue, which unblocks the
      // `for await` below (the queue's pending next() resolves "done").
      let stopped: "timeout" | "aborted" | undefined;
      const stop = (why: "timeout" | "aborted"): void => {
        if (stopped !== undefined) return;
        stopped = why;
        transport.abort();
        void transport.close();
      };
      const timer = setTimeout(
        () => stop("timeout"),
        (params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
      );
      const onAbort = (): void => stop("aborted");
      if (signal?.aborted) stop("aborted");
      else signal?.addEventListener("abort", onAbort, { once: true });

      let answer = "";
      try {
        const events = transport.events();
        await transport.prompt(childPrompt);

        for await (const event of events) {
          if (event.kind === "session_end") break;
          if (event.kind === "error") {
            return textResult(`subagent error: ${event.message}`, { error: true });
          }
        }

        if (stopped !== undefined) {
          return textResult(
            stopped === "timeout"
              ? `subagent timed out after ${params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS}s — aborted`
              : "subagent aborted — the parent turn was cancelled",
            { error: true, stopped },
          );
        }

        // The settled transcript's last assistant message is the answer.
        const messages = transport.getMessages();
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const msg: unknown = messages[i];
          if (msg === null || typeof msg !== "object" || !("role" in msg) || msg.role !== "assistant") continue;
          if (!("content" in msg) || !Array.isArray(msg.content)) continue;
          const parts: string[] = [];
          for (const part of msg.content as unknown[]) {
            if (part !== null && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string") {
              parts.push(part.text);
            }
          }
          answer = parts.join("\n");
          break;
        }
        if (params.outputSchema) {
          const result = extractAndValidateJson(answer, params.outputSchema);
          if (result.error) {
            return textResult(`subagent output failed the schema: ${result.error}\n\nraw answer:\n${answer.slice(0, 2000)}`, {
              error: true,
              model: childModelId,
            });
          }
          return textResult(result.json!, { model: childModelId, schema: true });
        }
        return textResult(answer.length > 0 ? answer : "(subagent produced no text)", {
          model: childModelId,
        });
      } catch (error) {
        return textResult(`subagent failed: ${error instanceof Error ? error.message : String(error)}`, { error: true });
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        await transport.close();
      }
    },
  };
}
