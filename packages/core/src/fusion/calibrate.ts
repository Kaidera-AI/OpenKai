/**
 * Calibration harness + judge economics (OK-9 W6/W7; evidence base
 * research/2026-08-18-switchyard-routing-fusion-deep-dive.md [DD]).
 *
 * QUADRANT METHOD (Switchyard, DD §2): pair pure-capable and pure-efficient
 * counterfactual runs by task id, then sweep the corroborative escalation
 * threshold. Quadrants are named from the router's efficient-first operating
 * point so Switchyard's selection rule reads literally:
 *   RESCUE — efficient-fail ∩ capable-pass (escalation rescues the task)
 *   LOSS   — efficient-pass ∩ capable-fail (escalation loses quality)
 *   SAFE   — both pass · HARD — both fail
 * (The deep-dive's parentheticals record the same four sets from the capable
 * arm's perspective; the rule — "the lowest threshold that rescues RESCUE
 * without over-escalating LOSS" — only operates from the router's side.)
 * DD's caveat applies: in-router efficient outcomes inherit capable-arm
 * context, so counterfactual pure-efficient runs are the honest arm, and any
 * measured RESCUE rate is a bound, not a point estimate.
 *
 * CPT/APGR REPORT (RouteLLM's evaluation frame, DD §5): per threshold, the
 * strong-call fraction (x) against the quality gap closed between the
 * efficient-only and capable-only baselines (y).
 *
 * JUDGE BREAK-EVEN (OK-9.4; LangChain's formula, DD §1): a routing judge
 * pays for itself when offloaded fraction × (dear − cheap) ≥ judge cost,
 * i.e. breakEven = judgeCost / (dearCost − cheapCost), computed from live
 * catalogue rates ($/1M tokens). A judge whose break-even ≥ 1 can never pay
 * for itself — the posture default serves instead.
 */

import { promises as fs } from "node:fs";

import type { RoutingEvent } from "../shift/activity.js";
import type { Tier } from "../shift/tier.js";

/** One recorded calibration run: one task, one tier, one outcome. */
export interface CalibrationRun {
  taskId: string;
  /** The tier arm this run served. */
  tier: Tier;
  /**
   * The corroborative scorer value recorded for the task at routing time
   * (0..1) — the quantity the threshold sweeps against.
   */
  score: number;
  outcome: "pass" | "fail";
}

export type CalibrationQuadrant = "rescue" | "loss" | "safe" | "hard";

/** Per-threshold row of the sweep (the CPT/APGR report line). */
export interface CalibrationRow {
  threshold: number;
  /** Paired tasks escalated to the capable tier at this threshold. */
  escalated: number;
  /** RESCUE-quadrant tasks escalated (rescued) at this threshold. */
  rescued: number;
  rescueTotal: number;
  /** LOSS-quadrant tasks escalated (over-escalated) at this threshold. */
  overEscalatedLoss: number;
  lossTotal: number;
  /** SAFE/HARD escalations — pure cost, no quality effect either way. */
  safeEscalated: number;
  hardEscalated: number;
  /** CPT x-axis: fraction of paired tasks served by the strong tier. */
  strongCallFraction: number;
  /** Pass rate of the routed mix at this threshold. */
  routedQuality: number;
  /**
   * APGR y-axis: fraction of the efficient→capable quality gap the routed
   * mix closes. Undefined when the arms tie (no gap to close).
   */
  qualityGapClosed: number | undefined;
}

export interface CalibrationReport {
  /** Tasks present in BOTH arms — the only tasks that enter a quadrant. */
  paired: number;
  capableRuns: number;
  efficientRuns: number;
  /** Task ids seen in only one arm (reported, excluded from quadrants). */
  unpairedCapable: string[];
  unpairedEfficient: string[];
  quadrants: Record<CalibrationQuadrant, string[]>;
  /** Pass rates over the paired set (the APGR baselines). */
  capableQuality: number;
  efficientQuality: number;
  rows: CalibrationRow[];
  recommendedThreshold: number | undefined;
  recommendationReason: string;
}

/**
 * The swept candidates (OK-9 W6): 0.3..0.8 in 0.05 steps. The band brackets
 * Switchyard's shipped 0.5 (one maxed signal ≈ 0.4621) on both sides.
 */
export const CALIBRATION_THRESHOLDS: readonly number[] = [
  0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8,
];

/** Minimal shape check — corrupt or schema-drifting lines are skipped. */
export function isCalibrationRun(value: unknown): value is CalibrationRun {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["taskId"] === "string" &&
    v["taskId"].length > 0 &&
    (v["tier"] === "efficient" || v["tier"] === "capable") &&
    typeof v["score"] === "number" &&
    Number.isFinite(v["score"]) &&
    v["score"] >= 0 &&
    v["score"] <= 1 &&
    (v["outcome"] === "pass" || v["outcome"] === "fail")
  );
}

/**
 * Read a JSONL file of {@link CalibrationRun} records. One corrupt line is
 * skipped, never fatal — same posture as the fusion runs log. A missing file
 * reads as empty.
 */
export async function readCalibrationRuns(logPath: string): Promise<CalibrationRun[]> {
  let text: string;
  try {
    text = await fs.readFile(logPath, "utf-8");
  } catch {
    return [];
  }
  const runs: CalibrationRun[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isCalibrationRun(parsed)) runs.push(parsed);
    } catch {
      // skip the corrupt line, keep the rest of the history
    }
  }
  return runs;
}

/** Split pooled records into the two arms by their recorded tier. */
export function splitCalibrationArms(runs: readonly CalibrationRun[]): {
  capableRuns: CalibrationRun[];
  efficientRuns: CalibrationRun[];
} {
  return {
    capableRuns: runs.filter((r) => r.tier === "capable"),
    efficientRuns: runs.filter((r) => r.tier === "efficient"),
  };
}

/**
 * The quadrant table + threshold sweep + recommendation. Pure over the run
 * records: same input → same report.
 *
 * Pairing: the last record per task id within an arm wins (re-runs supersede).
 * The task's routing score comes from the capable arm when present — that is
 * the in-router arm — else from the efficient counterfactual.
 */
export function runCalibration(input: {
  capableRuns: readonly CalibrationRun[];
  efficientRuns: readonly CalibrationRun[];
  thresholds?: readonly number[];
}): CalibrationReport {
  const thresholds = input.thresholds ?? CALIBRATION_THRESHOLDS;

  const capableByTask = new Map<string, CalibrationRun>();
  for (const run of input.capableRuns) capableByTask.set(run.taskId, run);
  const efficientByTask = new Map<string, CalibrationRun>();
  for (const run of input.efficientRuns) efficientByTask.set(run.taskId, run);

  const quadrants: Record<CalibrationQuadrant, string[]> = {
    rescue: [],
    loss: [],
    safe: [],
    hard: [],
  };
  const scores = new Map<string, number>();
  const pairedOutcomes = new Map<string, { capable: boolean; efficient: boolean }>();
  for (const [taskId, capable] of capableByTask) {
    const efficient = efficientByTask.get(taskId);
    if (!efficient) continue;
    scores.set(taskId, capable.score);
    pairedOutcomes.set(taskId, {
      capable: capable.outcome === "pass",
      efficient: efficient.outcome === "pass",
    });
    if (capable.outcome === "pass" && efficient.outcome === "fail") {
      quadrants.rescue.push(taskId);
    } else if (capable.outcome === "fail" && efficient.outcome === "pass") {
      quadrants.loss.push(taskId);
    } else if (capable.outcome === "pass") {
      quadrants.safe.push(taskId);
    } else {
      quadrants.hard.push(taskId);
    }
  }
  const paired = pairedOutcomes.size;
  const unpairedCapable = [...capableByTask.keys()].filter((id) => !efficientByTask.has(id));
  const unpairedEfficient = [...efficientByTask.keys()].filter((id) => !capableByTask.has(id));

  const capableQuality =
    paired === 0
      ? 0
      : [...pairedOutcomes.values()].filter((o) => o.capable).length / paired;
  const efficientQuality =
    paired === 0
      ? 0
      : [...pairedOutcomes.values()].filter((o) => o.efficient).length / paired;
  const qualityGap = capableQuality - efficientQuality;

  const escalates = (taskId: string, threshold: number): boolean =>
    (scores.get(taskId) ?? 0) >= threshold;

  const rows: CalibrationRow[] = thresholds.map((threshold) => {
    const escalated = [...pairedOutcomes.keys()].filter((id) => escalates(id, threshold));
    let routedPasses = 0;
    for (const [id, outcome] of pairedOutcomes) {
      const pass = escalates(id, threshold) ? outcome.capable : outcome.efficient;
      if (pass) routedPasses += 1;
    }
    const routedQuality = paired === 0 ? 0 : routedPasses / paired;
    return {
      threshold,
      escalated: escalated.length,
      rescued: quadrants.rescue.filter((id) => escalates(id, threshold)).length,
      rescueTotal: quadrants.rescue.length,
      overEscalatedLoss: quadrants.loss.filter((id) => escalates(id, threshold)).length,
      lossTotal: quadrants.loss.length,
      safeEscalated: quadrants.safe.filter((id) => escalates(id, threshold)).length,
      hardEscalated: quadrants.hard.filter((id) => escalates(id, threshold)).length,
      strongCallFraction: paired === 0 ? 0 : escalated.length / paired,
      routedQuality,
      qualityGapClosed:
        qualityGap === 0 ? undefined : (routedQuality - efficientQuality) / qualityGap,
    };
  });

  const { recommendedThreshold, recommendationReason } = recommendThreshold(
    rows,
    quadrants.rescue.length,
  );

  return {
    paired,
    capableRuns: input.capableRuns.length,
    efficientRuns: input.efficientRuns.length,
    unpairedCapable,
    unpairedEfficient,
    quadrants,
    capableQuality,
    efficientQuality,
    rows,
    recommendedThreshold,
    recommendationReason,
  };
}

/**
 * Switchyard's selection rule (DD §2, cited verbatim in OK-9.5): the LOWEST
 * threshold that rescues RESCUE without over-escalating LOSS. Rows ascend by
 * threshold, so the first match is the lowest. When no threshold rescues all
 * of RESCUE cleanly the rule degrades loudly — the reason string says which
 * fallback fired, because a calibrated artefact must admit when the data
 * cannot separate the quadrants.
 */
function recommendThreshold(
  rows: readonly CalibrationRow[],
  rescueTotal: number,
): { recommendedThreshold: number | undefined; recommendationReason: string } {
  if (rows.length === 0) {
    return { recommendedThreshold: undefined, recommendationReason: "no thresholds swept" };
  }
  const top = rows[rows.length - 1]!;
  if (rescueTotal === 0) {
    return {
      recommendedThreshold: top.threshold,
      recommendationReason:
        "no RESCUE quadrant in the data — nothing justifies escalation; " +
        "hold the efficient-biased end of the sweep until RESCUE evidence exists",
    };
  }
  const perfect = rows.filter((r) => r.rescued === r.rescueTotal && r.overEscalatedLoss === 0);
  if (perfect.length > 0) {
    return {
      recommendedThreshold: perfect[0]!.threshold,
      recommendationReason:
        "lowest threshold rescuing all of RESCUE without over-escalating LOSS (Switchyard's rule)",
    };
  }
  const fullRescue = rows.filter((r) => r.rescued === r.rescueTotal);
  if (fullRescue.length > 0) {
    const bestLoss = Math.min(...fullRescue.map((r) => r.overEscalatedLoss));
    const tied = fullRescue.filter((r) => r.overEscalatedLoss === bestLoss);
    // The clean-rule premise has already failed, so quality ties break toward
    // the cheapest end (the highest threshold escalates fewer SAFE tasks).
    const chosen = tied[tied.length - 1]!;
    return {
      recommendedThreshold: chosen.threshold,
      recommendationReason:
        `rescues all of RESCUE but ${bestLoss} LOSS task(s) escalate at every such ` +
        "threshold — the sweep cannot separate the quadrants; collect more runs " +
        "(quality-tied candidates broken toward the fewest strong calls)",
    };
  }
  const scored = rows.map((r) => ({ row: r, net: r.rescued - r.overEscalatedLoss }));
  const bestNet = Math.max(...scored.map((s) => s.net));
  const chosen = scored.find((s) => s.net === bestNet)!;
  return {
    recommendedThreshold: chosen.row.threshold,
    recommendationReason:
      `partial rescue only (${chosen.row.rescued}/${rescueTotal} RESCUE at best net ` +
      `${bestNet}) — no swept threshold rescues all of RESCUE; keep the default and ` +
      "collect more runs before locking a posture preset",
  };
}

// ── Judge break-even (OK-9.4 / W7, LangChain's formula) ───────────────────

/** Catalogue rates in USD per million tokens (the pi-ai ModelCostRates shape). */
export interface ModelRates {
  input: number;
  output: number;
}

/** Token estimate for one call, used to turn catalogue rates into per-call cost. */
export interface CallTokenEstimate {
  inputTokens: number;
  outputTokens: number;
}

/** A short classification verdict: prompt + bounded reply. */
export const DEFAULT_JUDGE_TOKENS: CallTokenEstimate = {
  inputTokens: 2_000,
  outputTokens: 500,
};
/** A mid-size agentic turn (tool transcript in, patch out). */
export const DEFAULT_CALL_TOKENS: CallTokenEstimate = {
  inputTokens: 10_000,
  outputTokens: 2_000,
};

/** Cost in USD of one call at catalogue rates ($/1M tokens). */
export function callCostUsd(rates: ModelRates, estimate: CallTokenEstimate): number {
  return (rates.input * estimate.inputTokens + rates.output * estimate.outputTokens) / 1_000_000;
}

/** Any catalogue model with pricing satisfies this (pi-ai Model included). */
export interface PricedModel {
  id: string;
  cost: ModelRates;
}

export interface JudgeBreakEvenInput {
  judge: PricedModel;
  cheap: PricedModel;
  dear: PricedModel;
  judgeTokens?: CallTokenEstimate;
  callTokens?: CallTokenEstimate;
}

export interface JudgeBreakEven {
  judgeCostUsd: number;
  cheapCostUsd: number;
  dearCostUsd: number;
  /**
   * LangChain's break-even: judgeCost / (dearCost − cheapCost) — the fraction
   * of calls that must offload to the cheap tier for the judge to pay for
   * itself. Undefined when the tier gap is not positive (economics
   * unmeasurable — a dear tier priced at or below cheap).
   */
  breakEven: number | undefined;
  /** True when the judge can ever pay for itself (breakEven defined and < 1). */
  viable: boolean;
}

/**
 * The judge break-even meter (OK-9.4): computed from live catalogue pricing,
 * so a provider repricing flips the verdict without a code change.
 */
export function judgeBreakEven(input: JudgeBreakEvenInput): JudgeBreakEven {
  const judgeCostUsd = callCostUsd(input.judge.cost, input.judgeTokens ?? DEFAULT_JUDGE_TOKENS);
  const cheapCostUsd = callCostUsd(input.cheap.cost, input.callTokens ?? DEFAULT_CALL_TOKENS);
  const dearCostUsd = callCostUsd(input.dear.cost, input.callTokens ?? DEFAULT_CALL_TOKENS);
  const gap = dearCostUsd - cheapCostUsd;
  const breakEven = gap > 0 ? judgeCostUsd / gap : undefined;
  return {
    judgeCostUsd,
    cheapCostUsd,
    dearCostUsd,
    breakEven,
    viable: breakEven !== undefined && breakEven < 1,
  };
}

const usd = (n: number): string => `$${n.toFixed(6)}`;

/**
 * The one-line judge-economics reading (report line and event reason share
 * this wording so the feed and the artefact never disagree).
 */
export function judgeBreakEvenLine(
  be: JudgeBreakEven,
  pair: { cheap: string; dear: string },
): string {
  if (be.breakEven === undefined) {
    return (
      `judge break-even: n/a — dear tier (${pair.dear}) is not priced above ` +
      `cheap (${pair.cheap}); judge economics unmeasurable`
    );
  }
  const pct = `${(be.breakEven * 100).toFixed(1)}%`;
  const verdict = be.viable
    ? `pays for itself when ≥${pct} of calls route cheap`
    : "never pays for itself — skip the judge and serve the default tier";
  return (
    `judge break-even: ${pct} — judge ${usd(be.judgeCostUsd)}/call vs tier gap ` +
    `${usd(be.dearCostUsd - be.cheapCostUsd)}/call (cheap ${pair.cheap}, dear ${pair.dear}); ` +
    verdict
  );
}

/**
 * The activity-feed form of the break-even meter (OK-9 W7): emitted through
 * the same redacting sink as every routing event when a fusion run resolves
 * its judge. The judge arbitrates merges, so it rides the review stage.
 */
export function judgeBreakEvenEvent(
  be: JudgeBreakEven,
  judgeModelId: string,
  pair: { cheap: string; dear: string },
): RoutingEvent {
  return {
    kind: "routing",
    stage: "review",
    model: judgeModelId,
    reason: judgeBreakEvenLine(be, pair),
  };
}

// ── Report rendering ───────────────────────────────────────────────────────

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const col = (s: string, w: number): string => s.padEnd(w);

/**
 * Render the quadrant table + threshold sweep + recommendation as plain
 * lines (the CLI prints them; the dated record file embeds them).
 */
export function renderCalibrationReport(
  report: CalibrationReport,
  options?: { breakEven?: JudgeBreakEven; pair?: { cheap: string; dear: string } },
): string[] {
  const lines: string[] = [];
  lines.push(
    `calibration — ${report.paired} paired task(s) ` +
      `(${report.capableRuns} capable / ${report.efficientRuns} efficient runs)`,
  );
  const unpaired = report.unpairedCapable.length + report.unpairedEfficient.length;
  if (unpaired > 0) {
    lines.push(
      `unpaired (excluded): ${report.unpairedCapable.length} capable-only, ` +
        `${report.unpairedEfficient.length} efficient-only`,
    );
  }
  lines.push("");
  lines.push(
    `quadrants — RESCUE ${report.quadrants.rescue.length} · ` +
      `LOSS ${report.quadrants.loss.length} · ` +
      `SAFE ${report.quadrants.safe.length} · HARD ${report.quadrants.hard.length}`,
  );
  lines.push(
    `baselines — capable ${pct(report.capableQuality)} pass · ` +
      `efficient ${pct(report.efficientQuality)} pass`,
  );
  lines.push("");
  lines.push(
    col("threshold", 10) +
      col("strong%", 9) +
      col("gap-closed", 12) +
      col("rescued", 10) +
      col("loss-esc", 10) +
      "safe/hard-esc",
  );
  for (const row of report.rows) {
    lines.push(
      col(row.threshold.toFixed(2), 10) +
        col(pct(row.strongCallFraction), 9) +
        col(row.qualityGapClosed === undefined ? "n/a" : pct(row.qualityGapClosed), 12) +
        col(`${row.rescued}/${row.rescueTotal}`, 10) +
        col(`${row.overEscalatedLoss}/${row.lossTotal}`, 10) +
        `${row.safeEscalated}/${row.hardEscalated}`,
    );
  }
  lines.push("");
  if (report.recommendedThreshold === undefined) {
    lines.push(`recommendation: none — ${report.recommendationReason}`);
  } else {
    lines.push(
      `recommendation: threshold ${report.recommendedThreshold.toFixed(2)} — ` +
        report.recommendationReason,
    );
  }
  if (options?.breakEven && options.pair) {
    lines.push(judgeBreakEvenLine(options.breakEven, options.pair));
  }
  return lines;
}
