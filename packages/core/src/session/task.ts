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
 *
 * K3 fixes (0.1.007 review): stage resolution threads the cast's provider
 * (the built-in casts are nvidia-lane; the transport defaults to openrouter,
 * so stage resolution was dead by default) and fails loudly when a cast has
 * no judge for the review stage; a pre-aborted/timeout child never starts a
 * run (abort-before-prompt raced a full LLM turn); the JSON contract
 * extractor tries every fenced block and balanced span (the first fence is
 * often a placeholder), reads required keys from formal JSON Schema when the
 * contract parses as one, and caps the validated output.
 */

import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import { uuidv7 } from "@earendil-works/pi-ai";
import { InProcessTransport } from "./local-transport.js";
import { resolveCast, type CastConfig } from "../fusion/casts.js";

/** Default child-run wall-clock limit: 5 minutes. */
const DEFAULT_TIMEOUT_SECONDS = 300;

/** Cap on the validated child JSON returned into the parent's context. */
const MAX_SCHEMA_OUTPUT_BYTES = 65_536;

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

/** Required keys from the contract: formal JSON Schema when it parses, prose fallback otherwise. */
function requiredKeysOf(schema: string): string[] {
  try {
    const parsed: unknown = JSON.parse(schema);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj["required"])) {
        return obj["required"].filter((k): k is string => typeof k === "string");
      }
      if (obj["properties"] !== null && typeof obj["properties"] === "object") {
        return Object.keys(obj["properties"] as Record<string, unknown>);
      }
    }
  } catch {
    // prose contract — fall through to the key-pattern scan
  }
  return [...schema.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"\s*:/g)].map((m) => m[1]!);
}

/** Every fenced block plus every balanced top-level {...} span, latest first. */
function jsonCandidates(answer: string): string[] {
  const candidates: string[] = [];
  for (const m of answer.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (m[1] !== undefined) candidates.push(m[1].trim());
  }
  // Balanced-brace scan for unfenced objects (first-{-to-last-} joins two
  // objects and prose braces into an unparseable span — K3).
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < answer.length; i += 1) {
    const c = answer[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (c === "}") {
      if (depth > 0) depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(answer.slice(start, i + 1));
        start = -1;
      }
    }
  }
  // Later candidates are likelier to be the settled answer (children commonly
  // show a placeholder fence first); try latest first.
  return candidates.reverse();
}

/**
 * Extract a JSON object from the child's answer and check every required key
 * exists. Tries ALL fenced blocks and balanced spans (latest first — the
 * first fence is often a format placeholder). Returns the pretty-printed
 * JSON, capped at 64 KiB, or an error string.
 */
export function extractAndValidateJson(answer: string, schema: string): { json?: string; error?: string } {
  const required = requiredKeysOf(schema);
  let lastParseError: string | undefined;
  let sawObject = false;
  for (const candidate of jsonCandidates(answer)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch (error) {
      lastParseError = error instanceof Error ? error.message : String(error);
      continue;
    }
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    sawObject = true;
    const record = parsed as Record<string, unknown>;
    const missing = required.filter((k) => !(k in record));
    if (missing.length > 0) {
      lastParseError = `missing required keys: ${missing.join(", ")}`;
      continue;
    }
    const json = JSON.stringify(parsed, null, 2);
    if (json.length > MAX_SCHEMA_OUTPUT_BYTES) {
      return { error: `child JSON exceeds ${MAX_SCHEMA_OUTPUT_BYTES} bytes (${json.length}) — refusing to flood the parent context` };
    }
    return { json };
  }
  if (!sawObject && lastParseError !== undefined) return { error: `child JSON did not parse: ${lastParseError}` };
  if (lastParseError !== undefined) return { error: `child JSON invalid: ${lastParseError}` };
  return { error: "no JSON object found in the subagent's answer" };
}

/** task: run a read-only subagent and return its settled answer. */
export function taskTool(
  cwd: string,
  parentModelId: string,
  options?: { castConfig?: CastConfig },
): AgentTool<typeof TaskParams, unknown> {
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
      // an explicit modelId always wins; else the parent's model. The cast's
      // PROVIDER travels with the model (K3: the built-in casts are nvidia
      // lane; defaulting to openrouter made stage resolution dead).
      const cast = resolveCast(undefined, options?.castConfig);
      let childModelId = params.modelId;
      let childProvider: string | undefined;
      if (childModelId === undefined && params.stage !== undefined && cast !== undefined) {
        if (params.stage === "review" && cast.judgeModel === undefined) {
          return textResult(
            `Error: cast "${cast.id}" has no judgeModel — the review stage refuses to self-review with the architect model. Set a judge in ~/.openkai/config.json or pass modelId explicitly.`,
            { error: true },
          );
        }
        childModelId =
          params.stage === "plan" ? cast.architectModel
          : params.stage === "build" ? cast.builderModel
          : cast.judgeModel;
        childProvider = cast.provider;
      }
      childModelId ??= parentModelId;

      // outputSchema (subagent steering): append a JSON-contract instruction
      // so the child's settled answer is machine-readable.
      const childPrompt = params.outputSchema
        ? `${params.prompt}\n\nRespond with ONLY a JSON object (no prose) matching exactly this contract:\n${params.outputSchema}`
        : params.prompt;

      let stopped: "timeout" | "aborted" | undefined;
      const stop = (why: "timeout" | "aborted", transport: InProcessTransport): void => {
        if (stopped !== undefined) return;
        stopped = why;
        transport.abort();
        void transport.close();
      };

      try {
        // K3: a pre-aborted signal (or an already-elapsed deadline) must not
        // start a run at all — abort() before prompt() raced a full LLM turn
        // (agent.abort() is a no-op without an active run).
        if (signal?.aborted) {
          return textResult("subagent aborted — the parent turn was cancelled", { error: true, stopped: "aborted" });
        }

        const transport = new InProcessTransport({
          sessionId: `task-${uuidv7()}`,
          modelId: childModelId,
          provider: childProvider,
          cwd,
        });

        // Teardown: on timeout or parent-abort, abort the child run and close
        // the transport — close() ends the event queue, which unblocks the
        // `for await` below (the queue's pending next() resolves "done").
        const timer = setTimeout(
          () => stop("timeout", transport),
          (params.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
        );
        const onAbort = (): void => stop("aborted", transport);
        signal?.addEventListener("abort", onAbort, { once: true });

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
        } finally {
          clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
          await transport.close();
        }
      } catch (error) {
        return textResult(`subagent failed: ${error instanceof Error ? error.message : String(error)}`, { error: true });
      }
    },
  };
}
