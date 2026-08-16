/**
 * openkai fusion report / fusion advise — the FU-5 readout and the FU-4
 * policy surface.
 */

import {
  defaultFusionLogPath,
  readFusionRuns,
  shouldFuse,
  summariseFusionRuns,
  type FusionPolicyInput,
  type FusionPriority,
  type FusionTaskClass,
} from "@kaidera/openkai-core";

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
