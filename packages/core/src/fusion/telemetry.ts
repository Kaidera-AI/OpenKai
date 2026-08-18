/**
 * FU-5-shaped telemetry: every fusion run is a controlled A/B on identical
 * input. Records are local-first (ren A1: standalone mode writes the same
 * file). When a Cortex project is attached (managed mode), each record is
 * also exported as a Cortex artifact — the queryable, embeddable store.
 *
 * Two boundaries are redacted before anything leaves the process: the task
 * text and each role's output pass through redactSecrets (../secrets.js) on
 * BOTH the local append and the Cortex export. The in-memory FuseResult is
 * never redacted — the operator sees their own run verbatim; the persistent
 * stores get the sanitised copy.
 *
 * The log is bounded: when an append pushes the file past 2000 lines it is
 * compacted to the most recent 1000 records. Rotation is best-effort like
 * the append itself — a failed compaction never fails the run.
 */

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import type { CortexClient } from "../cortex/client.js";
import { redactSecrets } from "../secrets.js";
import type { FusionRunRecord } from "./types.js";

/** Rotation bounds: compact to KEEP_LINES records once past MAX_LINES. */
const MAX_LINES = 2_000;
const KEEP_LINES = 1_000;

/** Default fusion telemetry log: `.openkai/fusion/runs.jsonl` under cwd. */
export function defaultFusionLogPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".openkai", "fusion", "runs.jsonl");
}

/**
 * The persistent copy of a record: task and role text redacted, everything
 * else (ids, verdicts, usage, timings) verbatim. Returns a new object — the
 * caller's in-memory record is never mutated.
 */
function redactRecord(record: FusionRunRecord): FusionRunRecord {
  return {
    ...record,
    task: redactSecrets(record.task),
    roles: record.roles.map((role) => ({
      ...role,
      text: redactSecrets(role.text),
      ...(role.error !== undefined ? { error: redactSecrets(role.error) } : {}),
    })),
  };
}

/** Append one run record. Creates the directory lazily; never throws on I/O
 *  failure — telemetry must not fail the run that produced it. */
export async function recordFusionRun(
  record: FusionRunRecord,
  logPath: string = defaultFusionLogPath(),
): Promise<void> {
  try {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(redactRecord(record))}\n`, "utf-8");
    // Bounded log: compact once past the cap, keeping the most recent records.
    const text = await fs.readFile(logPath, "utf-8").catch(() => "");
    const lines = text.split("\n").filter((line) => line.trim().length > 0);
    if (lines.length > MAX_LINES) {
      await fs.writeFile(logPath, `${lines.slice(-KEEP_LINES).join("\n")}\n`, "utf-8");
    }
  } catch {
    // telemetry is a by-product, never a failure mode
  }
}

/**
 * Read every record (for the report command). One corrupt line is skipped,
 * never fatal: a torn write or a hand-edit must not zero the history.
 */
export async function readFusionRuns(
  logPath: string = defaultFusionLogPath(),
): Promise<FusionRunRecord[]> {
  let text: string;
  try {
    text = await fs.readFile(logPath, "utf-8");
  } catch {
    return [];
  }
  const records: FusionRunRecord[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    try {
      records.push(JSON.parse(line) as FusionRunRecord);
    } catch {
      // skip the corrupt line, keep the rest of the history
    }
  }
  return records;
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
    // Same redaction boundary as the local log — the two stores must never
    // drift on what leaves the process.
    const exported = redactRecord(record);
    const raw = JSON.stringify(exported);
    const contentHash = createHash("sha256").update(raw).digest("hex");
    await client.postJson(
      "/artifacts",
      {
        source_file: `.openkai/fusion/runs.jsonl#${exported.runId}`,
        content_hash: contentHash,
        source_type: "fusion_run",
        modality: "json",
        raw_content: raw,
        caption: `fusion run ${exported.runId} (gate: ${exported.gate.outcome})`,
        metadata: {
          runId: exported.runId,
          task: exported.task,
          gated: exported.gated,
          gateOutcome: exported.gate.outcome,
          models: exported.roles.map((r) => `${r.role}:${r.modelId}`),
          wallMs: exported.wallMs,
          ts: exported.ts,
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


/**
 * Fusion telemetry dashboard (E015, K3 #4): aggregate the runs log into
 * per-pair A/B stats + gate-outcome distribution. Pure over the records.
 */
export interface PairStats {
  /** "providerA/modelA + providerB/modelB" (sorted, deduped). */
  pair: string;
  runs: number;
  pass: number;
  passRate: number;
  avgWallMs: number;
  totalTokens: number;
}

export interface FusionDashboard {
  totalRuns: number;
  pairs: PairStats[];
  gateOutcomes: Record<string, number>;
}

export function aggregateFusionRuns(records: FusionRunRecord[]): FusionDashboard {
  const byPair = new Map<string, { runs: number; pass: number; wall: number; tokens: number }>();
  const gateOutcomes: Record<string, number> = {};
  for (const r of records) {
    const models = r.roles.map((role) => role.modelId).sort();
    const pair = [...new Set(models)].join(" + ") || "(unknown)";
    const acc = byPair.get(pair) ?? { runs: 0, pass: 0, wall: 0, tokens: 0 };
    acc.runs += 1;
    if (r.gate.outcome === "pass") acc.pass += 1;
    acc.wall += r.wallMs;
    for (const role of r.roles) acc.tokens += role.usage?.totalTokens ?? 0;
    acc.tokens += r.synthesis?.usage?.totalTokens ?? 0;
    byPair.set(pair, acc);
    gateOutcomes[r.gate.outcome] = (gateOutcomes[r.gate.outcome] ?? 0) + 1;
  }
  const pairs: PairStats[] = [...byPair.entries()]
    .map(([pair, a]) => ({
      pair,
      runs: a.runs,
      pass: a.pass,
      passRate: a.runs > 0 ? a.pass / a.runs : 0,
      avgWallMs: a.runs > 0 ? Math.round(a.wall / a.runs) : 0,
      totalTokens: a.tokens,
    }))
    .sort((x, y) => y.runs - x.runs);
  return { totalRuns: records.length, pairs, gateOutcomes };
}

/** Render the dashboard as plain lines (the CLI prints them). */
export function renderFusionDashboard(d: FusionDashboard): string[] {
  const lines: string[] = [`fusion telemetry — ${d.totalRuns} run(s)`];
  const gates = Object.entries(d.gateOutcomes)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");
  lines.push(`gate outcomes: ${gates || "(none)"}`);
  for (const p of d.pairs) {
    lines.push(
      `  ${p.pair} — ${p.runs} run(s), ${(p.passRate * 100).toFixed(0)}% pass, avg ${(p.avgWallMs / 1000).toFixed(1)}s, ${p.totalTokens} tokens`,
    );
  }
  return lines;
}
