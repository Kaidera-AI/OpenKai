/**
 * openkai fuse — run one task through the fusion core (E016 FU-1/FU-2, FU-3
 * with --gate) and print the attributed synthesis. Print-mode only; the TUI
 * panel view is Inc 06.
 */

import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  CortexClient,
  DEFAULT_MODEL_ID,
  exportFusionRunArtifact,
  fuse,
  recordFusionRun,
  defaultFusionLogPath,
  type RoleOutput,
  type SynthesisArtifact,
} from "@openkai/core";

export interface FuseCliOptions {
  prompt: string;
  architectModel?: string;
  builderModel?: string;
  judgeModel?: string;
  gate: boolean;
  maxRounds?: number;
  project?: string;
  api?: string;
  agent?: string;
  quiet: boolean;
}

const MAX_ROLE_PREVIEW = 1200;

const preview = (text: string): string =>
  text.length > MAX_ROLE_PREVIEW
    ? `${text.slice(0, MAX_ROLE_PREVIEW)}\n…[${text.length - MAX_ROLE_PREVIEW} chars elided — full text in the run record]`
    : text;

const renderRole = (output: RoleOutput): string =>
  `\n── [${output.role.toUpperCase()}] ${output.modelId} (${output.latencyMs}ms` +
  `${output.usage ? `, ${output.usage.totalTokens} tokens` : ""}) ──\n${preview(output.text)}`;

const renderSynthesis = (s: SynthesisArtifact): string => {
  const lines: string[] = [`\n══ SYNTHESIS (${s.modelId}) ══`];
  if (s.consensus.length) {
    lines.push("Consensus:");
    for (const item of s.consensus) lines.push(`  • ${item}`);
  }
  if (s.divergences.length) {
    lines.push("Divergences (kept, attributed):");
    for (const d of s.divergences) {
      lines.push(`  • ${d.topic} → kept: ${d.kept}`);
      lines.push(`      [ARCHITECT] ${d.architect}`);
      lines.push(`      [BUILDER]   ${d.builder}`);
    }
  }
  if (s.discarded.length) {
    lines.push("Discarded:");
    for (const d of s.discarded) lines.push(`  • [${d.by.toUpperCase()}] ${d.item} — ${d.reason}`);
  }
  if (s.blindSpots.length) {
    lines.push("Blind spots:");
    for (const b of s.blindSpots) lines.push(`  • ${b}`);
  }
  if (!s.consensus.length && !s.divergences.length && !s.discarded.length && !s.blindSpots.length) {
    lines.push("  (empty synthesis)");
  }
  return lines.join("\n");
};

export async function runFuse(options: FuseCliOptions): Promise<number> {
  if (!process.env.OPENROUTER_API_KEY) {
    process.stderr.write(
      "OpenRouter API key not found: set OPENROUTER_API_KEY or export it in your environment.\n",
    );
    return 1;
  }

  const models = builtinModels();
  const defaultId = process.env.OPENKAI_MODEL ?? DEFAULT_MODEL_ID;
  const resolve = (id: string, label: string) => {
    const model = models.getModel("openrouter", id);
    if (!model) {
      process.stderr.write(
        `ERROR: ${label} model "${id}" not found in the OpenRouter catalogue (default: "${defaultId}").\n`,
      );
      return undefined;
    }
    return model;
  };

  const architect = resolve(options.architectModel ?? defaultId, "architect");
  const builder = resolve(options.builderModel ?? defaultId, "builder");
  const judge = resolve(options.judgeModel ?? options.architectModel ?? defaultId, "judge");
  if (!architect || !builder || !judge) return 2;

  const logPath = defaultFusionLogPath();
  if (!options.quiet) {
    process.stderr.write(
      `[openkai] fuse: architect=${architect.id} builder=${builder.id} judge=${judge.id} gate=${options.gate ? "on" : "off"}\n`,
    );
  }

  try {
    const result = await fuse(
      (model, context, opts) => models.streamSimple(model, context, opts),
      {
        task: options.prompt,
        architectModel: architect,
        builderModel: builder,
        judgeModel: judge,
        gate: options.gate,
        maxRounds: options.maxRounds,
      },
    );

    await recordFusionRun(result.record, logPath);

    // Managed mode (ren A1): with a project attached, also export the run
    // record as a Cortex artifact. Best-effort — export failure never fails
    // the run.
    if (options.project) {
      const client = new CortexClient({
        baseUrl: options.api,
        project: options.project,
        agent: options.agent,
      });
      const exported = await exportFusionRunArtifact(
        client,
        result.record,
        options.agent ?? "openkai",
      );
      if (exported && !options.quiet) {
        process.stderr.write(`[openkai] run artifact exported to Cortex (${options.project})\n`);
      }
    }

    for (const output of result.outputs) {
      process.stdout.write(`${renderRole(output)}\n`);
    }
    process.stdout.write(`${renderSynthesis(result.synthesis)}\n`);

    if (options.gate) {
      const verdict =
        result.gate.outcome === "pass"
          ? `PASS after ${result.gate.rounds} evaluation round(s)`
          : result.gate.outcome === "weak-gate"
            ? "WEAK GATE — baseline was green before work; gate proves nothing"
            : `HALT — gate still failing after the retry cap (escalate to triage)`;
      process.stdout.write(`\n══ GATE: ${verdict} ══\n`);
    }

    if (!options.quiet) {
      process.stderr.write(`[openkai] run ${result.runId} recorded at ${logPath}\n`);
    }
    return options.gate && result.gate.outcome !== "pass" ? 1 : 0;
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
