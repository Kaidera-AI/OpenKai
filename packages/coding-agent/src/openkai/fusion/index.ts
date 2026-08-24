/**
 * openkai/fusion — the F1 port on omp's base. The panel, synthesis, gate,
 * bandit, and telemetry modules are ported from the 0.84 line
 * (packages/core/src/fusion/*) with the pi-18 type map applied:
 * StreamFunction<Api> is generic, Context.systemPrompt is string[], and the
 * dropped pi-0.84 helpers (contentText, uuidv7) live in ./helpers.js.
 *
 * calibrate.ts lands with shift in F2 (it needs the shift tier types).
 */

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
export type { GateCheck, GateCheckResult, GateRun } from "./types.js";
export type { GatedFusionOptions, RunGateOptions } from "./gate.js";
export { runPanel } from "./panel.js";
export type { PanelOptions } from "./panel.js";
export { resolveSynthesiser, runSynthesis } from "./synthesis.js";
export { FusionBandit } from "./bandit.js";
export type { BanditArm, BanditRecommendation, ComplexityBucket } from "./bandit.js";
export { BUILTIN_CASTS, listCasts, resolveCast } from "./casts.js";
export type { Cast, CastConfig, CastTier } from "./casts.js";
export { DEFAULT_FUSION_POLICY, shouldFuse } from "./policy.js";
export type {
  FusionPolicyConfig,
  FusionPolicyDecision,
  FusionPolicyInput,
  FusionPriority,
  FusionTaskClass,
} from "./policy.js";
export {
  defaultFusionLogPath,
  exportFusionRunArtifact,
  readFusionRuns,
  recordFusionRun,
  summariseFusionRuns,
} from "./telemetry.js";
export type { FusionDashboard, FusionPairStats, PairStats } from "./telemetry.js";
export { contentText, newRunId } from "./helpers.js";
export type {
  FusionRole,
  RoleOutput,
  SynthesisArtifact,
  SynthesisComparison,
  SynthesisDiscard,
  SynthesisDivergence,
  SynthesisSideComparison,
} from "./types.js";
export type { FusionRunRecord } from "./types.js";
