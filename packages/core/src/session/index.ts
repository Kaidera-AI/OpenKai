/** OpenKai session transport surface (D-P2-4, scope §3). */
export {
  type DeltaField,
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
export { readOnlyTools } from "./tools.js";