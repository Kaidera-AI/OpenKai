/**
 * openkai/fusion — the fusion CustomTool (E021 F1). The panel runs through
 * omp's tool seam: models resolve via the session's ModelRegistry, auth rides
 * the registry's ApiKeyResolver, and the result renders through
 * renderCall/renderResult in the fork's TUI.
 *
 * Self-registered at import time via the `tool` capability provider
 * (discovery/index.ts imports this module — the sanctioned touch-list entry).
 */

import { Type } from "@oh-my-pi/omptype/typebox";
import type { Api, Model } from "@oh-my-pi/pi-ai";
import { streamSimple, type StreamFunction } from "@oh-my-pi/pi-ai";
import { Text } from "@oh-my-pi/pi-tui";
import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";

import { registerProvider } from "../capability/index.js";
import { slashCommandCapability } from "../capability/slash-command.js";
import { toolCapability } from "../capability/tool.js";
import { createSourceMeta } from "../discovery/helpers.js";
import type { CustomTool } from "../extensibility/custom-tools/types.js";

import { fuse, type FuseResult } from "./fusion/index.js";

/** The fusion tool's parameter schema. */
const FusionParams = Type.Object({
  task: Type.String({ description: "The task for the fusion panel." }),
  architectModel: Type.Optional(
    Type.String({ description: "Model id for the architect role (default: the session's current model)." }),
  ),
  builderModel: Type.Optional(
    Type.String({ description: "Model id for the builder role (default: self-pair with the architect)." }),
  ),
  gate: Type.Optional(
    Type.Boolean({ description: "Design + evaluate a validator gate around the run (default: false)." }),
  ),
});

interface FusionDetails {
  task: string;
  gateOutcome: string;
  roles: Array<{ role: string; modelId: string; latencyMs: number; error?: string }>;
  consensusCount: number;
  divergenceCount: number;
}

function resultText(result: FuseResult): string {
  const lines: string[] = [];
  for (const output of result.outputs) {
    const head = output.error !== undefined ? `✗ failed: ${output.error}` : `${output.text.length} chars`;
    lines.push(`[${output.role} · ${output.modelId}] ${head}`);
  }
  const s = result.synthesis;
  if (s.synthesisError !== undefined) {
    lines.push(`synthesis: merge failed — ${s.synthesisError}`);
  } else {
    lines.push(
      `consensus (${s.consensus.length}): ${s.consensus.join(" · ") || "none"}`,
      ...(s.divergences.length > 0
        ? [`divergences (${s.divergences.length}): ${s.divergences.map((d) => d.topic).join(" · ")}`]
        : []),
    );
  }
  lines.push(`gate: ${result.gate.outcome}`);
  return lines.join("\n");
}

const fusionToolBase: CustomTool<typeof FusionParams, FusionDetails> = {
  name: "fusion",
  label: "Fusion",
  description:
    "Run the OpenKai fusion panel on a task: architect + builder reason in parallel, " +
    "a judge synthesises the combined answer, and an optional gate verifies the work. " +
    "Use for design decisions, tricky bugs, or anything that benefits from two minds.",
  parameters: FusionParams,
  loadMode: "essential",
  approval: "exec",
  formatApprovalDetails: (args) => {
    const task = (args as { task?: string }).task ?? "";
    return [`Task: ${task.slice(0, 200)}`];
  },
  async execute(_id, params, _onUpdate, ctx) {
    const registry = ctx.modelRegistry;
    const current = ctx.model;
    const pick = (id: string | undefined): Model<Api> | undefined => {
      if (id === undefined) return current;
      // Accept "provider/model" or a bare model id (resolved against any lane).
      const slash = id.indexOf("/");
      if (slash > 0) return registry.find(id.slice(0, slash), id.slice(slash + 1));
      for (const m of registry.getAvailable()) {
        if (m.id === id) return m;
      }
      return undefined;
    };
    const architect = pick(params.architectModel);
    if (architect === undefined) {
      return {
        content: [{ type: "text", text: `fusion: unknown architect model "${params.architectModel}"` }],
        isError: true,
      };
    }
    const builder = pick(params.builderModel) ?? architect;

    // Stream with the registry's auth (rotating/resolving keys ride the
    // resolver — never a static key here).
    const streamFn: StreamFunction<Api> = (model, context, options) =>
      // The registry resolver carries key resolution + rotation; the cast is
      // pi's own idiom (api-registry.ts:80 does the same).
      streamSimple(model, context, { ...(options as object), apiKey: registry.resolver(model.provider) } as never);

    try {
      const result = await fuse(streamFn, {
        task: params.task,
        architectModel: architect,
        builderModel: builder,
        gate: params.gate === true,
      });
      const details: FusionDetails = {
        task: params.task,
        gateOutcome: result.gate.outcome,
        roles: result.outputs.map((o) => ({
          role: o.role,
          modelId: o.modelId,
          latencyMs: o.latencyMs,
          ...(o.error !== undefined ? { error: o.error } : {}),
        })),
        consensusCount: result.synthesis.consensus.length,
        divergenceCount: result.synthesis.divergences.length,
      };
      return { content: [{ type: "text", text: resultText(result) }], details };
    } catch (error) {
      return {
        content: [{ type: "text", text: `fusion failed: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
  renderCall: (args, _options, theme) => {
    const task = (args as { task?: string }).task ?? "";
    return new Text(theme.fg("accent", "◆ fusion panel") + "\n" + theme.fg("muted", task.slice(0, 300)), 1, 0);
  },
  renderResult: (result, _options, theme) => {
    const details = result.details as FusionDetails | undefined;
    if (details === undefined) {
      return new Text(theme.fg("muted", "fusion: no details"), 1, 0);
    }
    const lines = [
      theme.fg("accent", "◆ fusion verdict"),
      ...details.roles.map((r) =>
        theme.fg(r.error === undefined ? "success" : "error",
          `  ${r.role} · ${r.modelId} · ${r.latencyMs}ms${r.error !== undefined ? ` — ${r.error}` : ""}`),
      ),
      theme.fg("muted", `  consensus ${details.consensusCount} · divergences ${details.divergenceCount} · gate ${details.gateOutcome}`),
    ];
    return new Text(lines.join("\n"), 1, 0);
  },
};

// The capability validator reads `path` (loader-provided for user tools) — a
// built-in declares its own provenance instead. Not part of the CustomTool
// interface; attached structurally, with the `_source` metadata the loader
// requires to admit an item.
const fusionTool = Object.assign(fusionToolBase, {
  path: "builtin:openkai/fusion",
  _source: createSourceMeta("openkai-fusion", "builtin:openkai/fusion", "native" as never),
});

// Self-register on the tool capability (the fork's built-in seam).
registerProvider(toolCapability.id, {
  id: "openkai-fusion",
  displayName: "OpenKai",
  description: "OpenKai fusion panel (openkai/fusion layer)",
  priority: 90,
  load: () => Promise.resolve({ items: [fusionTool], warnings: [] }),
});

export { fusionTool };

// The operator-facing /fuse command (markdown-template slash command): the
// prompt instructs the model to run the fusion tool on the given task.
registerProvider(slashCommandCapability.id, {
  id: "openkai-fuse",
  displayName: "OpenKai",
  description: "OpenKai /fuse — run the fusion panel on a task",
  priority: 90,
  load: () =>
    Promise.resolve({
      items: [
        {
          name: "fuse",
          path: "builtin:openkai/fuse",
          content: [
            "Run the fusion panel on the task below using the fusion tool.",
            "If the operator gave no task, ask what to fuse.",
            "",
            "Task: {{args}}",
          ].join("\n"),
          level: "native" as const,
          _source: createSourceMeta("openkai-fuse", "builtin:openkai/fuse", "native" as never),
        },
      ],
      warnings: [],
    }),
});
