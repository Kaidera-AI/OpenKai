export { complete } from "./complete.js";
export type { CompletionRequest, CompletionResult } from "./complete.js";
export { fuse } from "./fuse.js";
export type { FuseOptions, FuseResult } from "./fuse.js";
export {
  designGate,
  gateListing,
  parseGateDesign,
  runGate,
  runGatedFusion,
  verbatimFailures,
} from "./gate.js";
export type { GatedFusionOptions, RunGateOptions } from "./gate.js";
export { runPanel } from "./panel.js";
export type { PanelOptions } from "./panel.js";
export { FusionBandit, loadBandit, xorshift32 } from "./bandit.js";
export type {
  BanditArm,
  BanditRecommendation,
  ComplexityBucket,
} from "./bandit.js";
export { BUILTIN_CASTS, listCasts, resolveCast } from "./casts.js";
export type { Cast, CastConfig, CastTier } from "./casts.js";
export {
  DEFAULT_FUSION_POLICY,
  shouldFuse,
} from "./policy.js";
export type {
  FusionPolicyConfig,
  FusionPolicyDecision,
  FusionPolicyInput,
  FusionPriority,
  FusionTaskClass,
} from "./policy.js";
export { runSynthesis } from "./synthesis.js";
export {
  defaultFusionLogPath,
  exportFusionRunArtifact,
  readFusionRuns,
  recordFusionRun,
  summariseFusionRuns,
} from "./telemetry.js";
export type { FusionPairStats } from "./telemetry.js";
export {
  AttributionError,
  GateHaltError,
  UnwinnableGateError,
  WeakGateError,
} from "./types.js";
export type {
  FusionRole,
  FusionRunRecord,
  GateCheck,
  GateCheckResult,
  GateRun,
  RoleOutput,
  SynthesisArtifact,
  SynthesisDiscard,
  SynthesisDivergence,
} from "./types.js";
