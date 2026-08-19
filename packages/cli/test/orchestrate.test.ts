/**
 * Orchestration facade tests (E017 Inc 02/03/04, OK-9.3 composition contract).
 *
 * Covers:
 *   1. Latch stickiness — a below-threshold signal holds the latched tier
 *      (no mid-phase thrash, OK-9.1 session affinity).
 *   2. Override bypass — critical/compaction/tests_passed always speak.
 *   3. Scorer flip — the corroborative scorer crossing the posture threshold
 *      with the opposite sign flips the latch.
 *   4. Stage-change reset — one stage's latch never constrains another.
 *   5. Pin clamp order — floor raises after the scorer, ceiling caps after
 *      the floor; a ceiling suppresses override escalation (documented
 *      OK-9.7 cost-certainty posture).
 *   6. Posture mapping — quality = fall-open capable @ 0.6, balanced =
 *      per-stage defaults @ 0.5, saver = fall-open efficient @ 0.47.
 *   7. Cascade — escalate() forces capable once, labelled, and latches;
 *      the ceiling pin suppresses it.
 *   8. Compaction hook — reevaluate() returns a decision only on a flip.
 *   9. Reward writeback — noteGateOutcome moves the bandit posterior per
 *      bucket (OK-9 W5), with global shrinkage on unseen buckets.
 *  10. Observability — every decide() emits a RoutingEvent carrying
 *      tier + source through the activity sink.
 *  11. never[] — denied models are filtered from candidate picks.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Orchestrator,
  type CastConfig,
  type RoutingEvent,
  type TierInput,
} from "@kaidera/openkai-core";

// ── Fixtures ──────────────────────────────────────────────────────────────

/** Two casts on one provider: a frontier pair (capable) and a cheap pair (efficient). */
const CASTS: CastConfig = {
  defaultCast: "strong",
  casts: [
    {
      id: "strong",
      tier: "frontier",
      provider: "nvidia",
      architectModel: "strong-arch",
      builderModel: "strong-build",
      judgeModel: "strong-judge",
      label: "Strong — frontier pair",
    },
    {
      // id "cheap" OVERRIDES the built-in cheap cast (custom casts win by id)
      // so the efficient-tier pick is deterministic in these tests.
      id: "cheap",
      tier: "cheap",
      provider: "nvidia",
      architectModel: "weak-arch",
      builderModel: "weak-build",
      label: "Weak — cheap pair",
    },
  ],
};

const NO_SIGNALS: TierInput = { signals: [], turnDepth: 0, compacted: false };

/** One SOFT error: corroborative score ≈ 0.211 — below every posture threshold. */
const MILD: TierInput = {
  signals: [{ tool: "bash", resultText: "exited code 1", isError: true }],
  turnDepth: 1,
  compacted: false,
};

/** One HARD error: score ≈ 0.4621 — below every posture threshold (saver 0.47, balanced 0.5, quality 0.6). */
const SINGLE_HARD: TierInput = {
  signals: [{ tool: "bash", resultText: "cat: missing.ts: No such file or directory" }],
  turnDepth: 1,
  compacted: false,
};

/** Critical severity: the override fires regardless of latch or threshold. */
const CRITICAL: TierInput = {
  signals: [{ tool: "bash", resultText: "FATAL: out of memory, killed process 1234" }],
  turnDepth: 2,
  compacted: false,
};

/**
 * Corroborated distress: maxed severity + spinning at depth — score ≈ 0.762,
 * past every posture threshold (one maxed signal alone never crosses).
 */
const CORROBORATED: TierInput = {
  signals: [
    { tool: "bash", resultText: "cat: a.ts: No such file or directory" },
    { tool: "bash", resultText: "cat: b.ts: No such file or directory" },
    { tool: "bash", resultText: "cat: c.ts: No such file or directory" },
  ],
  turnDepth: 9,
  compacted: false,
};

const BUILD = { prompt: "implement the handler" };
const PLAN = { prompt: "plan the architecture" };
const REVIEW = { prompt: "review the diff" };

/** Collect the events one orchestrator emits. */
function eventsOf(): { events: RoutingEvent[]; onActivity: (e: RoutingEvent) => void } {
  const events: RoutingEvent[] = [];
  return { events, onActivity: (e) => events.push(e) };
}

// ══════════════════════════════════════════════════════════════════════════
// 1–2. LATCH STICKINESS + OVERRIDE BYPASS
// ══════════════════════════════════════════════════════════════════════════

test("latch: a below-threshold signal holds the latched tier (no mid-phase thrash)", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  const first = orch.decide(BUILD, NO_SIGNALS);
  assert.equal(first.tier, "efficient"); // balanced posture: build rests efficient
  assert.equal(first.source, "fall_open");
  assert.equal(first.model, "weak-build");

  const held = orch.decide(BUILD, MILD);
  assert.equal(held.tier, "efficient", "a lone SOFT error must not flap the tier");
  assert.equal(held.source, "fall_open");
  assert.match(held.reason, /latched tier held \(efficient\)/);
});

test("override bypasses the latch, and the override becomes the new latch", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  orch.decide(BUILD, NO_SIGNALS); // latches efficient
  const escalated = orch.decide(BUILD, CRITICAL);
  assert.equal(escalated.tier, "capable");
  assert.equal(escalated.source, "override");
  assert.equal(escalated.model, "strong-build");

  // The latch now sits at capable: a mild signal holds it there.
  const held = orch.decide(BUILD, MILD);
  assert.equal(held.tier, "capable");
  assert.match(held.reason, /latched tier held \(capable\)/);
});

test("compaction is an override: it bypasses the latch without any error signal", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  orch.decide(BUILD, NO_SIGNALS); // latches efficient
  const compacted = orch.decide(BUILD, { signals: [], turnDepth: 4, compacted: true });
  assert.equal(compacted.tier, "capable");
  assert.equal(compacted.source, "override");
});

// ══════════════════════════════════════════════════════════════════════════
// 3–4. SCORER FLIP + STAGE-CHANGE RESET
// ══════════════════════════════════════════════════════════════════════════

test("scorer crossing the threshold with the opposite sign flips the latch", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  orch.decide(BUILD, NO_SIGNALS); // latches efficient
  const flipped = orch.decide(BUILD, CORROBORATED);
  assert.equal(flipped.tier, "capable", "corroborated distress must flip the latch");
  assert.equal(flipped.source, "dimensions");

  // …and the flipped tier is itself latched now.
  const held = orch.decide(BUILD, MILD);
  assert.equal(held.tier, "capable");
  assert.match(held.reason, /latched tier held \(capable\)/);
});

test("stage change resets: one stage's latch never constrains another", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  const build = orch.decide(BUILD, NO_SIGNALS);
  assert.equal(build.tier, "efficient");

  const plan = orch.decide(PLAN, NO_SIGNALS);
  assert.equal(plan.stage, "plan");
  assert.equal(plan.tier, "capable", "plan rests capable — build's efficient latch must not leak");
  assert.equal(plan.source, "fall_open");
  assert.doesNotMatch(plan.reason, /latched/);

  // Returning to build re-latches from build's own decision path.
  const buildAgain = orch.decide(BUILD, MILD);
  assert.equal(buildAgain.tier, "efficient");
});

// ══════════════════════════════════════════════════════════════════════════
// 5. PIN CLAMP ORDER + CEILING-SUPPRESSED OVERRIDES
// ══════════════════════════════════════════════════════════════════════════

test("floor pin raises a below-floor tier after the scorer", () => {
  const orch = new Orchestrator({
    cwd: "/tmp",
    castConfig: CASTS,
    pins: { floor: { build: "capable" } },
  });
  const d = orch.decide(BUILD, NO_SIGNALS); // scorer says efficient (fall_open)
  assert.equal(d.tier, "capable", "the floor raises the fall-open default");
  assert.equal(d.source, "fall_open", "the source label records what the scorer said");
  assert.match(d.reason, /floor pin build=capable raised the tier/);
});

test("pin clamp order: floor first, ceiling last — the ceiling wins the collision", () => {
  const orch = new Orchestrator({
    cwd: "/tmp",
    castConfig: CASTS,
    pins: { floor: { build: "capable" }, ceiling: "efficient" },
  });
  const d = orch.decide(BUILD, NO_SIGNALS);
  assert.equal(d.tier, "efficient", "ceiling caps the floor-raised tier");
  assert.match(d.reason, /floor pin build=capable.*ceiling pin efficient capped/);
});

test("ceiling pin suppresses override escalation (OK-9.7 cost-certainty posture)", () => {
  const orch = new Orchestrator({
    cwd: "/tmp",
    castConfig: CASTS,
    pins: { ceiling: "efficient" },
  });
  const d = orch.decide(BUILD, CRITICAL);
  assert.equal(d.tier, "efficient", "even a critical override must not breach the ceiling");
  assert.equal(d.source, "override", "the feed still shows WHAT fired");
  assert.match(d.reason, /ceiling pin efficient suppressed the override escalation/);
});

// ══════════════════════════════════════════════════════════════════════════
// 6. POSTURE MAPPING
// ══════════════════════════════════════════════════════════════════════════

test("posture: quality falls open capable everywhere and needs 0.6 to escalate on dimensions", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, posture: "quality" });
  const d = orch.decide(BUILD, NO_SIGNALS);
  assert.equal(d.tier, "capable", "quality posture: build falls open capable");
  assert.equal(d.source, "fall_open");

  // 0.4621 < 0.6: a lone hard error does NOT earn a dimensions decision.
  const orch2 = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, posture: "quality" });
  const weak = orch2.decide(BUILD, SINGLE_HARD);
  assert.equal(weak.source, "fall_open");
  assert.equal(weak.tier, "capable");
});

test("posture: balanced rests per-stage (plan/review capable, build efficient) at 0.5", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, posture: "balanced" });
  assert.equal(orch.decide(PLAN, NO_SIGNALS).tier, "capable");
  assert.equal(orch.decide(BUILD, NO_SIGNALS).tier, "efficient");
  assert.equal(orch.decide(REVIEW, NO_SIGNALS).tier, "capable");

  // 0.4621 < 0.5: a lone hard error stays a fall_open, by Switchyard's
  // corroboration-by-construction design.
  const orch2 = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, posture: "balanced" });
  const d = orch2.decide(BUILD, SINGLE_HARD);
  assert.equal(d.source, "fall_open");
  assert.equal(d.tier, "efficient");
});

test("posture: saver falls open efficient and escalates at 0.47", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, posture: "saver" });
  const d = orch.decide(PLAN, NO_SIGNALS);
  assert.equal(d.tier, "efficient", "saver posture: even plan falls open efficient");

  // 0.4621 < 0.47: a LONE hard error stays fall_open even under saver — the
  // corroborative property holds at every posture (E017 review: 0.4 let one
  // weak signal flip a stage on its own).
  const orch2 = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, posture: "saver" });
  const single = orch2.decide(BUILD, SINGLE_HARD);
  assert.equal(single.source, "fall_open");
  assert.equal(single.tier, "efficient");

  // Corroborated distress (≈0.762) still escalates under saver.
  const orch3 = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, posture: "saver" });
  const escalated = orch3.decide(BUILD, CORROBORATED);
  assert.equal(escalated.tier, "capable");
  assert.equal(escalated.source, "dimensions");
});

// ══════════════════════════════════════════════════════════════════════════
// 7. CASCADE — escalate() ONCE, LABELLED, LATCHED
// ══════════════════════════════════════════════════════════════════════════

test("escalate forces capable once, labels the move, and latches it", () => {
  const { events, onActivity } = eventsOf();
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, onActivity });
  orch.decide(BUILD, NO_SIGNALS); // latches efficient

  const escalation = orch.escalate("build");
  assert.equal(escalation.tier, "capable");
  assert.equal(escalation.source, "override");
  assert.equal(escalation.model, "strong-build");
  assert.match(escalation.reason, /cascade escalation after gate halt \(OK-9\.3 rule 2/);

  // The escalation is latched: weak signals hold capable.
  const held = orch.decide(BUILD, MILD);
  assert.equal(held.tier, "capable");

  // Escalate-once: a repeat call returns the latched decision unchanged
  // (budget spent) and does NOT re-emit a routing event.
  const repeat = orch.escalate("build");
  assert.equal(repeat.tier, "capable");
  assert.match(repeat.reason, /escalation budget for this stage already spent/);

  // decide, escalate, held — the repeat escalate emits nothing.
  assert.equal(events.length, 3);
  assert.equal(events[1]?.tier, "capable");
  assert.equal(events[1]?.source, "override");
});

test("escalate respects the ceiling pin (the cascade is suppressed, labelled)", () => {
  const orch = new Orchestrator({
    cwd: "/tmp",
    castConfig: CASTS,
    pins: { ceiling: "efficient" },
  });
  const escalation = orch.escalate("build");
  assert.equal(escalation.tier, "efficient");
  assert.match(escalation.reason, /ceiling pin efficient suppressed the escalation/);
});

// ══════════════════════════════════════════════════════════════════════════
// 8. COMPACTION HOOK — reevaluate() RETURNS ONLY ON A FLIP
// ══════════════════════════════════════════════════════════════════════════

test("reevaluate returns undefined while the tier holds, a decision when it flips", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  assert.equal(orch.reevaluate(CORROBORATED), undefined, "no decide yet — nothing to re-evaluate");

  orch.decide(BUILD, NO_SIGNALS); // latches efficient
  assert.equal(orch.reevaluate(MILD), undefined, "a held tier is not a feed event");

  const flipped = orch.reevaluate(CORROBORATED);
  assert.ok(flipped !== undefined);
  assert.equal(flipped.tier, "capable");
  assert.match(flipped.reason, /compaction re-evaluation flipped tier efficient → capable/);

  assert.equal(orch.reevaluate(CORROBORATED), undefined, "already capable — no second event");
});

test("reevaluate honours the compaction override as a free switch point", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  orch.decide(BUILD, NO_SIGNALS); // latches efficient
  const flipped = orch.reevaluate({ signals: [], turnDepth: 0, compacted: true });
  assert.ok(flipped !== undefined);
  assert.equal(flipped.tier, "capable");
  assert.equal(flipped.source, "override");
});

// ══════════════════════════════════════════════════════════════════════════
// 9. REWARD WRITEBACK — noteGateOutcome MOVES THE POSTERIOR (OK-9 W5)
// ══════════════════════════════════════════════════════════════════════════

test("noteGateOutcome updates the bandit posterior for the model that served the turn", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  const d = orch.decide(BUILD, NO_SIGNALS); // weak-build serves the turn
  assert.equal(d.model, "weak-build");

  orch.noteGateOutcome("pass", "medium");
  orch.noteGateOutcome("pass", "medium");
  orch.noteGateOutcome("fail", "medium");

  assert.deepEqual(
    orch.banditArm("medium", "weak-build"),
    { alpha: 3, beta: 2 },
    "prior 1/1 + 2 pass + 1 fail",
  );
  // Hierarchical shrinkage: an unseen bucket starts from the GLOBAL
  // posterior (which also moved), not from zero.
  assert.deepEqual(orch.banditArm("low", "weak-build"), { alpha: 3, beta: 2 });
  // An entirely unseen model keeps the uniform prior.
  assert.deepEqual(orch.banditArm("medium", "strong-build"), { alpha: 1, beta: 1 });
});

test("noteGateOutcome without a prior decision is a no-op", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  orch.noteGateOutcome("fail", "high");
  assert.deepEqual(orch.banditArm("high", "weak-build"), { alpha: 1, beta: 1 });
});

// ══════════════════════════════════════════════════════════════════════════
// 10. OBSERVABILITY — EVERY decide() EMITS tier + source
// ══════════════════════════════════════════════════════════════════════════

test("every decide emits a RoutingEvent carrying tier + source", () => {
  const { events, onActivity } = eventsOf();
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS, onActivity });
  orch.decide(BUILD, NO_SIGNALS);
  orch.decide(BUILD, CRITICAL);

  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => [e.kind, e.stage, e.tier, e.source, e.model, e.provider]),
    [
      ["routing", "build", "efficient", "fall_open", "weak-build", "nvidia"],
      ["routing", "build", "capable", "override", "strong-build", "nvidia"],
    ],
  );
  assert.match(events[0]?.reason ?? "", /tier=efficient source=fall_open/);
});

// ══════════════════════════════════════════════════════════════════════════
// 11. never[] — DENIED MODELS FILTERED FROM CANDIDATE PICKS
// ══════════════════════════════════════════════════════════════════════════

test("never[] filters denied models from the pick (fails across tiers first)", () => {
  const orch = new Orchestrator({
    cwd: "/tmp",
    castConfig: CASTS,
    pins: { never: ["nvidia/weak-build"] },
  });
  const d = orch.decide(BUILD, NO_SIGNALS); // efficient tier, weak-build denied
  assert.equal(d.tier, "efficient", "the tier decision stands — only the pick moves");
  assert.equal(d.model, "strong-build", "the capable tier's stage model is the next candidate");
});
