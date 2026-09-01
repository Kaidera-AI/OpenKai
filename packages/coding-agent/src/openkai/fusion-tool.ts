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
import type { CustomTool } from "../extensibility/custom-tools/types.js";

import { fuse, FusionBandit, defaultFusionLogPath, readFusionRuns, type FuseResult } from "./fusion/index.js";
import { readOpenkaiConfig } from "./config-io.js";
import { candidateKey, postureBucket, suggestPair, type PairCandidate } from "./pairing.js";
import type { ShiftPosture } from "./orchestrate.js";
import { RlmRegistry } from "./rlm.js";

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
  /** RLM recursion (F4): the verification child admitted on divergence. */
  verificationChildId?: string;
  childUsageTokens?: number;
  /** E022 Inc 03: how the default pair was chosen (the scorer-source contract). */
  pairSource?: string;
  pairAdvisory?: string;
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
    let architect = pick(params.architectModel);
    if (architect === undefined) {
      return {
        content: [{ type: "text", text: params.architectModel !== undefined
          ? `fusion: unknown architect model "${params.architectModel}"`
          : "fusion: no architect model — select a model first" }],
        isError: true,
      };
    }
    let builder = pick(params.builderModel);
    let pairSource: string | undefined;
    let pairAdvisory: string | undefined;
    if (builder === undefined && params.builderModel === undefined) {
      // E022 Inc 03 — the default pair is scorer-driven, never hardcoded:
      // bandit posterior on the operator-priority bucket → cross-provider
      // diversity → self-pair advisory. Explicit args always beat it.
      const cfg = await readOpenkaiConfig();
      const bucket = postureBucket(cfg.shift?.posture as ShiftPosture | undefined);
      const candidates: PairCandidate[] = registry
        .getAvailable()
        .map((m) => ({ provider: m.provider, id: m.id }));
      const bandit = new FusionBandit();
      bandit.update(await readFusionRuns(defaultFusionLogPath(process.cwd())), () => bucket);
      // Telemetry arms are keyed by bare model id; map back to provider/id.
      const bareToKey = new Map<string, string>();
      for (const c of candidates) if (!bareToKey.has(c.id)) bareToKey.set(c.id, candidateKey(c));
      const suggestion = suggestPair(
        candidates,
        current !== undefined ? { provider: current.provider, id: current.id } : undefined,
        {
          bucket,
          recommend: (keys) => {
            const bareIds: string[] = [];
            for (const key of keys) {
              const bare = [...bareToKey.entries()].find(([, v]) => v === key)?.[0];
              if (bare !== undefined) bareIds.push(bare);
            }
            const rec = bandit.recommend(bucket, bareIds);
            if (rec === undefined || rec.pulls === 0) return undefined;
            const key = bareToKey.get(rec.modelId);
            return key === undefined ? undefined : { modelId: key, reason: rec.reason };
          },
        },
        {
          architect: params.architectModel !== undefined
            ? candidateKey({ provider: architect.provider, id: architect.id })
            : cfg.fusion?.pair?.architect,
          builder: cfg.fusion?.pair?.builder,
        },
      );
      if (suggestion !== undefined) {
        pairSource = suggestion.source;
        pairAdvisory = suggestion.advisory;
        if (params.architectModel === undefined) {
          architect = pick(candidateKey(suggestion.architect)) ?? architect;
        }
        builder = pick(candidateKey(suggestion.builder));
      }
    }
    builder = builder ?? architect;

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
        ...(pairSource !== undefined ? { pairSource } : {}),
        ...(pairAdvisory !== undefined ? { pairAdvisory } : {}),
      };
      // RLM recursion (E021 F4): a divergent verdict admits a verification
      // child — the divergence topic gets its own run, attributed back to
      // this fusion run's usage.
      if (result.synthesis.divergences.length > 0 && result.synthesis.synthesisError === undefined) {
        const topics = result.synthesis.divergences.map((d) => d.topic).join("; ");
        const handle = RlmRegistry.current().spawnChild(streamFn, architect, {
          system:
            "You are the verification child of a divergent fusion verdict. " +
            "Judge the divergence with fresh evidence; be compact and decisive.",
          prompt:
            `Task under fusion: ${params.task}\n\nThe panel diverged on: ${topics}\n\n` +
            `Architect said: ${result.synthesis.divergences.map((d) => d.architect).join(" | ")}\n` +
            `Builder said: ${result.synthesis.divergences.map((d) => d.builder).join(" | ")}\n\n` +
            "Which side holds, and why?",
        });
        details.verificationChildId = handle.childId;
        details.childUsageTokens = RlmRegistry.current().childUsageAttribution().totalTokens;
      }
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
      ...(details.pairSource !== undefined
        ? [theme.fg("dim", `  pair: ${details.pairSource}${details.pairAdvisory !== undefined ? ` — ${details.pairAdvisory}` : ""}`)]
        : []),
    ];
    // RLM display (F4→0.1.11): the verification child's verdict joins the
    // card once settled — the recursion is visible in the parent turn.
    if (details.verificationChildId !== undefined) {
      const registry = RlmRegistry.current();
      const child = registry.result(details.verificationChildId);
      if (child !== undefined) {
        if (child.error !== undefined) {
          lines.push(
            theme.fg("error", `  ✦ verification (${child.model}, gen ${child.generation}) failed:`),
            theme.fg("muted", `    ${child.error.slice(0, 240).replace(/\n/g, " ")}`),
          );
        } else {
          lines.push(
            theme.fg("accent", `  ✦ verification (${child.model}, gen ${child.generation}):`),
            theme.fg("muted", `    ${child.text.slice(0, 240).replace(/\n/g, " ")}`),
          );
        }
      } else {
        // Pending state (E022 Inc 03): name the model, generation, and elapsed
        // time — the operator sees WHICH child is in flight, not just that one is.
        const pending = registry.pendingInfo(details.verificationChildId);
        const elapsed = pending !== undefined ? ` — ${Math.max(0, Math.round((Date.now() - pending.startedAt) / 1000))}s` : "";
        lines.push(
          theme.fg("muted",
            pending !== undefined
              ? `  ✦ verification (${pending.model}, gen ${pending.generation}) running${elapsed} (rlm_collect to gather)`
              : `  ✦ verification child ${details.verificationChildId} — running (rlm_collect to gather)`),
        );
      }
    }
    return new Text(lines.join("\n"), 1, 0);
  },
};

// The tool loader carries `path` for provenance — a built-in declares its
// own. Not part of the CustomTool interface; attached structurally.
export const fusionTool = Object.assign(fusionToolBase, { path: "builtin:openkai/fusion" });
