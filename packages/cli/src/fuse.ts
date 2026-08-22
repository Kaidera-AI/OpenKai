/**
 * openkai fuse — run one task through the fusion core (E016 FU-1/FU-2, FU-3
 * with --gate) and print the attributed synthesis. Print-mode only; the TUI
 * panel view is Inc 06.
 *
 * E002 Inc 02 (Shift): the fuse command is the PRODUCTION wiring point for
 * the Shift router. The prompt is classified into a stage (plan/build/review),
 * routing events are emitted through the existing `appendActivity` seam
 * (the same writer `openkai tail` reads), and each role (architect→plan,
 * builder→build, judge→review) is routed to its cast model. This satisfies
 * the spec acceptance: "live run shows different models per stage in
 * `openkai tail`".
 */

import {
  CortexClient,
  DEFAULT_MODEL_ID,
  defaultModels,
  exportFusionRunArtifact,
  fuse,
  judgeBreakEven,
  judgeBreakEvenEvent,
  listCasts,
  Orchestrator,
  recordFusionRun,
  resolveCast,
  defaultFusionLogPath,
  ShiftRouter,
  UnwinnableGateError,
  type CastConfig,
  type Cast,
  type RoleOutput,
  type RoutingEvent,
  type ShiftPins,
  type ShiftPosture,
  type Stage,
  type SynthesisArtifact,
} from "@kaidera/openkai-core";
import { providerKeyStatus, resolveProvider } from "./providers.js";
import { readConfig } from "./tui/welcome.js";
import { appendActivity } from "./tail.js";

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

/**
 * Route each fusion stage to its cast model. The architect role maps to the
 * plan stage, the builder role to the build stage, and the judge role to the
 * review stage. These events appear in `openkai tail` and show distinct
 * models per stage.
 *
 * `router.route()` already emits a `routing` event through the router's
 * redacting sink (wired to `appendActivity` by the caller), so this function
 * only drives the routing — emitting here as well double-logged every stage.
 */
export function emitShiftRoutingEvents(router: ShiftRouter): void {
  // The three fusion stages, each routed to its cast model.
  const stages: Array<"plan" | "build" | "review"> = ["plan", "build", "review"];
  for (const stage of stages) {
    try {
      router.route(stage);
    } catch {
      // routing events must never break the run
    }
  }
}

const SHIFT_STAGES: readonly Stage[] = ["plan", "build", "review"];
const SHIFT_TIERS = ["efficient", "capable"];
const SHIFT_POSTURES: readonly ShiftPosture[] = ["quality", "balanced", "saver"];

/**
 * Read the `shift` config slice (OK-9.7 operator priorities):
 *   "shift": { "posture": "quality"|"balanced"|"saver",
 *              "pins": { "floor": {"plan"|"build"|"review": "efficient"|"capable"},
 *                        "ceiling": "efficient"|"capable",
 *                        "never": ["provider/model"] } }
 * Unknown values are dropped, never guessed — a mis-typed pin must not
 * silently route somewhere the operator did not ask for.
 */
export function readShiftConfig(raw: Record<string, unknown>): { posture?: ShiftPosture; pins?: ShiftPins } {
  const shift = raw["shift"];
  if (typeof shift !== "object" || shift === null) return {};
  const out: { posture?: ShiftPosture; pins?: ShiftPins } = {};
  const posture = (shift as Record<string, unknown>)["posture"];
  if (typeof posture === "string" && SHIFT_POSTURES.some((p) => p === posture)) {
    out.posture = posture as ShiftPosture;
  }
  const pinsRaw = (shift as Record<string, unknown>)["pins"];
  if (typeof pinsRaw === "object" && pinsRaw !== null) {
    const pins: ShiftPins = {};
    const floorRaw = (pinsRaw as Record<string, unknown>)["floor"];
    if (typeof floorRaw === "object" && floorRaw !== null) {
      const floor: Partial<Record<Stage, "efficient" | "capable">> = {};
      for (const [stage, tier] of Object.entries(floorRaw as Record<string, unknown>)) {
        if (
          SHIFT_STAGES.some((s) => s === stage) &&
          typeof tier === "string" &&
          SHIFT_TIERS.includes(tier)
        ) {
          floor[stage as Stage] = tier as "efficient" | "capable";
        }
      }
      if (Object.keys(floor).length > 0) pins.floor = floor;
    }
    const ceiling = (pinsRaw as Record<string, unknown>)["ceiling"];
    if (typeof ceiling === "string" && SHIFT_TIERS.includes(ceiling)) {
      pins.ceiling = ceiling as "efficient" | "capable";
    }
    // Floor-above-ceiling is an operator error the clamp would silently
    // invert (the floor wins, the ceiling becomes a lie) — say so.
    if (pins.floor !== undefined && pins.ceiling === "efficient") {
      const offenders = Object.entries(pins.floor).filter(([, tier]) => tier === "capable");
      if (offenders.length > 0) {
        process.stderr.write(
          `[openkai] shift config: floor ${offenders.map(([stage]) => stage).join("/")}=capable sits above ceiling=efficient — the ceiling wins at route time; fix the pins\n`,
        );
      }
    }
    const never = (pinsRaw as Record<string, unknown>)["never"];
    if (Array.isArray(never)) {
      const list = never.filter((m): m is string => typeof m === "string");
      if (list.length > 0) pins.never = list;
    }
    if (pins.floor !== undefined || pins.ceiling !== undefined || pins.never !== undefined) {
      out.pins = pins;
    }
  }
  return out;
}

/**
 * Deterministic complexity bucket for the reward writeback (OK-9 W5). A
 * prompt-length proxy — crude but stable — until the calibration harness
 * (W6) owns complexity classification. Buckets key the bandit's per-bucket
 * arms; the strings must match the low/medium/high vocabulary.
 */
function bucketForTask(prompt: string): string {
  if (prompt.length < 160) return "low";
  if (prompt.length < 640) return "medium";
  return "high";
}

export async function runFuse(options: FuseCliOptions): Promise<number> {
  const models = defaultModels();
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

  // ── E017 Inc 02: orchestration facade (production wiring) ─────────────
  // Stage classification + the tier decision live in the Orchestrator
  // (OK-9.3 composition contract) — no hand-wired ShiftRouter.classify. The
  // ShiftRouter stays for what it owns: the budget guard and the provider
  // fallback chain on the execution path. Both write through the SAME
  // appendActivity seam (the TUI's onActivity writer — no parallel writer).
  const cwd = process.cwd();
  // The single activity seam for every routing event this run emits —
  // shift routes, tier decisions, the judge break-even meter (OK-9 W7).
  const sink = (event: RoutingEvent): void => {
    appendActivity(cwd, event.kind, {
      stage: event.stage,
      model: event.model,
      provider: event.provider,
      attempt: event.attempt,
      tier: event.tier,
      source: event.source,
      reason: event.reason,
    });
  };
  let orchestrator: Orchestrator | undefined;
  let stage: Stage | undefined;
  if (cast) {
    // Fallback casts: all OTHER casts from the config (cross-provider).
    const allCasts = listCasts(config);
    const fallbackCasts: Cast[] = allCasts.filter((c) => c.id !== cast.id);

    const router = new ShiftRouter({
      cast,
      fallbackCasts,
      onActivity: sink,
    });

    // The facade: the selected cast is the CAPABLE member of each stage's
    // pair; the cheapest same-provider cast supplies the efficient member.
    const shift = readShiftConfig(rawConfig);
    orchestrator = new Orchestrator({
      cwd,
      castConfig: { ...config, defaultCast: cast.id },
      posture: shift.posture,
      pins: shift.pins,
      onActivity: sink,
    });

    // First turn: no tool history yet — the scorer sees an empty window and
    // the posture default decides (OK-9 risk 1: stage default + stickiness).
    const decision = orchestrator.decide(
      { prompt: options.prompt },
      { signals: [], turnDepth: 0, compacted: false },
    );
    stage = decision.stage;
    if (!options.quiet) {
      process.stderr.write(
        `[openkai] shift: prompt classified as "${stage}" stage, tier=${decision.tier} (${decision.source})\n`,
      );
    }

    // Emit routing events for all three fusion stages. Each stage routes to
    // its cast model (architect→plan, builder→build, judge→review). These
    // events show up in `openkai tail` with distinct models per stage.
    emitShiftRoutingEvents(router);
  }

  const logPath = defaultFusionLogPath();
  if (!options.quiet) {
    process.stderr.write(
      `[openkai] fuse: architect=${architect.id} builder=${builder.id} judge=${judge.id} gate=${options.gate ? "on" : "off"}\n`,
    );
  }

  try {
    const bucket = bucketForTask(options.prompt);
    // The panel for the current attempt — the cascade retry swaps both roles
    // to the escalated (capable-tier) model as a self-pair (E016 default).
    let panel = { architectModel: architect, builderModel: builder, judgeModel: judge };
    let cascadeSpent = false;
    // True only when the cascade actually produced a retry (L2: the verdict
    // must not claim "after the cascade retry" when escalation was suppressed).
    let cascadeRan = false;
    // Set when the cascade block already recorded this attempt's fail — the
    // bottom writeback must not double-count it (E017 review). Reset per
    // attempt at the loop top.
    let attemptRecorded = false;
    // True while the escalated cascade attempt runs — approveGate asks for
    // fresh consent on a TTY instead of reusing the original --yes.
    let cascadeActive = false;

    for (;;) {
      attemptRecorded = false;
      // Judge break-even meter (OK-9 W7): logged per run attempt from live
      // catalogue pricing — the judge arbitrates the cheap↔dear gap between
      // the builder and architect tiers of the CURRENT panel (the cascade
      // retry re-prices against the escalated pair).
      sink(
        judgeBreakEvenEvent(
          judgeBreakEven({
            judge: panel.judgeModel,
            cheap: panel.builderModel,
            dear: panel.architectModel,
          }),
          panel.judgeModel.id,
          { cheap: panel.builderModel.id, dear: panel.architectModel.id },
        ),
      );

      const result = await fuse(
        (model, context, opts) => models.streamSimple(model, context, opts),
        {
          task: options.prompt,
          architectModel: panel.architectModel,
          builderModel: panel.builderModel,
          judgeModel: panel.judgeModel,
          gate: options.gate,
          maxRounds: options.maxRounds,
          // Consent parity (E001 §2): the gate's checks are model-authored
          // shell with operator privileges. Print them; only --yes executes.
          // --yes covers ONE attempt: the cascade retry is a second, dearer
          // panel and asks again on a TTY (non-TTY keeps the flag's consent —
          // there is nobody to ask). E017 review.
          approveGate: (checks) => {
            const isCascadeAttempt = cascadeActive;
            process.stderr.write("\n[openkai] validator-designed gate (model-authored shell):\n");
            for (const [i, c] of checks.entries()) {
              process.stderr.write(`  ${i + 1}. ${c.name}\n     $ ${c.command}\n`);
            }
            if (!options.yes) {
              process.stderr.write("gate REFUSED — rerun with --yes to execute these checks.\n");
              return false;
            }
            if (isCascadeAttempt && process.stdin.isTTY) {
              process.stderr.write(
                "cascade retry (escalated panel) — original --yes does not carry over; refusing. Re-run interactively to approve.\n",
              );
              return false;
            }
            process.stderr.write("gate approved via --yes.\n");
            return true;
          },
        },
      );

      await recordFusionRun(result.record, logPath);

      // ── E017 Inc 04: cascade completion (OK-9.3 rule 2) ───────────────
      // A gate halt at the retry cap escalates the stage one tier and
      // retries ONCE — verify-then-escalate, never escalate on vibes. The
      // halted attempt's failure is the bandit reward for the pair that
      // served it (recorded BEFORE escalation moves the last-decision
      // pointer). A ceiling pin suppresses the escalation — the documented
      // cost-certainty posture, so there is nothing to retry at.
      if (
        options.gate &&
        result.gate.outcome === "halt" &&
        orchestrator !== undefined &&
        stage !== undefined &&
        !cascadeSpent
      ) {
        // Credit the models that SERVED the halted attempt, not the
        // orchestrator's advisory pick (E017 review: phantom arms).
        orchestrator.noteGateOutcome("fail", bucket, [panel.architectModel.id, panel.builderModel.id]);
        attemptRecorded = true;
        cascadeSpent = true;
        cascadeActive = true;
        const escalation = orchestrator.escalate(stage);
        if (escalation.tier === "capable") {
          const escalatedModel = models.getModel(escalation.provider, escalation.model);
          if (escalatedModel) {
            if (!options.quiet) {
              process.stderr.write(
                `[openkai] cascade: gate halted at the retry cap — escalating stage "${stage}" ` +
                  `to ${escalation.provider}/${escalation.model} and retrying once (OK-9.3 rule 2)\n`,
              );
            }
            panel = { architectModel: escalatedModel, builderModel: escalatedModel, judgeModel: judge };
            cascadeRan = true;
            continue;
          }
        }
        if (!options.quiet) {
          process.stderr.write(
            `[openkai] cascade: escalation suppressed or model unavailable (${escalation.reason}) — halting.\n`,
          );
        }
      }

      // Reward writeback (OK-9 W5): only real verdicts teach the router —
      // refused/weak-gate/not-run carry no evidence. Credit the panel that
      // served this attempt.
      if (
        orchestrator !== undefined &&
        !attemptRecorded &&
        (result.gate.outcome === "pass" || result.gate.outcome === "halt")
      ) {
        orchestrator.noteGateOutcome(result.gate.outcome === "pass" ? "pass" : "fail", bucket, [
          panel.architectModel.id,
          panel.builderModel.id,
        ]);
      }

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
                : `HALT — gate still failing after the retry cap${cascadeRan ? " and the cascade retry" : cascadeSpent ? " (cascade suppressed — no retry ran)" : ""} (escalate to triage)`;
        process.stdout.write(`\n══ GATE: ${verdict} ══\n`);
      }

      if (!options.quiet) {
        process.stderr.write(`[openkai] run ${result.runId} recorded at ${logPath}\n`);
      }
      if (result.gate.outcome === "refused") return 2;
      return options.gate && result.gate.outcome !== "pass" ? 1 : 0;
    }
  } catch (error) {
    if (error instanceof UnwinnableGateError) {
      // The print-mode CLI wires no applyWork (the workspace-write path lands
      // with the permission-gated write tools), so --gate can never flip a
      // RED baseline here. Say so plainly instead of dumping the throw.
      process.stderr.write(
        `openkai fuse --gate: gated runs need a workspace-write path (applyWork), ` +
          `which the CLI does not wire yet — completion-only roles cannot change ` +
          `the work tree, so the gate is unwinnable. Run without --gate.\n`,
      );
      return 2;
    }
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}
