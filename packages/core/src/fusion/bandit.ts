/**
 * Beta-bandit model routing with per-complexity-bucket priors (FU-4 learned
 * layer, ruflo ADR-142 pattern; E016's deterministic-config-first invocation
 * stays the layer below — this bandit only ever chooses AMONG candidates the
 * deterministic policy already approved).
 *
 * The ADR-142 property that matters: **failures on one task type do not
 * suppress a model globally.** Each (bucket, model) arm keeps its own
 * Beta(alpha, beta) posterior over "this model passes the gate for this
 * complexity". An unseen bucket falls back to the model's GLOBAL posterior
 * as its prior (hierarchical shrinkage), so a new bucket starts from
 * evidence, not from zero.
 *
 * Signal source: FU-5 telemetry. Only gated runs carry a pass/fail signal;
 * ungated runs are ignored by design (no verdict, no evidence).
 */

import { readFusionRuns } from "./telemetry.js";
import type { FusionRunRecord } from "./types.js";

export type ComplexityBucket = "low" | "medium" | "high";

export interface BanditArm {
  alpha: number;
  beta: number;
}

export interface BanditRecommendation {
  modelId: string;
  bucket: ComplexityBucket;
  sample: number;
  pulls: number;
  reason: string;
}

/** Deterministic xorshift32 so tests are reproducible. */
export function xorshift32(seed: number): () => number {
  let state = seed >>> 0 || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    // Divide by 2^32, not 2^32−1: state tops out at 0xffffffff, so the old
    // divisor could return exactly 1.0 — outside the half-open [0, 1) range
    // every consumer of a uniform sampler is entitled to assume.
    return state / 0x100000000;
  };
}

/**
 * Exact Beta(α, β) sample for positive-integer parameters: the α-th order
 * statistic of α+β−1 iid uniforms. Arms here are always integer-valued
 * (prior 1 + pass/fail counts), so this is exact — no approximation
 * machinery. O(α+β) per sample; fine at telemetry scale.
 */
function sampleBeta(arm: BanditArm, rand: () => number): number {
  const a = Math.max(1, Math.round(arm.alpha));
  const b = Math.max(1, Math.round(arm.beta));
  const uniforms: number[] = [];
  for (let i = 0; i < a + b - 1; i += 1) uniforms.push(rand());
  uniforms.sort((x, y) => x - y);
  return uniforms[a - 1] ?? 0.5;
}

const OUTCOME_SUCCESS = new Set(["pass"]);
const OUTCOME_FAILURE = new Set(["halt"]);

export class FusionBandit {
  private readonly rand: () => number;
  /** Global posteriors per model (all buckets pooled). */
  private readonly global = new Map<string, BanditArm>();
  /** Per-(bucket, model) posteriors. */
  private readonly arms = new Map<string, BanditArm>();

  constructor(seed = 1) {
    this.rand = xorshift32(seed);
  }

  private bump(map: Map<string, BanditArm>, key: string, success: boolean): void {
    const arm = map.get(key) ?? { alpha: 1, beta: 1 };
    if (success) arm.alpha += 1;
    else arm.beta += 1;
    map.set(key, arm);
  }

  /**
   * Learn from run records. `bucketOf` maps a run to its complexity bucket —
   * the caller owns complexity classification (deterministic, Inc 06 policy
   * signals); only gated runs carry a usable verdict.
   */
  update(records: FusionRunRecord[], bucketOf: (r: FusionRunRecord) => ComplexityBucket): void {
    for (const record of records) {
      if (!record.gated) continue;
      if (OUTCOME_SUCCESS.has(record.gate.outcome) === false && OUTCOME_FAILURE.has(record.gate.outcome) === false) continue;
      const success = OUTCOME_SUCCESS.has(record.gate.outcome);
      const bucket = bucketOf(record);
      for (const role of record.roles) {
        this.bump(this.global, role.modelId, success);
        this.bump(this.arms, `${bucket}::${role.modelId}`, success);
      }
    }
  }

  /**
   * Direct reward writeback for one (bucket, model) arm — the gate-outcome
   * feed (OK-9 W5, E017 reward loop). Same posterior shape as {@link update}:
   * the global arm and the per-bucket arm both move, so a failure informs but
   * does not convict the model in other buckets. `bucket` is the caller's
   * complexity vocabulary (low/medium/high today) — kept a plain string so
   * the routing facade's bucket strings key the same arms {@link recommend}
   * reads.
   */
  noteOutcome(bucket: string, modelId: string, success: boolean): void {
    this.bump(this.global, modelId, success);
    this.bump(this.arms, `${bucket}::${modelId}`, success);
  }

  /**
   * Read one arm's posterior back (calibration/inspection — never on the
   * routing hot path). Falls back to the model's global arm when the bucket
   * is unseen, mirroring {@link recommend}'s hierarchical shrinkage; the
   * uniform prior when the model is entirely unseen. Returns a COPY.
   */
  armFor(bucket: string, modelId: string): BanditArm {
    const arm = this.arms.get(`${bucket}::${modelId}`) ?? this.global.get(modelId);
    return arm ? { ...arm } : { alpha: 1, beta: 1 };
  }

  /**
   * Thompson-sample a recommendation among candidates for a bucket. Unseen
   * (bucket, model) arms start from the model's global posterior, so a
   * model's failures elsewhere inform but do not convict.
   */
  recommend(
    bucket: ComplexityBucket,
    candidates: string[],
  ): BanditRecommendation | undefined {
    let best: BanditRecommendation | undefined;
    for (const modelId of candidates) {
      const key = `${bucket}::${modelId}`;
      const arm = this.arms.get(key) ?? this.global.get(modelId) ?? { alpha: 1, beta: 1 };
      const sample = sampleBeta(arm, this.rand);
      const pulls = Math.round(arm.alpha + arm.beta - 2);
      if (!best || sample > best.sample) {
        best = {
          modelId,
          bucket,
          sample,
          pulls,
          reason:
            pulls === 0
              ? "no evidence — uniform prior"
              : this.arms.has(key)
                ? `bucket evidence ${Math.round(arm.alpha - 1)} pass / ${Math.round(arm.beta - 1)} fail`
                : `global evidence ${Math.round(arm.alpha - 1)} pass / ${Math.round(arm.beta - 1)} fail (bucket unseen)`,
        };
      }
    }
    return best;
  }
}

/** Build a bandit pre-loaded from the local runs log. */
export async function loadBandit(
  bucketOf: (r: FusionRunRecord) => ComplexityBucket,
  seed = 1,
  logPath?: string,
): Promise<FusionBandit> {
  const bandit = new FusionBandit(seed);
  bandit.update(await readFusionRuns(logPath), bucketOf);
  return bandit;
}
