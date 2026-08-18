/**
 * Subagent orchestration (E008, ren's #2): a `task` tool that spawns a
 * child {@link InProcessTransport} with the READ-ONLY tool set (no mutation,
 * no approval channel) to run a self-contained subtask, then returns the
 * settled assistant text. The parent keeps full control; the child is a
 * throwaway reader. This is the lean core of omp's task tool.
 */

import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import { InProcessTransport } from "./local-transport.js";

const TaskParams = Type.Object({
  prompt: Type.String({ description: "The self-contained instruction for the subagent." }),
  modelId: Type.Optional(Type.String({ description: "Model for the child (default: the parent's)." })),
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
    async execute(_toolCallId, params: Static<typeof TaskParams>): Promise<AgentToolResult<unknown>> {
      const transport = new InProcessTransport({
        sessionId: `task-${Date.now().toString(36)}`,
        modelId: params.modelId ?? parentModelId,
        cwd,
      });
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
        // The settled transcript's last assistant message is the answer.
        const messages = transport.getMessages();
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          const msg = messages[i]!;
          if (msg.role === "assistant") {
            const content = (msg as { content?: Array<{ type: string; text?: string }> }).content ?? [];
            answer = content
              .filter((c) => c.type === "text" && typeof c.text === "string")
              .map((c) => c.text)
              .join("\n");
            break;
          }
        }
        return textResult(answer.length > 0 ? answer : "(subagent produced no text)", {
          model: params.modelId ?? parentModelId,
        });
      } catch (error) {
        return textResult(`subagent failed: ${error instanceof Error ? error.message : String(error)}`, { error: true });
      } finally {
        await transport.close();
      }
    },
  };
}
