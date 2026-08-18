/**
 * OK-9 W6/W7 calibration harness tests. Synthetic counterfactual run sets
 * with known quadrant membership; the threshold recommendation must follow
 * Switchyard's rule (lowest threshold rescuing RESCUE without
 * over-escalating LOSS); the judge break-even meter follows LangChain's
 * formula. The end-to-end case drives the built CLI on a fixture file.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  callCostUsd,
  isCalibrationRun,
  judgeBreakEven,
  judgeBreakEvenEvent,
  judgeBreakEvenLine,
  readCalibrationRuns,
  renderCalibrationReport,
  runCalibration,
  splitCalibrationArms,
  type CalibrationRun,
} from "@kaidera/openkai-core";

/** r1-3 RESCUE · l1-2 LOSS · s1-4 SAFE · h1-2 HARD · u1 unpaired. */
function fixtureRuns(): { capableRuns: CalibrationRun[]; efficientRuns: CalibrationRun[] } {
  const task = (
    id: string,
    score: number,
    capable: "pass" | "fail",
    efficient: "pass" | "fail",
  ): { capableRuns: CalibrationRun[]; efficientRuns: CalibrationRun[] } => ({
    capableRuns: [{ taskId: id, tier: "capable", score, outcome: capable }],
    efficientRuns: [{ taskId: id, tier: "efficient", score, outcome: efficient }],
  });
  const parts = [
    task("r1", 0.55, "pass", "fail"),
    task("r2", 0.6, "pass", "fail"),
    task("r3", 0.65, "pass", "fail"),
    task("l1", 0.35, "fail", "pass"),
    task("l2", 0.4, "fail", "pass"),
    task("s1", 0.3, "pass", "pass"),
    task("s2", 0.45, "pass", "pass"),
    task("s3", 0.5, "pass", "pass"),
    task("s4", 0.7, "pass", "pass"),
    task("h1", 0.75, "fail", "fail"),
    task("h2", 0.8, "fail", "fail"),
  ];
  return {
    capableRuns: [
      ...parts.flatMap((p) => p.capableRuns),
      { taskId: "u1", tier: "capable", score: 0.5, outcome: "pass" },
    ],
    efficientRuns: parts.flatMap((p) => p.efficientRuns),
  };
}

test("quadrants: synthetic run set lands in the expected quadrants", () => {
  const report = runCalibration(fixtureRuns());
  assert.equal(report.paired, 11);
  assert.deepEqual([...report.quadrants.rescue].sort(), ["r1", "r2", "r3"]);
  assert.deepEqual([...report.quadrants.loss].sort(), ["l1", "l2"]);
  assert.deepEqual([...report.quadrants.safe].sort(), ["s1", "s2", "s3", "s4"]);
  assert.deepEqual([...report.quadrants.hard].sort(), ["h1", "h2"]);
  assert.deepEqual(report.unpairedCapable, ["u1"]);
  assert.deepEqual(report.unpairedEfficient, []);
  // Baselines: capable 7/11, efficient 6/11.
  assert.ok(Math.abs(report.capableQuality - 7 / 11) < 1e-9);
  assert.ok(Math.abs(report.efficientQuality - 6 / 11) < 1e-9);
});

test("sweep: strong-call fraction and quality-gap-closed per threshold (CPT/APGR)", () => {
  const report = runCalibration(fixtureRuns());
  const at = (t: number) => report.rows.find((r) => Math.abs(r.threshold - t) < 1e-9)!;

  // 0.45: escalated = r1-3, s2-4, h1-2 (8 tasks); no LOSS escalated.
  const mid = at(0.45);
  assert.equal(mid.escalated, 8);
  assert.equal(mid.rescued, 3);
  assert.equal(mid.overEscalatedLoss, 0);
  assert.equal(mid.safeEscalated, 3);
  assert.equal(mid.hardEscalated, 2);
  assert.ok(Math.abs(mid.strongCallFraction - 8 / 11) < 1e-9);
  // Routed passes: 6 escalated-capable + 3 unescalated-efficient = 9/11;
  // gap closed = (9/11 − 6/11) / (1/11) = 3.
  assert.ok(Math.abs(mid.routedQuality - 9 / 11) < 1e-9);
  assert.ok(mid.qualityGapClosed !== undefined);
  assert.ok(Math.abs(mid.qualityGapClosed! - 3) < 1e-9);

  // 0.80: only h2 escalates — one HARD task, nothing rescued.
  const top = at(0.8);
  assert.equal(top.escalated, 1);
  assert.equal(top.rescued, 0);
});

test("recommendation: lowest threshold rescuing RESCUE without over-escalating LOSS", () => {
  const report = runCalibration(fixtureRuns());
  // 0.45 is the lowest sweep point at which all of RESCUE (≥0.55) is
  // escalated while both LOSS tasks (0.35, 0.40) stay unescalated.
  assert.equal(report.recommendedThreshold, 0.45);
  assert.match(report.recommendationReason, /Switchyard/);
});

test("recommendation: no RESCUE quadrant holds the efficient-biased end", () => {
  const report = runCalibration({
    capableRuns: [
      { taskId: "a", tier: "capable", score: 0.9, outcome: "pass" },
      { taskId: "b", tier: "capable", score: 0.1, outcome: "fail" },
    ],
    efficientRuns: [
      { taskId: "a", tier: "efficient", score: 0.9, outcome: "pass" },
      { taskId: "b", tier: "efficient", score: 0.1, outcome: "fail" },
    ],
  });
  assert.equal(report.quadrants.rescue.length, 0);
  assert.equal(report.recommendedThreshold, 0.8);
  assert.match(report.recommendationReason, /no RESCUE/);
});

test("recommendation: unseparable quadrants degrade loudly", () => {
  // The RESCUE task scores below the LOSS task — full rescue always
  // over-escalates LOSS; the report must say so instead of faking a clean pick.
  const report = runCalibration({
    capableRuns: [
      { taskId: "r", tier: "capable", score: 0.5, outcome: "pass" },
      { taskId: "l", tier: "capable", score: 0.7, outcome: "fail" },
    ],
    efficientRuns: [
      { taskId: "r", tier: "efficient", score: 0.5, outcome: "fail" },
      { taskId: "l", tier: "efficient", score: 0.7, outcome: "pass" },
    ],
  });
  assert.equal(report.recommendedThreshold, 0.5);
  assert.match(report.recommendationReason, /cannot separate/);
});

test("judge break-even: LangChain's formula from catalogue rates", () => {
  const be = judgeBreakEven({
    judge: { id: "judge", cost: { input: 0.1, output: 0.4 } },
    cheap: { id: "cheap", cost: { input: 0.05, output: 0.1 } },
    dear: { id: "dear", cost: { input: 1.0, output: 3.0 } },
  });
  // judge: (0.1×2000 + 0.4×500)/1e6 = $0.0004/call
  // cheap: (0.05×10000 + 0.1×2000)/1e6 = $0.0007/call
  // dear:  (1.0×10000 + 3.0×2000)/1e6 = $0.016/call
  assert.ok(Math.abs(be.judgeCostUsd - 0.0004) < 1e-12);
  assert.ok(Math.abs(be.cheapCostUsd - 0.0007) < 1e-12);
  assert.ok(Math.abs(be.dearCostUsd - 0.016) < 1e-12);
  assert.ok(be.breakEven !== undefined);
  assert.ok(Math.abs(be.breakEven! - 0.0004 / 0.0153) < 1e-9);
  assert.equal(be.viable, true);
  assert.match(judgeBreakEvenLine(be, { cheap: "cheap", dear: "dear" }), /pays for itself/);
});

test("judge break-even: no positive tier gap is unmeasurable, not zero", () => {
  const be = judgeBreakEven({
    judge: { id: "judge", cost: { input: 0.1, output: 0.4 } },
    cheap: { id: "cheap", cost: { input: 1.0, output: 3.0 } },
    dear: { id: "dear", cost: { input: 1.0, output: 3.0 } },
  });
  assert.equal(be.breakEven, undefined);
  assert.equal(be.viable, false);
  assert.match(judgeBreakEvenLine(be, { cheap: "cheap", dear: "dear" }), /n\/a/);
});

test("judge break-even: a judge dearer than the gap never pays for itself", () => {
  const be = judgeBreakEven({
    judge: { id: "judge", cost: { input: 5.0, output: 15.0 } },
    cheap: { id: "cheap", cost: { input: 0.05, output: 0.1 } },
    dear: { id: "dear", cost: { input: 0.1, output: 0.2 } },
  });
  assert.ok(be.breakEven !== undefined && be.breakEven > 1);
  assert.equal(be.viable, false);
  assert.match(judgeBreakEvenLine(be, { cheap: "cheap", dear: "dear" }), /never pays for itself/);
});

test("judge break-even event: routing shape on the review stage", () => {
  const be = judgeBreakEven({
    judge: { id: "j", cost: { input: 0.1, output: 0.4 } },
    cheap: { id: "c", cost: { input: 0.05, output: 0.1 } },
    dear: { id: "d", cost: { input: 1.0, output: 3.0 } },
  });
  const event = judgeBreakEvenEvent(be, "j", { cheap: "c", dear: "d" });
  assert.equal(event.kind, "routing");
  assert.equal(event.stage, "review");
  assert.equal(event.model, "j");
  assert.match(event.reason ?? "", /judge break-even/);
});

test("callCostUsd: token estimates scale catalogue rates", () => {
  const cost = callCostUsd(
    { input: 2.0, output: 8.0 },
    { inputTokens: 500_000, outputTokens: 100_000 },
  );
  assert.ok(Math.abs(cost - (2.0 * 0.5 + 8.0 * 0.1)) < 1e-12);
});

test("readCalibrationRuns: corrupt and off-shape lines are skipped", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "openkai-calibrate-"));
  try {
    const logPath = path.join(dir, "runs.jsonl");
    await writeFile(
      logPath,
      [
        JSON.stringify({ taskId: "ok", tier: "capable", score: 0.5, outcome: "pass" }),
        "not json at all",
        JSON.stringify({ taskId: "bad-tier", tier: "medium", score: 0.5, outcome: "pass" }),
        JSON.stringify({ taskId: "bad-score", tier: "capable", score: 1.5, outcome: "pass" }),
        JSON.stringify({ taskId: "fusion-shape", runId: "x", gate: { outcome: "pass" } }),
        "",
      ].join("\n"),
      "utf-8",
    );
    const runs = await readCalibrationRuns(logPath);
    assert.equal(runs.length, 1);
    assert.equal(runs[0]!.taskId, "ok");
    // A missing file reads as empty, never throws.
    assert.deepEqual(await readCalibrationRuns(path.join(dir, "absent.jsonl")), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("splitCalibrationArms + isCalibrationRun: tier partition and shape guard", () => {
  const { capableRuns, efficientRuns } = fixtureRuns();
  const arms = splitCalibrationArms([...capableRuns, ...efficientRuns]);
  assert.equal(arms.capableRuns.length, capableRuns.length);
  assert.equal(arms.efficientRuns.length, efficientRuns.length);
  assert.equal(isCalibrationRun({ taskId: "t", tier: "efficient", score: 0, outcome: "fail" }), true);
  assert.equal(isCalibrationRun({ taskId: "", tier: "efficient", score: 0, outcome: "fail" }), false);
  assert.equal(isCalibrationRun(null), false);
});

test("renderCalibrationReport: quadrant line, sweep rows, recommendation", () => {
  const lines = renderCalibrationReport(runCalibration(fixtureRuns()));
  const text = lines.join("\n");
  assert.match(text, /RESCUE 3 · LOSS 2 · SAFE 4 · HARD 2/);
  assert.match(text, /threshold\s+strong%\s+gap-closed/);
  assert.match(text, /recommendation: threshold 0\.45/);
  assert.match(text, /unpaired \(excluded\): 1 capable-only, 0 efficient-only/);
});

test("end-to-end: fusion calibrate on a synthetic fixture prints the table and writes a dated record", async () => {
  const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  const work = await mkdtemp(path.join(tmpdir(), "openkai-calibrate-e2e-"));
  try {
    const { capableRuns, efficientRuns } = fixtureRuns();
    const runsPath = path.join(work, "runs.jsonl");
    await writeFile(
      runsPath,
      [...capableRuns, ...efficientRuns].map((r) => JSON.stringify(r)).join("\n") + "\n",
      "utf-8",
    );
    const recordDir = path.join(work, "records");
    const out = execFileSync(
      process.execPath,
      [cliPath, "fusion", "calibrate", "--runs", runsPath, "--record-dir", recordDir],
      { cwd: work, env: { ...process.env, OPENKAI_HOME: work }, encoding: "utf-8" },
    );
    assert.match(out, /RESCUE 3 · LOSS 2 · SAFE 4 · HARD 2/);
    assert.match(out, /recommendation: threshold 0\.45/);
    assert.match(out, /judge break-even:/);
    assert.match(out, /record: /);
    // OK-9.5: a dated record file per run.
    const files = await readdir(recordDir);
    assert.equal(files.length, 1);
    assert.match(files[0]!, /-calibration\.md$/);
    const record = await readFile(path.join(recordDir, files[0]!), "utf-8");
    assert.match(record, /RESCUE 3/);
    assert.match(record, /inputs: /);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
});
