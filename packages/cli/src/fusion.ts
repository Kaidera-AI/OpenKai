/**
 * openkai fusion report / fusion advise — the FU-5 readout and the FU-4
 * policy surface. `fusion calibrate` is the OK-9 W6/W7 harness: quadrant
 * table, threshold sweep recommendation, and the judge break-even line.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  defaultFusionLogPath,
  defaultModels,
  judgeBreakEven,
  readCalibrationRunsDetailed,
  readFusionRuns,
  renderCalibrationReport,
  resolveCast,
  runCalibration,
  shouldFuse,
  splitCalibrationArms,
  summariseFusionRuns,
  type CastConfig,
  type FusionPolicyInput,
  type FusionPriority,
  type FusionTaskClass,
  type JudgeBreakEven,
  type PricedModel,
} from "@kaidera/openkai-core";
import { resolveProvider } from "./providers.js";
import { readConfig } from "./tui/welcome.js";

export interface FusionReportOptions {
  last?: number;
}

const fmtMs = (ms: number): string =>
  ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;

/** `openkai fusion report` — per-model-pair A/B stats from the runs log. */
export async function runFusionReport(options: FusionReportOptions): Promise<number> {
  const logPath = defaultFusionLogPath();
  const all = await readFusionRuns(logPath);
  if (all.length === 0) {
    process.stdout.write(`no fusion runs recorded (${logPath})\n`);
    return 0;
  }
  const records = options.last ? all.slice(-options.last) : all;
  const stats = summariseFusionRuns(records);

  process.stdout.write(
    `fusion report — ${records.length} run(s) from ${logPath}\n\n`,
  );
  for (const s of stats) {
    const gate =
      s.gatePassRate === undefined
        ? "gate: n/a"
        : `gate pass: ${Math.round(s.gatePassRate * 100)}%`;
    process.stdout.write(
      `${s.pair}\n  runs ${s.runs} · ${gate} · avg wall ${fmtMs(s.avgWallMs)} · ` +
        `avg role latency ${fmtMs(s.avgRoleLatencyMs)} · ${s.totalTokens} tokens\n`,
    );
  }

  const latest = records[records.length - 1];
  if (latest) {
    process.stdout.write(
      `\nlatest run ${latest.runId} (${latest.ts})\n  task: ${latest.task.slice(0, 120)}\n  gate: ${latest.gate.outcome}\n`,
    );
  }
  return 0;
}

const PRIORITIES: readonly FusionPriority[] = ["low", "medium", "high", "urgent"];
const CLASSES: readonly FusionTaskClass[] = [
  "architecture",
  "ambiguous",
  "high-blast-radius",
  "routine",
];

export interface FusionAdviseOptions {
  priority?: string;
  taskClass?: string;
  filesBreadth?: number;
}

/** `openkai fusion advise` — evaluate the FU-4 policy for a task shape. */
export function runFusionAdvise(options: FusionAdviseOptions): number {
  if (options.priority && !PRIORITIES.includes(options.priority as FusionPriority)) {
    process.stderr.write(
      `ERROR: --priority must be one of ${PRIORITIES.join("|")}\n`,
    );
    return 2;
  }
  if (options.taskClass && !CLASSES.includes(options.taskClass as FusionTaskClass)) {
    process.stderr.write(`ERROR: --class must be one of ${CLASSES.join("|")}\n`);
    return 2;
  }

  const input: FusionPolicyInput = {
    priority: options.priority as FusionPriority | undefined,
    taskClass: options.taskClass as FusionTaskClass | undefined,
    filesBreadth: options.filesBreadth,
  };
  const decision = shouldFuse(input);
  process.stdout.write(
    `${decision.fuse ? "FUSE" : "SINGLE-MODEL"} — ${decision.reason}\n`,
  );
  return 0;
}

export interface FusionCalibrateOptions {
  /** Primary runs JSONL (default: .openkai/fusion/runs.jsonl under cwd). */
  runs?: string;
  /** Optional second JSONL (the capable-only baseline of OK-9.5's method). */
  baseline?: string;
  provider?: string;
  judgeModel?: string;
  cheapModel?: string;
  dearModel?: string;
  /** Dated-record directory (default: research/calibration under cwd). */
  recordDir?: string;
  cwd?: string;
}

/**
 * `openkai fusion calibrate` — the OK-9 W6/W7 harness. Reads calibration run
 * records (JSONL: {taskId, tier, score, outcome}), builds the
 * RESCUE/LOSS/SAFE/HARD quadrant table, sweeps the escalation threshold, and
 * prints the recommendation + judge break-even line. Every run writes a
 * dated record file under research/calibration/ (OK-9.5: calibration is a
 * shipped artefact).
 */
export async function runFusionCalibrate(
  options: FusionCalibrateOptions,
): Promise<number> {
  const cwd = options.cwd ?? process.cwd();
  const runsPath = path.resolve(cwd, options.runs ?? defaultFusionLogPath(cwd));
  const pooledRead = await readCalibrationRunsDetailed(runsPath);
  const pooled = pooledRead.runs;
  let skipped = pooledRead.skipped;
  let baselineNote = "";
  if (options.baseline) {
    const baselinePath = path.resolve(cwd, options.baseline);
    const baselineRead = await readCalibrationRunsDetailed(baselinePath);
    pooled.push(...baselineRead.runs);
    skipped += baselineRead.skipped;
    baselineNote = ` + ${baselinePath}`;
  }
  if (pooled.length === 0) {
    process.stdout.write(
      `no calibration runs recorded (${runsPath}${baselineNote})\n` +
        (skipped > 0 ? `note: ${skipped} line(s) were skipped as off-shape — the file is not the expected JSONL record shape\n` : "") +
        "record shape (JSONL): {\"taskId\":\"…\",\"tier\":\"capable\"|\"efficient\",\"score\":0..1,\"outcome\":\"pass\"|\"fail\"}\n",
    );
    return 0;
  }
  if (skipped > 0) {
    process.stderr.write(`[openkai] calibrate: ${skipped} off-shape line(s) skipped from the pooled history\n`);
  }

  const { capableRuns, efficientRuns } = splitCalibrationArms(pooled);
  const report = runCalibration({ capableRuns, efficientRuns });

  // Judge break-even (OK-9.4) from live catalogue pricing. Models come from
  // flags, else the configured/default cast (judge ← cast judge else
  // architect; cheap ← builder; dear ← architect). Catalogue lookup is
  // offline — no credential check here.
  const rawConfig = readConfig();
  const castConfig: CastConfig = {
    casts: Array.isArray(rawConfig["casts"])
      ? (rawConfig["casts"] as CastConfig["casts"])
      : undefined,
    defaultCast:
      typeof rawConfig["defaultCast"] === "string"
        ? (rawConfig["defaultCast"] as string)
        : undefined,
  };
  const cast = resolveCast(undefined, castConfig);
  const provider = resolveProvider(options.provider ?? cast?.provider);
  const catalogue = defaultModels();
  const resolvePriced = (id: string | undefined): PricedModel | undefined => {
    if (!id) return undefined;
    const model = catalogue.getModel(provider, id);
    return model ? { id: model.id, cost: model.cost } : undefined;
  };
  const judge = resolvePriced(options.judgeModel ?? cast?.judgeModel ?? cast?.architectModel);
  const cheap = resolvePriced(options.cheapModel ?? cast?.builderModel);
  const dear = resolvePriced(options.dearModel ?? cast?.architectModel);
  let breakEven: JudgeBreakEven | undefined;
  let pair: { cheap: string; dear: string } | undefined;
  if (judge && cheap && dear) {
    breakEven = judgeBreakEven({ judge, cheap, dear });
    pair = { cheap: cheap.id, dear: dear.id };
  }

  const lines = renderCalibrationReport(report, { breakEven, pair });
  if (!breakEven) {
    lines.push(
      "judge break-even: n/a (pass --judge-model/--cheap-model/--dear-model, " +
        "or configure a cast with catalogue-resolvable models)",
    );
  }
  for (const line of lines) process.stdout.write(`${line}\n`);

  // OK-9.5: every calibration run is a dated artefact under research/.
  const recordDir = path.resolve(cwd, options.recordDir ?? "research/calibration");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const recordPath = path.join(recordDir, `${stamp}-calibration.md`);
  const record =
    `# calibration run ${new Date().toISOString()}\n\n` +
    `inputs: ${runsPath}${baselineNote}\n\n` +
    "```\n" +
    lines.join("\n") +
    "\n```\n";
  try {
    await fs.mkdir(recordDir, { recursive: true });
    await fs.writeFile(recordPath, record, "utf-8");
    process.stdout.write(`\nrecord: ${recordPath}\n`);
  } catch (error) {
    process.stderr.write(
      `WARNING: calibration record not written (${recordPath}): ${String(error)}\n`,
    );
  }
  return 0;
}
