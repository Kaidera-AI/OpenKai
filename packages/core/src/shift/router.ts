/**
 * Shift — the stage router over pi-ai (E002 Inc 02, Switchyard pattern).
 *
 * Routes each stage to its cast model, provides a PROVIDER fallback chain on
 * 429/5xx with capped retries, and guards a token+cost budget. Routing
 * decisions are emitted as {@link RoutingEvent}s through a redacting activity
 * sink — the same seam session events use.
 *
 * The router reuses the Inc 01 cast config ({@link Cast}): no second
 * model-config surface. The cast's `architectModel` → plan stage,
 * `builderModel` → build stage, `judgeModel` (or `architectModel`) → review
 * stage. The fallback chain for each stage is derived from the cast's model
 * list PLUS other configured casts (cross-provider fallback) — no new
 * configuration surface, just the existing casts.
 */

import type { Cast } from "../fusion/casts.js";
import type { Stage } from "./stages.js";
import {
  classifyStage,
  type ShiftInput,
  type StageConfig,
} from "./stages.js";
import {
  createRedactingSink,
  type ActivitySink,
  type RoutingEvent,
} from "./activity.js";

/** A fallback target: a model + its provider (cross-provider fallback). */
export interface FallbackTarget {
  /** Provider id (from the cast). */
  provider: string;
  /** Model id (as it appears in the cast). */
  model: string;
}

/** The model selected for a stage, with its source provider. */
export interface RouteResult {
  stage: Stage;
  /** Model id (as it appears in the cast). */
  model: string;
  /** Provider id (from the cast — may differ on fallback). */
  provider: string;
  /** Zero-based position in the fallback chain (0 = primary). */
  attempt: number;
}

/** Budget configuration for the budget guard. */
export interface BudgetConfig {
  /** Maximum total tokens across all routed calls. Default: Infinity. */
  maxTokens?: number;
  /** Maximum total cost. Default: Infinity. */
  maxCost?: number;
}

/** Router configuration. */
export interface ShiftRouterOptions {
  /** The cast to route among (from Inc 01 config — no second model surface). */
  cast: Cast;
  /**
   * Additional casts for cross-provider fallback. When the primary cast's
   * provider is rate-limited (429) or down (5xx), the router falls back to
   * models from these casts. Derived from the same `~/.openkai/config.json`
   * casts list — no second config surface.
   */
  fallbackCasts?: Cast[];
  /** Stage classification config (keyword sets, priority, defaults). */
  stageConfig?: StageConfig;
  /** Maximum fallback attempts per stage (default: 3). */
  maxRetries?: number;
  /** Budget guard configuration. */
  budget?: BudgetConfig;
  /**
   * Activity sink for routing events. Events are redacted before reaching
   * this sink (see {@link createRedactingSink}). When omitted, no events are
   * emitted (useful for headless tests that inspect return values only).
   */
  onActivity?: ActivitySink;
}

/** The stage → primary model mapping derived from a cast. */
function stageModel(stage: Stage, cast: Cast): string {
  switch (stage) {
    case "plan":
      return cast.architectModel;
    case "build":
      return cast.builderModel;
    case "review":
      return cast.judgeModel ?? cast.architectModel;
  }
}

/**
 * Build the ordered fallback chain for a stage from the cast's models PLUS
 * cross-cast fallbacks.
 *
 * The chain starts with the stage's primary model (from the primary cast),
 * then lists every OTHER distinct model in the primary cast (same provider,
 * different model — handles model-specific 429s), then adds models from
 * fallback casts — prioritising DIFFERENT providers first (handles
 * provider-wide 429s/outages). Duplicates (same provider+model) are removed.
 *
 * This fixes the rework finding "fallback is model-only, not provider": a
 * self-paired cast (one model) now gets cross-provider fallback targets from
 * other configured casts, so a provider-wide 429 doesn't exhaust the chain
 * on the first retry.
 */
export function fallbackChain(
  stage: Stage,
  cast: Cast,
  fallbackCasts: Cast[] = [],
): FallbackTarget[] {
  const chain: FallbackTarget[] = [];
  const seen = new Set<string>();

  const add = (provider: string, model: string): void => {
    const key = `${provider}:${model}`;
    if (!seen.has(key)) {
      seen.add(key);
      chain.push({ provider, model });
    }
  };

  // 1. Primary: the stage's model from the primary cast.
  add(cast.provider, stageModel(stage, cast));

  // 2. Other models in the primary cast (same provider, different model).
  for (const m of [cast.architectModel, cast.builderModel, cast.judgeModel]) {
    if (m !== undefined) add(cast.provider, m);
  }

  // 3. Cross-cast fallback: different-provider casts first, then same-provider.
  const sorted = [...fallbackCasts].sort((a, b) => {
    const aSame = a.provider === cast.provider ? 1 : 0;
    const bSame = b.provider === cast.provider ? 1 : 0;
    return aSame - bSame;
  });

  for (const fc of sorted) {
    // The stage's model from this fallback cast.
    add(fc.provider, stageModel(stage, fc));
    // Other models from this fallback cast too.
    for (const m of [fc.architectModel, fc.builderModel, fc.judgeModel]) {
      if (m !== undefined) add(fc.provider, m);
    }
  }

  return chain;
}

/** Error thrown when all fallbacks for a stage are exhausted. */
export class FallbackExhaustedError extends Error {
  override readonly name = "FallbackExhaustedError";
  readonly stage: Stage;
  readonly chain: FallbackTarget[];
  constructor(stage: Stage, chain: FallbackTarget[]) {
    super(
      `all fallback models exhausted for stage "${stage}" ` +
        `(tried ${chain.length}: ${chain.map((c) => `${c.provider}/${c.model}`).join(" → ")}); ` +
        `last error was 429/5xx/transient-network — increase the retry cap or add fallback casts.`,
    );
    this.stage = stage;
    this.chain = chain;
  }
}

/** Error thrown when the budget guard refuses a call. */
export class BudgetExceededError extends Error {
  override readonly name = "BudgetExceededError";
  constructor(used: number, max: number, unit: string) {
    super(
      `budget guard: ${used} ${unit} used exceeds the ${max} ${unit} cap — ` +
        `routing refused before the call to avoid overage.`,
    );
  }
}

/**
 * The Shift router — stateful (tracks the current invocation's attempt
 * counter, the per-task total fallback count, and cumulative budget).
 * One instance per task; discard after the task completes.
 */
export class ShiftRouter {
  private readonly cast: Cast;
  private readonly fallbackCasts: Cast[];
  private readonly stageConfig: StageConfig;
  private readonly maxRetries: number;
  private readonly budget: Required<BudgetConfig>;
  private readonly sink: ActivitySink | undefined;
  /**
   * Fallback attempts within the CURRENT invocation (one route() → next()*
   * sequence). Reset by {@link route} so a fresh call never inherits an
   * earlier call's attempts — the previous per-stage accumulation meant the
   * second invocation of a stage started partway down its own chain.
   */
  private invocationAttempt = 0;
  /**
   * Total fallback attempts across the whole task — the per-task bound that
   * `maxRetries` caps. Separate from the per-invocation counter on purpose:
   * one invocation's retries must not exhaust another's, but a task must not
   * retry forever across many invocations either.
   */
  private totalRetries = 0;
  private tokensUsed = 0;
  private costUsed = 0;

  constructor(options: ShiftRouterOptions) {
    this.cast = options.cast;
    this.fallbackCasts = options.fallbackCasts ?? [];
    this.stageConfig = options.stageConfig ?? {};
    this.maxRetries = options.maxRetries ?? 3;
    this.budget = {
      maxTokens: options.budget?.maxTokens ?? Infinity,
      maxCost: options.budget?.maxCost ?? Infinity,
    };
    // Wrap the caller's sink in the redacting boundary so every emitted event
    // is sanitised before it reaches the activity log.
    this.sink = options.onActivity
      ? createRedactingSink(options.onActivity)
      : undefined;
  }

  /** Classify a prompt into a stage (delegates to the pure classifier). */
  classify(input: ShiftInput): Stage {
    return classifyStage(input, this.stageConfig);
  }

  /**
   * Check the budget guard. Throws {@link BudgetExceededError} when either
   * the token or cost budget is exceeded. Called on BOTH the primary route
   * and every fallback — the rework found the guard was inert on the primary
   * route because it was only checked in {@link next}.
   */
  private checkBudget(): void {
    if (this.tokensUsed >= this.budget.maxTokens) {
      throw new BudgetExceededError(this.tokensUsed, this.budget.maxTokens, "tokens");
    }
    if (this.costUsed >= this.budget.maxCost) {
      throw new BudgetExceededError(this.costUsed, this.budget.maxCost, "cost");
    }
  }

  /**
   * Route a stage to its primary model. Emits a `routing` event.
   * Does NOT consume budget — call {@link trackUsage} after a successful call.
   *
   * The budget guard IS checked here (on the primary route) — the rework
   * found it was only checked on the fallback path, leaving every job's first
   * call unguarded.
   */
  route(stage: Stage): RouteResult {
    this.checkBudget();
    // A route() call opens a new invocation: its fallback attempts count
    // from zero (the per-task totalRetries cap still applies in next()).
    this.invocationAttempt = 0;
    const chain = fallbackChain(stage, this.cast, this.fallbackCasts);
    const target = chain[0]!;
    const result: RouteResult = {
      stage,
      model: target.model,
      provider: target.provider,
      attempt: 0,
    };
    this.emit({
      kind: "routing",
      stage,
      model: target.model,
      provider: target.provider,
      attempt: 0,
      reason: `stage "${stage}" routed to primary model ${target.provider}/${target.model}`,
    });
    return result;
  }

  /**
   * Report an error for the current stage and get the next fallback target.
   *
   * Fallback-eligible errors: 429 (rate limit), 5xx (server error), and
   * STATUSLESS transient network failures — ECONNRESET, ETIMEDOUT,
   * ENOTFOUND, ECONNREFUSED, "fetch failed". A genuine 4xx (auth, bad
   * request) is terminal: retrying it on another model changes nothing.
   *
   * Returns the next {@link RouteResult} in the fallback
   * chain, or throws {@link FallbackExhaustedError} when the chain or retry
   * cap is exhausted. Throws {@link BudgetExceededError} when the budget
   * guard refuses.
   */
  next(stage: Stage, error: { status?: number; message: string }): RouteResult {
    const status = error.status ?? 0;
    // Statusless means no HTTP response ever arrived — a transient network
    // failure. Match the well-known errno names and undici's "fetch failed".
    const isTransientNetwork =
      status === 0 &&
      /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED|fetch failed/i.test(error.message);
    const isFallbackEligible =
      status === 429 || (status >= 500 && status < 600) || isTransientNetwork;

    if (!isFallbackEligible) {
      // Non-retryable error — do not fall back, surface immediately.
      this.emit({
        kind: "routing_error",
        stage,
        reason: `non-retryable error (status ${status}): ${error.message}`,
      });
      throw new Error(
        `routing failed for stage "${stage}" with non-retryable error ` +
          `(status ${status}): ${error.message}`,
      );
    }

    this.invocationAttempt += 1;
    this.totalRetries += 1;
    const chain = fallbackChain(stage, this.cast, this.fallbackCasts);
    const attempt = this.invocationAttempt;

    // Two bounds: the invocation walks its own chain from the front
    // (attempt indexes the chain), and the task as a whole stops after
    // maxRetries total fallbacks — whichever comes first.
    if (this.totalRetries > this.maxRetries || attempt >= chain.length) {
      this.emit({
        kind: "routing_error",
        stage,
        reason: `retried ${this.totalRetries} time(s) this task; chain exhausted or cap reached`,
      });
      throw new FallbackExhaustedError(stage, chain);
    }

    // Budget guard: refuse before making the call (also checks cost).
    this.checkBudget();

    const target = chain[attempt]!;
    this.emit({
      kind: "fallback",
      stage,
      model: target.model,
      provider: target.provider,
      attempt,
      reason: `fallback after status ${status}: ${error.message}`,
    });
    return { stage, model: target.model, provider: target.provider, attempt };
  }

  /**
   * Complete a call with automatic provider fallback. Wraps a caller-supplied
   * completion function: routes to the primary target, calls `fn`, and on a
   * retryable error (429/5xx) falls back to the next target in the chain.
   *
   * The `errorExtractor` callback lets the caller map a thrown error to a
   * `{status, message}` shape — provider SDKs surface HTTP status in
   * different ways, so the router does not assume a specific error class.
   *
   * On success, usage is tracked via {@link trackUsage} when the result
   * carries a `usage` field.
   */
  async completeWithFallback<T>(
    stage: Stage,
    fn: (target: FallbackTarget) => Promise<T>,
    errorExtractor: (error: unknown) => { status?: number; message: string } | null,
  ): Promise<{ result: T; attempts: FallbackTarget[] }> {
    const chain = fallbackChain(stage, this.cast, this.fallbackCasts);
    const attempts: FallbackTarget[] = [];
    let current = this.route(stage);
    attempts.push({ provider: current.provider, model: current.model });

    for (;;) {
      try {
        const target: FallbackTarget = {
          provider: current.provider,
          model: current.model,
        };
        const result = await fn(target);
        // Track usage if the result carries it.
        if (result && typeof result === "object" && "usage" in result) {
          const usage = (result as { usage?: { totalTokens?: number; cost?: { total?: number } } }).usage;
          this.trackUsage(usage ?? {});
        }
        return { result, attempts };
      } catch (err) {
        const extracted = errorExtractor(err);
        if (!extracted) throw err;
        // next() throws FallbackExhaustedError or BudgetExceededError
        current = this.next(stage, extracted);
        attempts.push({ provider: current.provider, model: current.model });
      }
    }
  }

  /**
   * Track token + cost usage from a successful call (updates the budget
   * guard). Call this after each model call completes.
   */
  trackUsage(usage: { totalTokens?: number; cost?: { total?: number } }): void {
    if (usage.totalTokens) this.tokensUsed += usage.totalTokens;
    if (usage.cost?.total) this.costUsed += usage.cost.total;
  }

  /** Current budget state (for inspection / testing). */
  get budgetState(): { tokensUsed: number; costUsed: number; maxTokens: number; maxCost: number } {
    return {
      tokensUsed: this.tokensUsed,
      costUsed: this.costUsed,
      maxTokens: this.budget.maxTokens,
      maxCost: this.budget.maxCost,
    };
  }

  /** Emit a routing event through the redacting sink (no-op if no sink). */
  private emit(event: RoutingEvent): void {
    this.sink?.(event);
  }
}

/**
 * Route a prompt end-to-end: classify the stage, then return the primary
 * model for that stage. Convenience wrapper for one-shot routing.
 */
export function shiftRoute(
  input: ShiftInput,
  options: ShiftRouterOptions,
): { stage: Stage; result: RouteResult } {
  const router = new ShiftRouter(options);
  const stage = router.classify(input);
  const result = router.route(stage);
  return { stage, result };
}