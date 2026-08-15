/** OpenKai session transport surface (D-P2-4, scope §3 + P4b §2). */
export {
  type DeltaField,
  type PermissionPreview,
  type SessionEvent,
  type SessionTransport,
  type SessionTransportOptions,
  type UsageSnapshot,
  toUsageSnapshot,
} from "./transport.js";
export { mapAgentEvent } from "./events.js";
export {
  DEFAULT_MODEL_ID,
  InProcessTransport,
  type InProcessTransportOptions,
  MissingApiKeyError,
} from "./local-transport.js";
export { readOnlyTools, gatedTools } from "./tools.js";
export {
  type PermissionDecision,
  type PermissionRule,
  DEFAULT_RULES,
  evaluate,
  evaluateWithReason,
} from "./permissions.js";
export {
  type PermissionGate,
  type PermissionOutcome,
  type PushPermissionEvent,
  SessionPermissionGate,
  buildDiffPreview,
  readForPreview,
  resolvePreviewPath,
  truncateDiff,
} from "./permission-gate.js";
