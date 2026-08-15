/**
 * FU-5-shaped telemetry: every fusion run is a controlled A/B on identical
 * input. Records are local-first (ren A1: standalone mode writes the same
 * file). When a Cortex project is attached (managed mode), each record is
 * also exported as a Cortex artifact — the queryable, embeddable store.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import type { CortexClient } from "../cortex/client.js";
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

/** Read every record (for the report command). */
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

/**
 * Export one run record as a Cortex artifact (managed mode). Best-effort:
 * like the local log, a failed export never fails the run.
 */
export async function exportFusionRunArtifact(
  client: CortexClient,
  record: FusionRunRecord,
  agent: string,
): Promise<boolean> {
  try {
    const raw = JSON.stringify(record);
    const contentHash = createHash("sha256").update(raw).digest("hex");
    await client.postJson(
      "/artifacts",
      {
        source_file: `.openkai/fusion/runs.jsonl#${record.runId}`,
        content_hash: contentHash,
        source_type: "fusion_run",
        modality: "json",
        raw_content: raw,
        caption: `fusion run ${record.runId} (gate: ${record.gate.outcome})`,
        metadata: {
          runId: record.runId,
          task: record.task,
          gated: record.gated,
          gateOutcome: record.gate.outcome,
          models: record.roles.map((r) => `${r.role}:${r.modelId}`),
          wallMs: record.wallMs,
          ts: record.ts,
        },
      },
      { agent },
    );
    return true;
  } catch {
    return false;
  }
}

/** Per-model-pair rollup for the fusion report. */
export interface FusionPairStats {
  pair: string;
  runs: number;
  gatePassRate: number | undefined;
  avgWallMs: number;
  totalTokens: number;
  avgRoleLatencyMs: number;
}

/** Aggregate run records into per-pair comparison stats (FU-5's A/B shape). */
export function summariseFusionRuns(records: FusionRunRecord[]): FusionPairStats[] {
  const byPair = new Map<string, FusionRunRecord[]>();
  for (const record of records) {
    const pair =
      record.roles.map((r) => `${r.role}:${r.modelId}`).join(" + ") || "unknown";
    const bucket = byPair.get(pair) ?? [];
    bucket.push(record);
    byPair.set(pair, bucket);
  }

  const stats: FusionPairStats[] = [];
  for (const [pair, runs] of byPair) {
    const gatedRuns = runs.filter((r) => r.gated);
    const passed = gatedRuns.filter((r) => r.gate.outcome === "pass").length;
    const totalTokens = runs.reduce(
      (sum, r) =>
        sum +
        r.roles.reduce((s, role) => s + (role.usage?.totalTokens ?? 0), 0) +
        (r.synthesis?.usage?.totalTokens ?? 0),
      0,
    );
    const roleLatencies = runs.flatMap((r) => r.roles.map((role) => role.latencyMs));
    stats.push({
      pair,
      runs: runs.length,
      gatePassRate:
        gatedRuns.length > 0 ? passed / gatedRuns.length : undefined,
      avgWallMs: Math.round(
        runs.reduce((s, r) => s + r.wallMs, 0) / Math.max(runs.length, 1),
      ),
      totalTokens,
      avgRoleLatencyMs: Math.round(
        roleLatencies.reduce((s, v) => s + v, 0) / Math.max(roleLatencies.length, 1),
      ),
    });
  }
  return stats.sort((a, b) => b.runs - a.runs);
}
