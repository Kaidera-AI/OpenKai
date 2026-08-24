/**
 * Orchestration facade (E017 Inc 02/03/04, OK-9.3 composition contract —
 * research/2026-08-18-shift-fusion-orchestration-ADR.md; S2 of
 * research/2026-08-18-e015-research-match-integration-review.md).
 *
 * ONE entry owns the routing composition that call sites used to hand-wire:
 *   stage classify → per-stage tier latch (OK-9.1 session stickiness) →
 *   override rules (bypass the latch) → corroborative scorer → pins clamp →
 *   posture default → candidate pick (never[] filtered) → RoutingEvent with
 *   tier + source on the activity feed.
 *
 * Deliberately NOT here: the budget guard and the provider fallback chain
 * stay on {@link ShiftRouter} (the execution path); this facade decides WHO
 * serves the turn, the router executes it. No model call on the hot path
 * (OK-9.4).
 *
 * Precedence (OK-9.7, one line): pin → override signals (critical/compaction,
 * unless a ceiling pin suppresses them) → posture threshold → bandit prior →
 * stage default. The bandit prior today feeds cast/pair selection
 * ({@link FusionBandit.recommend}); tier DEFAULTS stay posture-driven until
 * the calibration loop (OK-9 W6) earns the right to move them — the W5
 * evidence note.
 */

import { classifyStage, type ShiftInput, type Stage } from "./shift/stages.js";
import {
  decideTier,
  TIER_THRESHOLD,
  type Tier,
  type TierDecisionSource,
  type TierInput,
} from "./shift/tier.js";
import { fallbackChain, type FallbackTarget, type TierRouteResult } from "./shift/router.js";
import { createRedactingSink, type ActivitySink } from "./shift/activity.js";
import { listCasts, resolveCast, type Cast, type CastConfig } from "./fusion/casts.js";
import { FusionBandit, type BanditArm } from "./fusion/bandit.js";

/** The operator's cost↔quality exchange rate (OK-9.7 posture dial). */
export type ShiftPosture = "quality" | "balanced" | "saver";

/**
 * Hard pins — deterministic, always beat the learned layer (FU-4 discipline,
 * OK-9.7). `floor[stage]` is the lowest tier that stage may route at
 * (escalation PAST a floor is always allowed — safe direction only);
 * `ceiling` is the highest tier ANY stage may route at — including
 * critical-error/compaction overrides and the cascade move (the documented
 * batch/CI cost-certainty posture: the operator accepts quality loss for a
 * hard cost bound). `never` denies specific "provider/model" candidates.
 */
export interface ShiftPins {
  floor?: Partial<Record<Stage, Tier>>;
  ceiling?: Tier;
  never?: string[];
}

export interface OrchestratorOptions {
  /** Working directory — the telemetry/activity root the sink writes under. */
  cwd: string;
  /**
   * Cast config (the SAME `~/.openkai/config.json` casts surface — no second
   * model config). The resolved default cast supplies the CAPABLE member of
   * each stage's pair; the cheapest cast on the same provider (falling back
   * to any cheap-tier cast, then the capable cast itself) supplies the
   * EFFICIENT member.
   */
  castConfig?: CastConfig;
  /** Posture dial (default: "balanced"). */
  posture?: ShiftPosture;
  /** Hard pins (default: none). */
  pins?: ShiftPins;
  /**
   * Activity sink for routing events. Events are redacted before reaching
   * this sink (see {@link createRedactingSink}); when omitted, no events are
   * emitted (headless tests).
   */
  onActivity?: ActivitySink;
}

/**
 * Posture → corroborative threshold preset (OK-9.7: the dial maps to picker
 * default + calibrated threshold preset; raw thresholds are calibration
 * artefacts, not user input). `balanced` keeps Switchyard's shipped 0.5;
 * quality raises the bar (fewer escalations stick), saver lowers it.
 */
const POSTURE_THRESHOLD: Record<ShiftPosture, number> = {
  quality: 0.6,
  balanced: TIER_THRESHOLD,
  // 0.47, not 0.4: the saver dial must stay ABOVE the largest single-signal
  // score or one weak signal flips a stage on its own — the corroborative
  // property the scorer exists for (E017 review).
  saver: 0.47,
};

/** The stage's resting tier under the balanced posture (K3: plan/review are capable-resting). */
const STAGE_DEFAULT_TIER: Record<Stage, Tier> = {
  plan: "capable",
  build: "efficient",
  review: "capable",
};

/** Tier ordering for pin clamps. */
const TIER_RANK: Record<Tier, number> = { efficient: 0, capable: 1 };

/**
 * The orchestrator — stateful per session: the tier latch (one stage's
 * decision holds until a signal flips it), the cascade budget (one
 * escalation per stage), and the bandit the gate outcomes teach.
 */
export class Orchestrator {
  private readonly posture: ShiftPosture;
  private readonly threshold: number;
  private readonly pins: ShiftPins;
  private readonly never: Set<string>;
  private readonly sink: ActivitySink | undefined;
  private readonly bandit = new FusionBandit();
  private readonly capableCast: Cast;
  private readonly efficientCast: Cast;
  /** The latched decision — replaced wholesale when the stage changes (stage change resets). */
  private latch: { stage: Stage; tier: Tier } | undefined;
  /** Stages that already spent their one cascade escalation (OK-9.3 rule 2). */
  private readonly escalatedStages = new Set<Stage>();
  /** The last decision served — the arm {@link noteGateOutcome} rewards. */
  private lastDecision: TierRouteResult | undefined;

  constructor(options: OrchestratorOptions) {
    this.posture = options.posture ?? "balanced";
    this.threshold = POSTURE_THRESHOLD[this.posture];
    this.pins = options.pins ?? {};
    this.never = new Set(this.pins.never ?? []);
    this.sink = options.onActivity ? createRedactingSink(options.onActivity) : undefined;

    const casts = listCasts(options.castConfig ?? {});
    const capable = resolveCast(undefined, options.castConfig ?? {}) ?? casts[0];
    if (!capable) {
      throw new Error("orchestrator: no casts available — configure at least one cast.");
    }
    this.capableCast = capable;
    this.efficientCast =
      casts.find((c) => c.tier === "cheap" && c.provider === capable.provider) ??
      casts.find((c) => c.tier === "cheap") ??
      capable;
  }

  /** The posture's fall-open tier for a stage (quality: always capable; saver: always efficient). */
  private defaultTierFor(stage: Stage): Tier {
    if (this.posture === "quality") return "capable";
    if (this.posture === "saver") return "efficient";
    return STAGE_DEFAULT_TIER[stage];
  }

  /**
   * Apply the pins AFTER the scorer: the floor raises a below-floor tier;
   * the ceiling caps an above-ceiling tier — INCLUDING override escalations
   * (documented OK-9.7 cost-certainty posture). The source label is kept so
   * the feed shows WHAT fired; the reason records that a pin moved the tier.
   */
  private clamp(stage: Stage, tier: Tier, source: TierDecisionSource, reason: string): { tier: Tier; reason: string } {
    const floor = this.pins.floor?.[stage];
    if (floor !== undefined && TIER_RANK[tier] < TIER_RANK[floor]) {
      reason += `; floor pin ${stage}=${floor} raised the tier`;
      tier = floor;
    }
    const ceiling = this.pins.ceiling;
    if (ceiling !== undefined && TIER_RANK[tier] > TIER_RANK[ceiling]) {
      reason +=
        source === "override"
          ? `; ceiling pin ${ceiling} suppressed the override escalation (OK-9.7 cost-certainty posture)`
          : `; ceiling pin ${ceiling} capped the tier`;
      tier = ceiling;
    }
    return { tier, reason };
  }

  /**
   * Pick the model for a stage at a tier. Candidate order: the tier cast's
   * stage model, then the OTHER tier's stage model (failing across tiers
   * before sideways within a cast), then the rest of both fallback chains.
   * `never[]` entries are filtered from the picks; if the denylist empties
   * the pool the pick FAILS OPEN with a labelled reason (the filterByModality
   * posture — a denied-everything config must not silently refuse the task).
   */
  private pickModel(stage: Stage, tier: Tier): { target: FallbackTarget; note?: string } {
    const tierCast = tier === "capable" ? this.capableCast : this.efficientCast;
    const otherCast = tier === "capable" ? this.efficientCast : this.capableCast;
    const tierChain = fallbackChain(stage, tierCast);
    const otherChain = fallbackChain(stage, otherCast);
    const seen = new Set<string>();
    const candidates: FallbackTarget[] = [];
    for (const c of [tierChain[0], otherChain[0], ...tierChain.slice(1), ...otherChain.slice(1)]) {
      if (c === undefined) continue;
      const key = `${c.provider}/${c.model}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(c);
      }
    }
    const allowed = candidates.filter((c) => !this.never.has(`${c.provider}/${c.model}`));
    if (allowed.length > 0) return { target: allowed[0]! };
    return {
      target: candidates[0]!,
      note: "never-list denied every candidate; failing open (labelled, not silent)",
    };
  }

  /** Emit the routing event with tier + source (OK-9.1 observability discipline). */
  private emitDecision(r: TierRouteResult): void {
    this.sink?.({
      kind: "routing",
      stage: r.stage,
      model: r.model,
      provider: r.provider,
      attempt: 0,
      tier: r.tier,
      source: r.source,
      reason: `tier=${r.tier} source=${r.source} score=${r.score.toFixed(3)} :: ${r.reason}`,
    });
  }

  /**
   * The tier decision for one turn. Latch semantics (OK-9.1): the latched
   * tier holds until an override fires (critical/compaction/tests_passed) or
   * the corroborative scorer crosses the posture threshold with the opposite
   * sign; a stage change resets the latch.
   */
  decide(input: ShiftInput, signals: TierInput): TierRouteResult {
    const stage = classifyStage(input);
    const latchedTier = this.latch !== undefined && this.latch.stage === stage ? this.latch.tier : undefined;
    const postureDefault = this.defaultTierFor(stage);
    const raw = decideTier(signals, postureDefault);

    let tier: Tier;
    let source: TierDecisionSource;
    let reason = raw.reason;

    if (raw.source === "override" || raw.source === "tests_passed") {
      // Overrides bypass the latch — critical/compaction/tests_passed always speak.
      tier = raw.tier;
      source = raw.source;
    } else if (raw.confidence >= this.threshold) {
      // The scorer crossed the posture threshold — it flips the latch when it
      // disagrees, reaffirms it when it agrees.
      tier = raw.score > 0 ? "capable" : "efficient";
      source = "dimensions";
      // decideTier gates at TIER_THRESHOLD; the posture gate can be lower, in
      // which case raw.reason says "below threshold" on a flip (AdvChannels
      // L1 — latent today by the score lattice, but not invariant).
      reason = `corroborative score ${raw.score.toFixed(3)} past the ${this.posture} posture threshold (${raw.confidence.toFixed(3)} ≥ ${this.threshold})`;
    } else if (latchedTier !== undefined) {
      // Below threshold with a live latch: stickiness wins (no mid-phase thrash).
      tier = latchedTier;
      source = "fall_open";
      reason = `latched tier held (${latchedTier}); ${raw.reason}`;
    } else {
      tier = postureDefault;
      source = "fall_open";
    }

    const clamped = this.clamp(stage, tier, source, reason);
    tier = clamped.tier;
    reason = clamped.reason;

    this.latch = { stage, tier };
    const pick = this.pickModel(stage, tier);
    if (pick.note !== undefined) reason += `; ${pick.note}`;
    const result: TierRouteResult = {
      stage,
      tier,
      model: pick.target.model,
      provider: pick.target.provider,
      source,
      score: raw.score,
      reason,
    };
    this.lastDecision = result;
    this.emitDecision(result);
    return result;
  }

  /**
   * The cascade move (OK-9.3 rule 2 — verify-then-escalate, never escalate on
   * vibes): after the gate's retry cap, force the stage CAPABLE once and
   * latch it there. One escalation per stage per session — a repeat call
   * returns the latched escalation with the spent budget noted. A ceiling
   * pin suppresses the escalation (same documented posture as overrides).
   */
  escalate(stage: Stage): TierRouteResult {
    // Budget spent: never re-escalate a stage whose one retry already ran
    // (E017 review + AdvChannels M2: the latch conjunct let an interleaved
    // decide() on ANOTHER stage re-arm this stage's budget). When the last
    // decision was this stage's, serve it back noted; otherwise re-derive the
    // pick WITHOUT touching the latch, lastDecision, or the event stream.
    if (this.escalatedStages.has(stage)) {
      const note = "escalation budget for this stage already spent";
      const latched = this.lastDecision;
      if (latched !== undefined && latched.stage === stage) {
        return { ...latched, reason: `${latched.reason}; ${note} — returning the latched decision` };
      }
      const tier = this.latch?.stage === stage ? this.latch.tier : "capable";
      const pick = this.pickModel(stage, tier);
      return {
        stage,
        tier,
        model: pick.target.model,
        provider: pick.target.provider,
        source: "override",
        score: 1,
        reason: `cascade escalation after gate halt; ${note} — no new escalation armed`,
      };
    }
    let tier: Tier = "capable";
    let reason = "cascade escalation after gate halt (OK-9.3 rule 2 — one retry)";
    this.escalatedStages.add(stage);
    if (this.pins.ceiling !== undefined && TIER_RANK[tier] > TIER_RANK[this.pins.ceiling]) {
      tier = this.pins.ceiling;
      reason += `; ceiling pin ${this.pins.ceiling} suppressed the escalation (OK-9.7 cost-certainty posture)`;
    }
    this.latch = { stage, tier };
    const pick = this.pickModel(stage, tier);
    if (pick.note !== undefined) reason += `; ${pick.note}`;
    const result: TierRouteResult = {
      stage,
      tier,
      model: pick.target.model,
      provider: pick.target.provider,
      source: "override",
      score: 1,
      reason,
    };
    this.lastDecision = result;
    this.emitDecision(result);
    return result;
  }

  /**
   * The compaction hook (OK-9.3 rule 3 — compaction is a free tier-switch
   * point): re-decide the current stage from fresh signals, BYPASSING the
   * latch. Returns a decision only when the tier FLIPS; a held tier returns
   * undefined (nothing to show on the feed).
   */
  reevaluate(signals: TierInput): TierRouteResult | undefined {
    if (this.latch === undefined) return undefined;
    const stage = this.latch.stage;
    const current = this.latch.tier;
    const postureDefault = this.defaultTierFor(stage);
    const raw = decideTier(signals, postureDefault);

    let tier: Tier;
    let source: TierDecisionSource;
    let reason = raw.reason;
    if (raw.source === "override" || raw.source === "tests_passed") {
      tier = raw.tier;
      source = raw.source;
    } else if (raw.confidence >= this.threshold) {
      tier = raw.score > 0 ? "capable" : "efficient";
      source = "dimensions";
      // decideTier gates at TIER_THRESHOLD; the posture gate can be lower —
      // raw.reason would then say "below threshold" on a flip (E017 review).
      reason = `corroborative score ${raw.score.toFixed(3)} past the ${this.posture} posture threshold (${raw.confidence.toFixed(3)} ≥ ${this.threshold})`;
    } else {
      tier = postureDefault;
      source = "fall_open";
    }
    const clamped = this.clamp(stage, tier, source, reason);
    tier = clamped.tier;
    reason = clamped.reason;

    if (tier === current) return undefined;
    this.latch = { stage, tier };
    reason = `compaction re-evaluation flipped tier ${current} → ${tier}; ${reason}`;
    const pick = this.pickModel(stage, tier);
    if (pick.note !== undefined) reason += `; ${pick.note}`;
    const result: TierRouteResult = {
      stage,
      tier,
      model: pick.target.model,
      provider: pick.target.provider,
      source,
      score: raw.score,
      reason,
    };
    this.lastDecision = result;
    this.emitDecision(result);
    return result;
  }

  /**
   * The reward writeback (OK-9 W5 — gate outcome is the routing reward):
   * record the gate's verdict against the model that served the last
   * decision, per bucket. NOTE (W5 evidence): the posterior currently feeds
   * cast/pair selection via {@link FusionBandit.recommend}; tier defaults
   * stay posture-driven until calibration (W6) supports moving them.
   */
  /**
   * Reward writeback. `servedModels` names the models that ACTUALLY served
   * the attempt — the caller (fuse) knows its panel; decide() is advisory
   * and its pick may never have touched the panel (E017 review: crediting
   * lastDecision.model trained phantom arms the panel never used).
   */
  noteGateOutcome(outcome: "pass" | "fail", bucket: string, servedModels?: string[]): void {
    const models =
      servedModels !== undefined && servedModels.length > 0
        ? [...new Set(servedModels)]
        : this.lastDecision !== undefined
          ? [this.lastDecision.model]
          : [];
    for (const model of models) {
      this.bandit.noteOutcome(bucket, model, outcome === "pass");
    }
  }

  /** Read one bandit arm's posterior back (calibration/inspection; a copy). */
  banditArm(bucket: string, modelId: string): BanditArm {
    return this.bandit.armFor(bucket, modelId);
  }
}
