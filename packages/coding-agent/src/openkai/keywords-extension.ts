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

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { registerProvider } from "../capability/index.js";
import { extensionModuleCapability } from "../capability/extension-module.js";
import { createSourceMeta } from "../discovery/helpers.js";
import type { ExtensionAPI } from "../extensibility/extensions/types.js";

/** Standalone-prose keyword match (the fork's own boundary discipline). */
const KEYWORD_RE = {
  ultrathink: /(?<![\p{L}\p{M}\p{N}_./\\-])(?<!::)ultrathink(?![\p{L}\p{M}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()/u,
  ultrareview: /(?<![\p{L}\p{M}\p{N}_./\\-])(?<!::)ultrareview(?![\p{L}\p{M}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()/u,
} as const;

export default function openkaiKeywords(pi: ExtensionAPI): void {
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

// Self-register as an extension module.
const modulePath = fileURLToPath(import.meta.url);
registerProvider(extensionModuleCapability.id, {
  id: "openkai-keywords",
  displayName: "OpenKai",
  description: "OpenKai magic keywords → fusion routing (openkai/keywords layer)",
  priority: 92,
  load: () =>
    Promise.resolve({
      items: [
        {
          name: "openkai-keywords",
          path: path.resolve(modulePath),
          level: "project" as const,
          _source: createSourceMeta("openkai-keywords", path.resolve(modulePath), "project"),
        },
      ],
      warnings: [],
    }),
});
