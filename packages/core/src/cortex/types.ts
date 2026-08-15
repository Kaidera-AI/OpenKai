/** Cortex memory — shared types for the OpenKai client surface. */

/**
 * Fields of one `team_events` row as framed by the `GET /events` bridge
 * (`team_event_stream_entry` in kaidera-os `.agents/api/main.py`).
 * Additive server-side fields survive via the index signature.
 */
export interface TeamEventFields {
  type: string;
  agent: string;
  summary: string;
  project: string;
  ts: string;
  detail?: unknown;
  files?: string;
  sprint_id?: string;
  related_decision_id?: string;
  [key: string]: unknown;
}

/**
 * One streamed `team_events` row. The id is an ascending bigint carried as a
 * string: no precision loss past `Number.MAX_SAFE_INTEGER`, and it can be
 * handed straight back to the server as `last_id`.
 */
export interface TeamEventEntry {
  id: string;
  fields: TeamEventFields;
}

/** Raw SSE wire frame after parsing. Exactly one variant per dispatch. */
export type SseFrame =
  | { kind: "frame"; event: string | null; id: string | null; data: string }
  | { kind: "comment"; comment: string };

/**
 * Items yielded by {@link CortexClient.streamEvents}. Mirrors the OK-3 SSE
 * hygiene contract: a connected signal, event frames, keep-alive ticks,
 * in-band server errors, and reconnect notices.
 */
export type CortexStreamItem =
  /**
   * Response head validated (200 + text/event-stream). OK-3's
   * connected-first-frame: this server does not emit `server.connected`,
   * so the client synthesises the signal from the validated head.
   */
  | { kind: "connected"; cursor: string }
  /** One project-scoped `team_events` row. */
  | { kind: "event"; entry: TeamEventEntry }
  /** `: ping` keep-alive comment. Proof of life on an idle stream. */
  | { kind: "ping"; comment: string }
  /**
   * In-band `event: error` frame — a transient server-side read error.
   * The server keeps the stream open; delivery continues after it.
   */
  | { kind: "stream-error"; message: string }
  /**
   * Transport failure or unexpected EOF; the stream reconnects after
   * `delayMs` with cursor resume (`last_id` + `Last-Event-ID`).
   */
  | { kind: "retrying"; attempt: number; delayMs: number; reason: string };

/** `GET /health` response (subset). */
export interface CortexHealth {
  status: string;
  postgres?: string;
  event_store?: string;
  event_backend?: string;
  event_bus?: string;
  pg_notification_queue_usage?: number;
  version?: string;
  schema_version?: string;
  [key: string]: unknown;
}

/** `GET /projects/<key>` response (subset). */
export interface CortexProject {
  project_key: string;
  project_id?: string;
  display_name?: string;
  default_agent?: string;
  repo_root?: string;
  status?: string;
  [key: string]: unknown;
}

export interface CortexClientOptions {
  /**
   * API base URL. Defaults to `process.env.CORTEX_API_URL`, then
   * `http://localhost:8501` (matches `.agents/scripts/_cortex_env.sh`).
   */
  baseUrl?: string;
  /** Project scope; sent as `X-Project` on every call. Required. */
  project: string;
  /** Agent identity; sent as `X-Agent-Name` when present. */
  agent?: string;
  /** Fetch implementation (injectable for tests). */
  fetch?: typeof fetch;
}

export interface StreamEventsOptions {
  /**
   * Resume cursor (`team_events` id, bigint as string). Omitted/empty starts
   * at the project head — the server emits only events newer than connect
   * time. Legacy redis-style ids (containing `-`) get the same head start.
   */
  lastId?: string;
  /** Events fetched per server read, 1–200. Default 50. */
  count?: number;
  /** Server keep-alive cadence hint, 1–60s. Default 15. */
  pingSeconds?: number;
  /** Cancellation. Aborting ends the stream promptly and silently. */
  signal?: AbortSignal;
  /**
   * Reconnect attempts before the stream throws. Default `Infinity` —
   * an observer attaches and stays attached.
   */
  maxRetries?: number;
  /** First reconnect delay. Default 1000ms (OK-3). */
  initialBackoffMs?: number;
  /** Backoff cap. Default 30000ms (OK-3). */
  maxBackoffMs?: number;
}
