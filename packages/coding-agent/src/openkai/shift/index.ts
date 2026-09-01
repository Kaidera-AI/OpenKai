/** Shift — per-job model routing (E002 Inc 02, Switchyard pattern, Apache-2.0 port). */

// The orchestration facade (E017 Inc 02, OK-9.3) — re-exported through the
// shift barrel so consumers keep one import surface.
export {
	Orchestrator,
	type OrchestratorOptions,
	type ShiftPins,
	type ShiftPosture,
} from "../orchestrate.js";
export {
	type ActivitySink,
	createRedactingSink,
	type RoutingEvent,
	redactRoutingEvent,
} from "./activity.js";
export {
	type BudgetConfig,
	BudgetExceededError,
	FallbackExhaustedError,
	type FallbackTarget,
	fallbackChain,
	type RouteResult,
	routeWithTier,
	ShiftRouter,
	type ShiftRouterOptions,
	shiftRoute,
	type TierRouteResult,
} from "./router.js";
export {
	classifyStage,
	DEFAULT_STAGE_CONFIG,
	type ShiftInput,
	type Stage,
	type StageConfig,
	type StageTaskClassInput,
} from "./stages.js";
export {
	decideTier,
	filterByModality,
	isVisionCapable,
	type ModelModality,
	productionIntensity,
	SEVERITY,
	supportsModalities,
	TIER_THRESHOLD,
	type Tier,
	type TierDecision,
	type TierDecisionSource,
	type TierInput,
	type ToolSignal,
	testsPassed,
	windowSeverity,
} from "./tier.js";
