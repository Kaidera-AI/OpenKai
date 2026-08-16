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
  listCasts,
  recordFusionRun,
  resolveCast,
  defaultFusionLogPath,
  type CastConfig,
  type RoleOutput,
  type SynthesisArtifact,
} from "@kaidera/openkai-core";
import { providerKeyStatus, resolveProvider } from "./providers.js";
import { readConfig } from "./tui/welcome.js";

export interface FuseCliOptions {
  prompt: string;
  architectModel?: string;
  builderModel?: string;
  judgeModel?: string;
  provider?: string;
  /** Named cast (curated role set) — the fusion-first default path. */
  cast?: string;
  gate: boolean;
  yes: boolean;
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
  const models = builtinModels();
  const rawConfig = readConfig();
  const config: CastConfig = {
    casts: Array.isArray(rawConfig["casts"])
      ? (rawConfig["casts"] as CastConfig["casts"])
      : undefined,
    defaultCast:
      typeof rawConfig["defaultCast"] === "string"
        ? (rawConfig["defaultCast"] as string)
        : undefined,
  };
  const cast = options.cast
    ? resolveCast(options.cast, config)
    : undefined;
  if (options.cast && !cast) {
    process.stderr.write(
      `ERROR: cast "${options.cast}" not found. Available: ${listCasts(config).map((c) => c.id).join(", ")}\n`,
    );
    return 2;
  }
  const castProvider = cast?.provider;
  const provider = resolveProvider(options.provider ?? castProvider);
  const keyStatus = providerKeyStatus(provider);
  if (!keyStatus.configured) {
    process.stderr.write(
      `${provider} credentials not found: set ${keyStatus.needsKey ?? "the provider credentials"} or export them in your environment.\n`,
    );
    return 1;
  }

  const defaultId =
    process.env.OPENKAI_MODEL ?? (provider === "openrouter" ? DEFAULT_MODEL_ID : undefined);
  const resolve = (id: string | undefined, label: string) => {
    if (!id) {
      process.stderr.write(
        `ERROR: no default model for provider "${provider}" — pass --${label}-model <id> (or set OPENKAI_MODEL).\n`,
      );
      return undefined;
    }
    const model = models.getModel(provider, id);
    if (!model) {
      process.stderr.write(
        `ERROR: ${label} model "${id}" not found under provider "${provider}".\n`,
      );
      return undefined;
    }
    return model;
  };

  const architect = resolve(options.architectModel ?? cast?.architectModel ?? defaultId, "architect");
  const builder = resolve(options.builderModel ?? cast?.builderModel ?? defaultId, "builder");
  const judge = resolve(
    options.judgeModel ?? cast?.judgeModel ?? options.architectModel ?? cast?.architectModel ?? defaultId,
    "judge",
  );
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
        // Consent parity (E001 §2): the gate's checks are model-authored
        // shell with operator privileges. Print them; only --yes executes.
        approveGate: (checks) => {
          process.stderr.write("\n[openkai] validator-designed gate (model-authored shell):\n");
          for (const [i, c] of checks.entries()) {
            process.stderr.write(`  ${i + 1}. ${c.name}\n     $ ${c.command}\n`);
          }
          if (!options.yes) {
            process.stderr.write("gate REFUSED — rerun with --yes to execute these checks.\n");
            return false;
          }
          process.stderr.write("gate approved via --yes.\n");
          return true;
        },
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
            : result.gate.outcome === "refused"
              ? "REFUSED — checks not approved (rerun with --yes to execute)"
              : `HALT — gate still failing after the retry cap (escalate to triage)`;
      process.stdout.write(`\n══ GATE: ${verdict} ══\n`);
    }

    if (!options.quiet) {
      process.stderr.write(`[openkai] run ${result.runId} recorded at ${logPath}\n`);
    }
    if (result.gate.outcome === "refused") return 2;
    return options.gate && result.gate.outcome !== "pass" ? 1 : 0;
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
