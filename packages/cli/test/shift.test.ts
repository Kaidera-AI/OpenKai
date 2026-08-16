/**
 * Shift — per-job routing tests (E002 Inc 02, Switchyard pattern).
 *
 * Covers:
 *   1. Stage classification — deterministic, config-first, per class, with
 *      WORD-BOUNDARY matching (the substring bug fix).
 *   2. Fallback-chain ORDER on 429/5xx — asserts the exact order, not merely
 *      that a fallback occurred; includes cross-provider fallback.
 *   3. Capped-retry bound — the router stops after the configured cap.
 *   4. Budget guard — the router refuses when the token OR cost budget is
 *      exceeded, on BOTH the primary route and the fallback path.
 *   5. SECURITY (F7/F6c) — a secret-bearing provider error (API key echoed
 *      back in a 401/429 body) is redacted BOTH in the jsonl file AND in
 *      `openkai tail` output, through the existing redaction seam.
 *   6. Activity feed rendering — routing events show distinct models per
 *      stage in `openkai tail` output.
 *   7. Cast reuse — routing reuses the Inc 01 cast config, no second surface.
 *   8. Production wiring — the fuse command constructs a ShiftRouter and
 *      emits routing events through appendActivity.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  classifyStage,
  fallbackChain,
  ShiftRouter,
  FallbackExhaustedError,
  BudgetExceededError,
  redactRoutingEvent,
  createRedactingSink,
  type Cast,
  type RoutingEvent,
  type ActivitySink,
  type FallbackTarget,
} from "@kaidera/openkai-core";

// Import the CLI-side activity writer + tail renderer (the seam under test).
import { appendActivity, runTail, activityLogPath } from "../dist/tail.js";
// The REAL production routing emitter — tested directly, not via a replica.
import { emitShiftRoutingEvents } from "../dist/fuse.js";

// ── Fixtures ──────────────────────────────────────────────────────────────

/** A balanced cast with two DISTINCT models (for fallback-order tests). */
const BALANCED_CAST: Cast = {
  id: "balanced",
  tier: "balanced",
  provider: "nvidia",
  architectModel: "meta/llama-3.1-70b-instruct",
  builderModel: "meta/llama-3.1-8b-instruct",
  judgeModel: "meta/llama-3.1-70b-instruct",
  label: "Balanced — 70b plans, 8b builds (nvidia)",
};

/** A self-paired cheap cast (same model both roles — one-element chain). */
const CHEAP_CAST: Cast = {
  id: "cheap",
  tier: "cheap",
  provider: "nvidia",
  architectModel: "meta/llama-3.1-8b-instruct",
  builderModel: "meta/llama-3.1-8b-instruct",
  label: "Cheap — self-paired 8b (nvidia)",
};

/** A free-tier cast on a DIFFERENT provider (for cross-provider fallback). */
const FREE_CAST: Cast = {
  id: "openrouter-free",
  tier: "cheap",
  provider: "openrouter",
  architectModel: "nvidia/nemotron-3-nano-30b-a3b:free",
  builderModel: "nvidia/nemotron-3-nano-30b-a3b:free",
  label: "Free tier — self-paired nemotron (openrouter)",
};

// ══════════════════════════════════════════════════════════════════════════
// 1. STAGE CLASSIFICATION — deterministic, config-first, per class,
//    WORD-BOUNDARY matching (substring bug fix)
// ══════════════════════════════════════════════════════════════════════════

test("classification: 'design the API' → plan (keyword match)", () => {
  assert.equal(
    classifyStage({ prompt: "design the REST API for the orders service" }),
    "plan",
  );
});

test("classification: 'implement the handler' → build (keyword match)", () => {
  assert.equal(
    classifyStage({ prompt: "implement the request handler with error handling" }),
    "build",
  );
});

test("classification: 'review the diff for bugs' → review (keyword match)", () => {
  assert.equal(
    classifyStage({ prompt: "review this diff for potential bugs" }),
    "review",
  );
});

test("classification: 'check the test results' → review (keyword match)", () => {
  assert.equal(
    classifyStage({ prompt: "check the test results and report" }),
    "review",
  );
});

// ── Substring bug fix: these previously mis-routed to build ──────────────

test("classification SUBSTRING FIX: 'review the address validation' → review (not build via 'add' in 'address')", () => {
  // 'add' is a build keyword, but it must NOT match inside 'address'.
  // 'review' is a review keyword and must win.
  assert.equal(
    classifyStage({ prompt: "review the address validation logic" }),
    "review",
  );
});

test("classification SUBSTRING FIX: 'check the prefix handling' → review (not build via 'fix' in 'prefix')", () => {
  // 'fix' is a build keyword, but it must NOT match inside 'prefix'.
  // 'check' is a review keyword and must win.
  assert.equal(
    classifyStage({ prompt: "check the prefix handling in the parser" }),
    "review",
  );
});

test("classification SUBSTRING FIX: 'create the assessment' → build (\bassess\b does NOT match 'assessment')", () => {
  // 'assess' is a review keyword, but \bassess\b does NOT match
  // 'assessment' because 'assess' is followed by 'm' (a word character),
  // so there is no word boundary. 'create' is a build keyword and wins.
  assert.equal(
    classifyStage({ prompt: "create the assessment" }),
    "build",
  );
});

test("classification SUBSTRING FIX: 'evaluate the options' → plan (phrase keyword)", () => {
  assert.equal(
    classifyStage({ prompt: "evaluate options for the migration strategy" }),
    "plan",
  );
});

// ── Task-class mapping (config-first, no keyword needed) ─────────────────

test("classification: taskClass=architecture → plan (config-first, no keyword needed)", () => {
  assert.equal(
    classifyStage({ prompt: "do the thing", taskClass: "architecture" }),
    "plan",
  );
});

test("classification: taskClass=routine → build (config-first)", () => {
  assert.equal(
    classifyStage({ prompt: "do the thing", taskClass: "routine" }),
    "build",
  );
});

test("classification: taskClass=ambiguous → plan (plan-first when ambiguous)", () => {
  assert.equal(
    classifyStage({ prompt: "do the thing", taskClass: "ambiguous" }),
    "plan",
  );
});

test("classification: taskClass=high-blast-radius → plan", () => {
  assert.equal(
    classifyStage({ prompt: "do the thing", taskClass: "high-blast-radius" }),
    "plan",
  );
});

test("classification: no keywords match → default build", () => {
  assert.equal(
    classifyStage({ prompt: "hello world" }),
    "build",
  );
});

test("classification: deterministic — same input always yields the same stage", () => {
  const input = { prompt: "plan and implement the feature, then review it" };
  const first = classifyStage(input);
  for (let i = 0; i < 20; i++) {
    assert.equal(classifyStage(input), first, `iteration ${i} must match`);
  }
});

test("classification: no model call — pure function, no side effects", () => {
  // The classifier must not touch the network or any provider. We verify it
  // works with no provider configured and no env vars set.
  const saved = { ...process.env };
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.NVIDIA_API_KEY;
  try {
    const stage = classifyStage({ prompt: "architect the system" });
    assert.equal(stage, "plan");
  } finally {
    process.env = saved;
  }
});

test("classification: custom config overrides default keywords", () => {
  const stage = classifyStage(
    { prompt: "yolo this thing" },
    { stageKeywords: { plan: ["yolo"] } },
  );
  assert.equal(stage, "plan", "custom keyword 'yolo' maps to plan");
});

test("classification: custom defaultStage overrides the fallback", () => {
  const stage = classifyStage(
    { prompt: "hello world" },
    { defaultStage: "review" },
  );
  assert.equal(stage, "review");
});

// ══════════════════════════════════════════════════════════════════════════
// 2. FALLBACK-CHAIN ORDER — assert the exact order, not merely that a
//    fallback occurred; includes cross-provider fallback
// ══════════════════════════════════════════════════════════════════════════

test("fallbackChain: plan stage starts with architect, then builder (de-duplicated)", () => {
  const chain = fallbackChain("plan", BALANCED_CAST);
  // architect is primary; builder is next; judge is the same as architect so
  // it is de-duplicated → [nvidia/70b, nvidia/8b]
  assert.deepEqual(
    chain.map((t) => t.model),
    ["meta/llama-3.1-70b-instruct", "meta/llama-3.1-8b-instruct"],
  );
  assert.equal(chain[0]!.provider, "nvidia");
});

test("fallbackChain: build stage starts with builder, then architect", () => {
  const chain = fallbackChain("build", BALANCED_CAST);
  assert.deepEqual(
    chain.map((t) => t.model),
    ["meta/llama-3.1-8b-instruct", "meta/llama-3.1-70b-instruct"],
  );
});

test("fallbackChain: review stage starts with judge (or architect), then the rest", () => {
  // judge = architect (70b) in the balanced cast → primary is 70b, then 8b
  const chain = fallbackChain("review", BALANCED_CAST);
  assert.deepEqual(
    chain.map((t) => t.model),
    ["meta/llama-3.1-70b-instruct", "meta/llama-3.1-8b-instruct"],
  );
});

test("fallbackChain: self-paired cast yields a one-element chain (within cast)", () => {
  const chain = fallbackChain("plan", CHEAP_CAST);
  assert.deepEqual(
    chain.map((t) => t.model),
    ["meta/llama-3.1-8b-instruct"],
  );
});

test("fallbackChain: cross-provider fallback — self-paired cast + free cast gives cross-provider chain", () => {
  // The cheap cast (nvidia, 8b) alone has a one-element chain. With the free
  // cast (openrouter) as a fallback, the chain spans providers.
  const chain = fallbackChain("plan", CHEAP_CAST, [FREE_CAST]);
  assert.equal(chain.length, 2);
  assert.equal(chain[0]!.provider, "nvidia");
  assert.equal(chain[0]!.model, "meta/llama-3.1-8b-instruct");
  // Cross-provider fallback:
  assert.equal(chain[1]!.provider, "openrouter");
  assert.equal(chain[1]!.model, "nvidia/nemotron-3-nano-30b-a3b:free");
});

test("fallbackChain: cross-provider fallback — different-provider casts prioritised first", () => {
  // When multiple fallback casts are available, different-provider casts
  // come before same-provider ones.
  const sameProviderCast: Cast = {
    id: "nvidia-frontier",
    tier: "frontier",
    provider: "nvidia",
    architectModel: "meta/llama-3.1-405b-instruct",
    builderModel: "meta/llama-3.1-405b-instruct",
    label: "Frontier (nvidia)",
  };
  const chain = fallbackChain("plan", CHEAP_CAST, [sameProviderCast, FREE_CAST]);
  // Primary: nvidia/8b
  assert.equal(chain[0]!.provider, "nvidia");
  assert.equal(chain[0]!.model, "meta/llama-3.1-8b-instruct");
  // Next: openrouter (different provider) should come before nvidia-frontier
  assert.equal(chain[1]!.provider, "openrouter");
  // Then: nvidia-frontier (same provider, different model)
  assert.equal(chain[2]!.provider, "nvidia");
  assert.equal(chain[2]!.model, "meta/llama-3.1-405b-instruct");
});

test("fallback ORDER on 429: plan tries architect → builder (assert exact sequence)", () => {
  const events: RoutingEvent[] = [];
  const sink: ActivitySink = (e) => events.push(e);
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    onActivity: sink,
  });

  // Primary route.
  const primary = router.route("plan");
  assert.equal(primary.model, "meta/llama-3.1-70b-instruct");
  assert.equal(primary.provider, "nvidia");
  assert.equal(primary.attempt, 0);

  // 429 → fallback to builder (8b).
  const fallback1 = router.next("plan", { status: 429, message: "rate limited" });
  assert.equal(fallback1.model, "meta/llama-3.1-8b-instruct");
  assert.equal(fallback1.provider, "nvidia");
  assert.equal(fallback1.attempt, 1);

  // The events show the exact order: routing → fallback
  const routingEvents = events.filter((e) => e.kind === "routing");
  const fallbackEvents = events.filter((e) => e.kind === "fallback");
  assert.equal(routingEvents.length, 1);
  assert.equal(routingEvents[0]!.model, "meta/llama-3.1-70b-instruct");
  assert.equal(fallbackEvents.length, 1);
  assert.equal(fallbackEvents[0]!.model, "meta/llama-3.1-8b-instruct");
  assert.equal(fallbackEvents[0]!.attempt, 1);
});

test("fallback ORDER on 500: build tries builder → architect (assert exact sequence)", () => {
  const events: RoutingEvent[] = [];
  const sink: ActivitySink = (e) => events.push(e);
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    onActivity: sink,
  });

  const primary = router.route("build");
  assert.equal(primary.model, "meta/llama-3.1-8b-instruct");

  // 5xx → fallback to architect (70b).
  const fallback1 = router.next("build", { status: 503, message: "service unavailable" });
  assert.equal(fallback1.model, "meta/llama-3.1-70b-instruct");
  assert.equal(fallback1.attempt, 1);

  // Assert the exact fallback order in the events.
  assert.equal(events[1]!.kind, "fallback");
  assert.equal(events[1]!.model, "meta/llama-3.1-70b-instruct");
  assert.equal(events[1]!.stage, "build");
});

test("fallback ORDER cross-provider: self-paired cast falls back to different provider", () => {
  const events: RoutingEvent[] = [];
  const sink: ActivitySink = (e) => events.push(e);
  const router = new ShiftRouter({
    cast: CHEAP_CAST,
    fallbackCasts: [FREE_CAST],
    maxRetries: 5,
    onActivity: sink,
  });

  const primary = router.route("plan");
  assert.equal(primary.provider, "nvidia");
  assert.equal(primary.model, "meta/llama-3.1-8b-instruct");

  // 429 on nvidia → fallback to openrouter (cross-provider).
  const fallback1 = router.next("plan", { status: 429, message: "nvidia rate limited" });
  assert.equal(fallback1.provider, "openrouter");
  assert.equal(fallback1.model, "nvidia/nemotron-3-nano-30b-a3b:free");
  assert.equal(fallback1.attempt, 1);

  // Assert the exact sequence in events.
  assert.equal(events[1]!.kind, "fallback");
  assert.equal(events[1]!.provider, "openrouter");
});

test("non-retryable 401 does NOT trigger fallback — surfaces immediately", () => {
  const router = new ShiftRouter({ cast: BALANCED_CAST, maxRetries: 5 });
  router.route("plan");
  assert.throws(
    () => router.next("plan", { status: 401, message: "unauthorized" }),
    /non-retryable/,
  );
});

// ══════════════════════════════════════════════════════════════════════════
// 3. CAPPED-RETRY BOUND — the router stops after the configured cap
// ══════════════════════════════════════════════════════════════════════════

test("capped-retry: exhausts chain and throws FallbackExhaustedError", () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5, // larger than the chain (2 models)
  });
  router.route("plan");
  router.next("plan", { status: 429, message: "rate limited 1" });
  // Chain has 2 models; attempt 2 would exceed the chain length.
  assert.throws(
    () => router.next("plan", { status: 429, message: "rate limited 2" }),
    (err: unknown) => err instanceof FallbackExhaustedError,
  );
});

test("capped-retry: maxRetries=1 stops after one fallback", () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 1,
  });
  router.route("plan");
  router.next("plan", { status: 500, message: "server error" });
  // One fallback done; the next call should exhaust (attempt 2 > maxRetries 1).
  assert.throws(
    () => router.next("plan", { status: 500, message: "server error 2" }),
    (err: unknown) => err instanceof FallbackExhaustedError,
  );
});

test("capped-retry: maxRetries=0 allows primary only (no fallback)", () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 0,
  });
  router.route("plan");
  // attempt 1 > maxRetries 0 → immediately exhausted.
  assert.throws(
    () => router.next("plan", { status: 429, message: "rate limited" }),
    (err: unknown) => err instanceof FallbackExhaustedError,
  );
});

test("capped-retry: with cross-provider fallback the chain is longer so maxRetries is the binding cap", () => {
  // With cross-provider fallback, the chain for CHEAP_CAST + FREE_CAST is 2.
  // maxRetries=3 would allow up to 3 retries, but the chain (2) limits first.
  const router = new ShiftRouter({
    cast: CHEAP_CAST,
    fallbackCasts: [FREE_CAST],
    maxRetries: 3,
  });
  router.route("plan");
  router.next("plan", { status: 429, message: "nvidia 429" });
  // Chain has 2; attempt 2 >= chain.length → exhausted (not cap).
  assert.throws(
    () => router.next("plan", { status: 429, message: "openrouter 429" }),
    (err: unknown) => err instanceof FallbackExhaustedError,
  );
});

// ══════════════════════════════════════════════════════════════════════════
// 4. BUDGET GUARD — refuses on BOTH primary route and fallback path,
//    enforces BOTH token and cost budgets
// ══════════════════════════════════════════════════════════════════════════

test("budget guard: refuses on PRIMARY route when token budget is exceeded", () => {
  // The rework found the guard was inert on route() — only checked in next().
  // This test proves route() now checks the budget.
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    budget: { maxTokens: 1000 },
  });
  // Simulate usage that pushes us over the budget BEFORE any routing.
  router.trackUsage({ totalTokens: 1200 });
  assert.throws(
    () => router.route("plan"),
    (err: unknown) => err instanceof BudgetExceededError,
  );
});

test("budget guard: refuses fallback when token budget is exceeded", () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    budget: { maxTokens: 1000 },
  });
  router.route("plan");
  // Simulate usage that pushes us over the budget.
  router.trackUsage({ totalTokens: 1200 });
  assert.throws(
    () => router.next("plan", { status: 429, message: "rate limited" }),
    (err: unknown) => err instanceof BudgetExceededError,
  );
});

test("budget guard: allows primary route when under budget", () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    budget: { maxTokens: 10000 },
  });
  router.trackUsage({ totalTokens: 500 });
  const result = router.route("plan");
  assert.equal(result.model, "meta/llama-3.1-70b-instruct");
});

test("budget guard: allows fallback when under budget", () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    budget: { maxTokens: 10000 },
  });
  router.route("plan");
  router.trackUsage({ totalTokens: 500 });
  const fallback = router.next("plan", { status: 429, message: "rate limited" });
  assert.equal(fallback.model, "meta/llama-3.1-8b-instruct");
});

test("budget guard: tracks cumulative usage across calls", () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    budget: { maxTokens: 2000 },
  });
  router.trackUsage({ totalTokens: 800 });
  assert.equal(router.budgetState.tokensUsed, 800);
  router.trackUsage({ totalTokens: 800 });
  assert.equal(router.budgetState.tokensUsed, 1600);
  // One more push over the 2000 cap.
  router.trackUsage({ totalTokens: 800 });
  assert.equal(router.budgetState.tokensUsed, 2400);
  // Now over budget — the guard should refuse on the primary route.
  assert.throws(
    () => router.route("plan"),
    (err: unknown) => err instanceof BudgetExceededError,
  );
});

test("budget guard: enforces maxCost on primary route (previously never enforced)", () => {
  // The rework found maxCost was tracked but never enforced. This test
  // proves it is now checked on route().
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    budget: { maxCost: 0.50 },
  });
  router.trackUsage({ cost: { total: 0.60 } });
  assert.equal(router.budgetState.costUsed, 0.60);
  assert.throws(
    () => router.route("plan"),
    (err: unknown) => err instanceof BudgetExceededError,
  );
});

test("budget guard: enforces maxCost on fallback path", () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
    budget: { maxCost: 0.50 },
  });
  router.route("plan");
  router.trackUsage({ cost: { total: 0.60 } });
  assert.throws(
    () => router.next("plan", { status: 429, message: "rate limited" }),
    (err: unknown) => err instanceof BudgetExceededError,
  );
});

test("budget guard: BudgetExceededError message names the unit (tokens or cost)", () => {
  const tokenRouter = new ShiftRouter({
    cast: BALANCED_CAST,
    budget: { maxTokens: 100 },
  });
  tokenRouter.trackUsage({ totalTokens: 200 });
  assert.throws(
    () => tokenRouter.route("plan"),
    /tokens/,
  );

  const costRouter = new ShiftRouter({
    cast: BALANCED_CAST,
    budget: { maxCost: 0.10 },
  });
  costRouter.trackUsage({ cost: { total: 0.20 } });
  assert.throws(
    () => costRouter.route("plan"),
    /cost/,
  );
});

// ── completeWithFallback integration ─────────────────────────────────────

test("completeWithFallback: retries on 429 and succeeds on fallback model", async () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
  });

  let callCount = 0;
  const calls: FallbackTarget[] = [];
  const fn = async (target: FallbackTarget): Promise<{ text: string; usage?: { totalTokens?: number } }> => {
    calls.push(target);
    callCount += 1;
    if (callCount === 1) {
      throw Object.assign(new Error("rate limited"), { status: 429 });
    }
    return { text: "ok", usage: { totalTokens: 100 } };
  };

  const errorExtractor = (err: unknown): { status?: number; message: string } | null => {
    if (err && typeof err === "object" && "status" in err) {
      return { status: (err as { status: number }).status, message: err instanceof Error ? err.message : String(err) };
    }
    return null;
  };

  const { result, attempts } = await router.completeWithFallback("plan", fn, errorExtractor);
  assert.equal(result.text, "ok");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]!.model, "meta/llama-3.1-70b-instruct");
  assert.equal(attempts[1]!.model, "meta/llama-3.1-8b-instruct");
  // Usage was tracked from the successful call.
  assert.equal(router.budgetState.tokensUsed, 100);
});

test("completeWithFallback: throws FallbackExhaustedError when all fallbacks fail", async () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
  });

  const fn = async (): Promise<{ text: string }> => {
    throw Object.assign(new Error("rate limited"), { status: 429 });
  };

  const errorExtractor = (err: unknown): { status?: number; message: string } | null => {
    if (err && typeof err === "object" && "status" in err) {
      return { status: (err as { status: number }).status, message: err instanceof Error ? err.message : String(err) };
    }
    return null;
  };

  await assert.rejects(
    router.completeWithFallback("plan", fn, errorExtractor),
    (err: unknown) => err instanceof FallbackExhaustedError,
  );
});

test("completeWithFallback: non-retryable error throws immediately (no fallback)", async () => {
  const router = new ShiftRouter({
    cast: BALANCED_CAST,
    maxRetries: 5,
  });

  let callCount = 0;
  const fn = async (): Promise<{ text: string }> => {
    callCount += 1;
    throw Object.assign(new Error("unauthorized"), { status: 401 });
  };

  const errorExtractor = (err: unknown): { status?: number; message: string } | null => {
    if (err && typeof err === "object" && "status" in err) {
      return { status: (err as { status: number }).status, message: err instanceof Error ? err.message : String(err) };
    }
    return null;
  };

  await assert.rejects(
    router.completeWithFallback("plan", fn, errorExtractor),
    /non-retryable/,
  );
  assert.equal(callCount, 1, "only the primary was called — no fallback for 401");
});

// ══════════════════════════════════════════════════════════════════════════
// 5. SECURITY (F7/F6c) — secret-bearing provider error is redacted BOTH in
//    the jsonl file AND in `openkai tail` output, through the existing seam.
//    A new writer that bypasses the seam re-opens a closed finding.
// ══════════════════════════════════════════════════════════════════════════

test("SECURITY: routing events are redacted by createRedactingSink before reaching the caller", () => {
  const received: RoutingEvent[] = [];
  const innerSink: ActivitySink = (e) => received.push(e);
  const redacting = createRedactingSink(innerSink);

  // A provider error that echoes the API key back in the body (a real 401/429
  // pattern: "Unauthorized: key sk-live-abc123def456 is invalid").
  redacting({
    kind: "fallback",
    stage: "plan",
    model: "meta/llama-3.1-70b-instruct",
    provider: "nvidia",
    attempt: 1,
    reason: "401 Unauthorized: key sk-live-abc123def456 is invalid",
  });

  assert.equal(received.length, 1);
  const event = received[0]!;
  assert.match(event.reason!, /\[redacted-secret\]/);
  assert.doesNotMatch(event.reason!, /sk-live-abc123def456/);
});

test("SECURITY: redactRoutingEvent redacts all string fields", () => {
  const redacted = redactRoutingEvent({
    kind: "routing_error",
    stage: "build",
    model: "sk-test-key-in-model-field-123456",
    provider: "nvapi-test-provider-key-abcdef",
    reason: "failed: key sk-secret-key-here-abcdef is revoked",
  });
  assert.match(redacted.model!, /\[redacted-secret\]/);
  assert.match(redacted.provider!, /\[redacted-secret\]/);
  assert.match(redacted.reason!, /\[redacted-secret\]/);
  assert.doesNotMatch(JSON.stringify(redacted), /sk-test-key/);
  assert.doesNotMatch(JSON.stringify(redacted), /nvapi-test/);
  assert.doesNotMatch(JSON.stringify(redacted), /sk-secret-key/);
});

test("SECURITY REPRODUCER: secret-bearing provider error is redacted in activity.jsonl AND in openkai tail output", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okshift-sec-"));
  try {
    // The activity sink: this is the SAME appendActivity the production
    // fuse command uses (the existing seam in tail.ts). Routing events
    // flow through this same writer — no parallel writer, no bypass.
    const sink: ActivitySink = (event) => {
      appendActivity(cwd, event.kind, {
        stage: event.stage,
        model: event.model,
        provider: event.provider,
        attempt: event.attempt,
        reason: event.reason,
        usage: event.usage,
        message: event.reason, // also as message for error-kind rows
      });
    };

    // Build a router with the redacting sink wrapping appendActivity.
    // The router's createRedactingSink applies redactSecrets before the
    // event reaches appendActivity — AND appendActivity itself also redacts
    // (belt and braces). Both layers must fire.
    const router = new ShiftRouter({
      cast: BALANCED_CAST,
      maxRetries: 5,
      onActivity: sink,
    });

    // Simulate a provider error that echoes the API key back in the body.
    // This is the F7/F6c attack: a 429/401 response body containing the
    // caller's secret, which would be persisted to the activity feed.
    const SECRET = "sk-live-abc123def456ghi789";
    router.route("plan");
    // The error message carries the secret — as a real provider might echo.
    try {
      router.next("plan", {
        status: 429,
        message: `Rate limited: your key ${SECRET} has exceeded quota`,
      });
    } catch {
      // may exhaust — not relevant to the redaction test
    }

    // ── Assertion 1: the jsonl file does NOT contain the secret ──────────
    const logPath = activityLogPath(cwd);
    const fileContent = await readFile(logPath, "utf-8");
    assert.doesNotMatch(
      fileContent,
      new RegExp(SECRET),
      "activity.jsonl must NOT contain the raw secret",
    );
    assert.match(
      fileContent,
      /\[redacted-secret\]/,
      "activity.jsonl must contain the redaction marker",
    );

    // ── Assertion 2: `openkai tail` output does NOT contain the secret ───
    // Capture stdout from runTail (the same renderer `openkai tail` uses).
    const oldWrite = process.stdout.write.bind(process.stdout);
    let tailOutput = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      tailOutput += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    try {
      await runTail({ follow: false, lines: 100, cwd });
    } finally {
      process.stdout.write = oldWrite;
    }

    assert.doesNotMatch(
      tailOutput,
      new RegExp(SECRET),
      "openkai tail output must NOT contain the raw secret",
    );
    // The routing/fallback line should be visible (redacted).
    assert.match(tailOutput, /plan|fallback/, "routing events appear in tail output");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("SECURITY: appendActivity redacts secrets even when called directly (belt and braces)", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okshift-belt-"));
  try {
    const SECRET = "nvapi-secret-key-in-error-body-xyz";
    appendActivity(cwd, "error", {
      message: `provider error: key ${SECRET} is not authorized`,
    });

    const fileContent = await readFile(activityLogPath(cwd), "utf-8");
    assert.doesNotMatch(fileContent, new RegExp(SECRET));
    assert.match(fileContent, /\[redacted-secret\]/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 6. ACTIVITY FEED RENDERING — routing events show distinct models per stage
//    in `openkai tail` output (PRODUCTION WIRING proof)
// ══════════════════════════════════════════════════════════════════════════

test("openkai tail: routing events show distinct models per stage (production wiring proof)", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okshift-tail-"));
  try {
    // This is the SAME pattern the fuse command uses: construct a ShiftRouter
    // with appendActivity as the onActivity sink, then route all three
    // stages. The routing events land in activity.jsonl through the existing
    // seam and are visible in `openkai tail`.
    const sink: ActivitySink = (event) => {
      appendActivity(cwd, event.kind, {
        stage: event.stage,
        model: event.model,
        provider: event.provider,
        attempt: event.attempt,
        reason: event.reason,
      });
    };

    const router = new ShiftRouter({
      cast: BALANCED_CAST,
      maxRetries: 5,
      onActivity: sink,
    });

    // Route all three stages — each to its cast model.
    // plan → architect (70b), build → builder (8b), review → judge (70b).
    router.route("plan");
    router.route("build");
    router.route("review");

    // Capture tail output.
    const oldWrite = process.stdout.write.bind(process.stdout);
    let tailOutput = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      tailOutput += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    try {
      await runTail({ follow: false, lines: 100, cwd });
    } finally {
      process.stdout.write = oldWrite;
    }

    // The tail output must show distinct models per stage.
    assert.match(tailOutput, /plan.*llama-3\.1-70b/, "plan stage shows 70b model");
    assert.match(tailOutput, /build.*llama-3\.1-8b/, "build stage shows 8b model");
    assert.match(tailOutput, /review.*llama-3\.1-70b/, "review stage shows 70b model");

    // Verify the jsonl file has the routing rows.
    const fileContent = await readFile(activityLogPath(cwd), "utf-8");
    const rows = fileContent.trim().split("\n").map((l) => JSON.parse(l) as Record<string, unknown>);
    const routingRows = rows.filter((r) => r.kind === "routing");
    assert.equal(routingRows.length, 3, "three routing events emitted");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("openkai tail: fallback events show the fallback model and attempt", async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), "okshift-fallback-tail-"));
  try {
    const sink: ActivitySink = (event) => {
      appendActivity(cwd, event.kind, {
        stage: event.stage,
        model: event.model,
        provider: event.provider,
        attempt: event.attempt,
        reason: event.reason,
      });
    };

    const router = new ShiftRouter({
      cast: BALANCED_CAST,
      maxRetries: 5,
      onActivity: sink,
    });

    router.route("plan");
    router.next("plan", { status: 429, message: "rate limited" });

    const oldWrite = process.stdout.write.bind(process.stdout);
    let tailOutput = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      tailOutput += chunk.toString();
      return true;
    }) as typeof process.stdout.write;
    try {
      await runTail({ follow: false, lines: 100, cwd });
    } finally {
      process.stdout.write = oldWrite;
    }

    // The fallback line shows the 8b model and attempt 1.
    assert.match(tailOutput, /fallback.*llama-3\.1-8b.*attempt 1/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// 7. CAST REUSE — routing reuses the Inc 01 cast config, no second surface
// ══════════════════════════════════════════════════════════════════════════

test("cast reuse: router uses cast.architectModel for plan, cast.builderModel for build", () => {
  const router = new ShiftRouter({ cast: BALANCED_CAST });
  assert.equal(router.route("plan").model, BALANCED_CAST.architectModel);
  assert.equal(router.route("build").model, BALANCED_CAST.builderModel);
  assert.equal(router.route("review").model, BALANCED_CAST.judgeModel ?? BALANCED_CAST.architectModel);
});

test("cast reuse: router provider matches cast provider (no second model-config surface)", () => {
  const router = new ShiftRouter({ cast: BALANCED_CAST });
  assert.equal(router.route("plan").provider, BALANCED_CAST.provider);
  assert.equal(router.route("build").provider, BALANCED_CAST.provider);
});

test("cast reuse: fallbackCasts are derived from the same config (no second surface)", () => {
  // The fallback casts come from listCasts(config) — the same Inc 01 config.
  // No new model-config surface is introduced.
  const router = new ShiftRouter({
    cast: CHEAP_CAST,
    fallbackCasts: [FREE_CAST],
  });
  const primary = router.route("plan");
  assert.equal(primary.provider, "nvidia");
  // Fallback goes to the free cast's provider (openrouter).
  const fallback = router.next("plan", { status: 429, message: "rate limited" });
  assert.equal(fallback.provider, "openrouter");
});
// ══════════════════════════════════════════════════════════════════════════
// 7. REVIEW FIXES (kai@openkai, E002 Inc 02 acceptance) — two defects the
//    suite above could not see, because its "production wiring" tests
//    hand-rolled a replica of the fuse path instead of calling it.
// ══════════════════════════════════════════════════════════════════════════

test("classification: an explicit review verb beats a build NOUN in the same prompt", () => {
  // Regression: "code" was a build keyword, so "review the code" scored
  // review=1/build=1 and the plan→build→review tie-break handed it to build.
  // The prior substring fix only covered the two literal prompts it cited.
  for (const prompt of [
    "review the code",
    "review this code for bugs",
    "audit the code",
    "test the new code",
  ]) {
    assert.equal(classifyStage({ prompt }), "review", `"${prompt}" must route to review`);
  }
  // Build intent with a real build verb is unaffected.
  assert.equal(classifyStage({ prompt: "implement the handler" }), "build");
  assert.equal(classifyStage({ prompt: "write the parser" }), "build");
});

test("emitShiftRoutingEvents writes exactly ONE routing row per stage", async () => {
  // Regression: the production function called router.route() (which already
  // emits through the redacting sink) AND appendActivity directly, so every
  // stage was double-logged — 6 rows for 3 stages in `openkai tail`.
  // This calls the REAL exported function, not a replica of it.
  const cwd = await mkdtemp(path.join(tmpdir(), "okshift-emit-"));
  try {
    const router = new ShiftRouter({
      cast: BALANCED_CAST,
      onActivity: (event) => {
        appendActivity(cwd, event.kind, {
          stage: event.stage,
          model: event.model,
          provider: event.provider,
          attempt: event.attempt,
          reason: event.reason,
        });
      },
    });

    emitShiftRoutingEvents(router);

    const rows = (await readFile(activityLogPath(cwd), "utf-8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    assert.equal(rows.length, 3, "exactly three rows — one per stage, not six");
    assert.deepEqual(
      rows.map((r) => r.stage),
      ["plan", "build", "review"],
      "one row per stage, in order",
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
