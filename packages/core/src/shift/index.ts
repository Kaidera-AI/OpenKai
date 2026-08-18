/** Shift — per-job model routing (E002 Inc 02, Switchyard pattern, Apache-2.0 port). */

export {
  classifyStage,
  DEFAULT_STAGE_CONFIG,
  type Stage,
  type StageConfig,
  type ShiftInput,
  type StageTaskClassInput,
} from "./stages.js";

export {
  ShiftRouter,
  fallbackChain,
  shiftRoute,
  type ShiftRouterOptions,
  type RouteResult,
  type FallbackTarget,
  type BudgetConfig,
  FallbackExhaustedError,
  BudgetExceededError,
} from "./router.js";

export {
  redactRoutingEvent,
  createRedactingSink,
  type RoutingEvent,
  type ActivitySink,
} from "./activity.js";

export {
  decideTier,
  windowSeverity,
  testsPassed,
  productionIntensity,
  SEVERITY,
  TIER_THRESHOLD,
  type Tier,
  type TierDecision,
  type TierDecisionSource,
  type TierInput,
  type ToolSignal,
} from "./tier.js";
