/**
 * openkai/pairing (E022 Inc 03) — the fusion pair suggestion. Fusion-first
 * means the operator never assembles a panel by hand: this module proposes
 * the architect + builder pair from EVIDENCE, never from hardcoded tips.
 *
 * Precedence (one line):
 *   bandit posterior (gated-run evidence, per operator-priority bucket)
 *   → cross-provider diversity policy (independent verdicts need independent
 *     providers) → self-pair advisory (single-provider fallback, named).
 *
 * The returned `source` is the testable contract: every recommendation names
 * the scorer that produced it ("bandit" | "diversity-policy" | "configured"
 * | "self-pair-advisory"). A suggestion never names a model by default.
 */

import type { ComplexityBucket } from "./fusion/bandit.js";
import type { ShiftPosture } from "./orchestrate.js";

/** The model surface pairing needs (pi-ai's Model carries these). */
export interface PairCandidate {
  provider: string;
  id: string;
}

/** Scorer evidence the caller supplies (never fabricated here). */
export interface PairEvidence {
  /**
   * Thompson-sample a candidate for a bucket — the FusionBandit's
   * `recommend` bound to the operator-priority bucket. Absent when no
   * gated-run telemetry exists yet.
   */
  recommend?: (candidates: string[]) => { modelId: string; reason: string } | undefined;
  /** The operator-priority dial mapped to the bandit bucket. */
  bucket: ComplexityBucket;
}

export type PairSource = "configured" | "bandit" | "diversity-policy" | "self-pair-advisory";

export interface PairSuggestion {
  architect: PairCandidate;
  builder: PairCandidate;
  source: PairSource;
  /** Human-readable reason — the scorer's own words, surfaced to the operator. */
  reason: string;
  /** Present when the suggestion is a compromise the operator should see. */
  advisory?: string;
}

/** The operator-priority dial maps to the bandit's complexity bucket. */
export function postureBucket(posture: ShiftPosture | undefined): ComplexityBucket {
  if (posture === "quality") return "high";
  if (posture === "saver") return "low";
  return "medium";
}

/** `provider/id` key — the same vocabulary the bandit arms and pins use. */
export function candidateKey(candidate: PairCandidate): string {
  return `${candidate.provider}/${candidate.id}`;
}

/**
 * Suggest the fusion pair.
 *
 * `configured` is an operator-chosen pair (always honoured verbatim — the
 * operator is the trust root; source is named so tests can tell it apart).
 * `current` is the session model: the architect defaults to it, and it is
 * never proposed as its own builder.
 */
export function suggestPair(
  candidates: readonly PairCandidate[],
  current: PairCandidate | undefined,
  evidence: PairEvidence,
  configured?: { architect?: string; builder?: string },
): PairSuggestion | undefined {
  if (candidates.length === 0) return undefined;

  const byKey = new Map(candidates.map((c) => [candidateKey(c), c]));
  const resolve = (key: string | undefined): PairCandidate | undefined =>
    key === undefined ? undefined : byKey.get(key);

  const architect = resolve(configured?.architect) ?? current ?? candidates[0]!;

  // An operator-configured builder is honoured verbatim when resolvable.
  const configuredBuilder = resolve(configured?.builder);
  if (configuredBuilder !== undefined && candidateKey(configuredBuilder) !== candidateKey(architect)) {
    return {
      architect,
      builder: configuredBuilder,
      source: "configured",
      reason: "operator-configured pair",
    };
  }

  const architectKey = candidateKey(architect);
  const others = candidates.filter((c) => candidateKey(c) !== architectKey);
  const crossProvider = others.filter((c) => c.provider !== architect.provider);

  // Tier 1: bandit evidence among cross-provider candidates.
  if (crossProvider.length > 0 && evidence.recommend !== undefined) {
    const keys = crossProvider.map(candidateKey);
    const rec = evidence.recommend(keys);
    if (rec !== undefined) {
      const builder = byKey.get(rec.modelId);
      if (builder !== undefined) {
        return {
          architect,
          builder,
          source: "bandit",
          reason: `scorer (${evidence.bucket} bucket): ${rec.reason}`,
        };
      }
    }
  }

  // Tier 2: cross-provider diversity — independent verdicts need independent
  // providers. Deterministic: first cross-provider candidate in registry order.
  if (crossProvider.length > 0) {
    return {
      architect,
      builder: crossProvider[0]!,
      source: "diversity-policy",
      reason: "no gated-run evidence yet — cross-provider pair for independent verdicts",
    };
  }

  // Tier 3: same-provider second model, if one exists.
  if (others.length > 0) {
    return {
      architect,
      builder: others[0]!,
      source: "self-pair-advisory",
      reason: "single provider available — pair within it",
      advisory: `only one provider (${architect.provider}) is authenticated; fusion works, but verdicts share a provider`,
    };
  }

  // Tier 4: self-pair — role separation alone still lifts (panel.ts contract).
  return {
    architect,
    builder: architect,
    source: "self-pair-advisory",
    reason: "single model available — self-paired roles",
    advisory: "only one model is available; architect and builder are the same model",
  };
}
