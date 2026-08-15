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
export { runSynthesis } from "./synthesis.js";
export {
  defaultFusionLogPath,
  readFusionRuns,
  recordFusionRun,
} from "./telemetry.js";
export {
  AttributionError,
  GateHaltError,
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
