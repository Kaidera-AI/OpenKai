/**
 * FU-5-shaped telemetry: every fusion run is a controlled A/B on identical
 * input. Records are local-first (ren A1: standalone mode writes the same
 * file; the Cortex artifact export is Inc 06).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import type { FusionRunRecord } from "./types.js";

/** Default fusion telemetry log: `.openkai/fusion/runs.jsonl` under cwd. */
export function defaultFusionLogPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".openkai", "fusion", "runs.jsonl");
}

/** Append one run record. Creates the directory lazily; never throws on I/O
 *  failure — telemetry must not fail the run that produced it. */
export async function recordFusionRun(
  record: FusionRunRecord,
  logPath: string = defaultFusionLogPath(),
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(record)}\n`, "utf-8");
  } catch {
    // telemetry is a by-product, never a failure mode
  }
}

/** Read every record (for the Inc 06 report command). */
export async function readFusionRuns(
  logPath: string = defaultFusionLogPath(),
): Promise<FusionRunRecord[]> {
  try {
    const text = await fs.readFile(logPath, "utf-8");
    return text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as FusionRunRecord);
  } catch {
    return [];
  }
}
