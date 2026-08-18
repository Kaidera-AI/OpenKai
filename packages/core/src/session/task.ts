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

/** Default child-run wall-clock limit: 5 minutes. */
const DEFAULT_TIMEOUT_SECONDS = 300;

const TaskParams = Type.Object({
  prompt: Type.String({ description: "The self-contained instruction for the subagent." }),
  modelId: Type.Optional(Type.String({ description: "Model for the child (default: the parent's)." })),
  timeoutSeconds: Type.Optional(
    Type.Integer({ description: "Wall-clock limit for the child run (default 300s). On expiry the child is aborted.", minimum: 1 }),
  ),
});

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
      const transport = new InProcessTransport({
        sessionId: `task-${uuidv7()}`,
        modelId: params.modelId ?? parentModelId,
        cwd,
      });

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
        await transport.prompt(params.prompt);

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
        return textResult(answer.length > 0 ? answer : "(subagent produced no text)", {
          model: params.modelId ?? parentModelId,
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
