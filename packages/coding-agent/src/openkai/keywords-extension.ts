/**
 * openkai/keywords-extension (E021 F3) — the OpenKai keyword upgrade on the
 * fork. omp's own machinery already shimmers + notices `ultrathink`
 * (max-effort single model); ours upgrades it: the keyword routes the turn
 * to the FUSION panel (multi-model combined), and `ultrareview` runs the
 * multi-model adversarial review of the current diff.
 *
 * Seam: `before_agent_start` returns a hidden custom message (the model sees
 * the instruction; the transcript shows the operator's text as typed).
 *
 * Self-registers on the extension-module capability (sanctioned touch-list).
 */

import type { ExtensionAPI } from "../extensibility/extensions/types.js";

/** Standalone-prose keyword match (the fork's own boundary discipline). */
const KEYWORD_RE = {
  ultrathink: /(?<![\p{L}\p{M}\p{N}_./\\-])(?<!::)ultrathink(?![\p{L}\p{M}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()/u,
  ultrareview: /(?<![\p{L}\p{M}\p{N}_./\\-])(?<!::)ultrareview(?![\p{L}\p{M}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()/u,
} as const;

export default function openkaiKeywords(pi: ExtensionAPI): void {
  // /fuse — operator-driven fusion: executes the panel DIRECTLY (no model
  // discretion), the verdict lands in the transcript as a custom message.
  pi.registerCommand("fuse", {
    description: "Run the fusion panel on a task (architect + builder + judge verdict)",
    handler: async (args, ctx) => {
      const task = args.trim();
      if (task.length === 0) {
        ctx.ui.notify("/fuse <task> — the fusion panel needs a task", "warning");
        return;
      }
      ctx.ui.notify(`fusing: ${task.slice(0, 80)}…`, "info");
      ctx.ui.setStatus("openkai-fuse", "fusing…");
      try {
        const { fusionTool } = await import("./fusion-tool.js");
        const result = await fusionTool.execute(
          `fuse-${Date.now()}`,
          { task } as never,
          undefined,
          ctx as never,
        );
        const text = result.content
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("\n");
        pi.sendMessage(
          { customType: "openkai-fuse", content: `◆ fusion verdict — ${task.slice(0, 80)}\n\n${text}`, display: true },
          { deliverAs: "nextTurn" },
        );
        ctx.ui.notify("fusion: verdict delivered", "info");
      } catch (error) {
        ctx.ui.notify(`fusion failed: ${error instanceof Error ? error.message : String(error)}`, "error");
      } finally {
        ctx.ui.setStatus("openkai-fuse", undefined);
      }
    },
  });

  pi.on("before_agent_start", (event) => {
    const prompt = event.prompt;
    const think = KEYWORD_RE.ultrathink.test(prompt);
    const review = KEYWORD_RE.ultrareview.test(prompt);
    if (!think && !review) return undefined;

    if (review) {
      return {
        message: {
          customType: "openkai-ultrareview",
          content: [
            "<system-notice>",
            "ultrareview: run an ADVERSARIAL review of the current change set. Gather the diff yourself",
            "(bash: git diff / git status) and review it with the fusion tool (multi-model, combined verdict).",
            "Attack bugs, logic errors, security issues, and regressions with file/line evidence.",
            "If the tree is clean, say there is nothing to review.",
            "</system-notice>",
          ].join("\n"),
          display: false,
        },
      };
    }
    return {
      message: {
        customType: "openkai-ultrathink",
        content: [
          "<system-notice>",
          "ultrathink: the operator asked for the multi-model think. Run the fusion tool on this task —",
          "the panel reasons in parallel and the judge combines them. Answer from the fused verdict.",
          "</system-notice>",
        ].join("\n"),
        display: false,
      },
    };
  });
}
