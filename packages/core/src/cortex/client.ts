/**
 * Cortex HTTP client — the only OpenKai↔KOS coupling (ADR §4).
 *
 * Talks to the Cortex API (`cortex-api:8501` locally) with the same surface
 * the agent CLIs use: `X-Project` scoping header, optional `X-Agent-Name`.
 * Per the Cortex access rule this client is the whole contract — OpenKai
 * never touches Postgres/Redis/workers directly.
 */

import { parseSse } from "./sse.js";
import type {
  CortexClientOptions,
  CortexHealth,
  CortexProject,
  CortexStreamItem,
  StreamEventsOptions,
  TeamEventFields,
} from "./types.js";

/** Default local Cortex API origin (matches `.agents/scripts/_cortex_env.sh`). */
export const DEFAULT_CORTEX_API_URL = "http://localhost:8501";

/** Non-2xx response from the Cortex API. `body` carries the server's detail. */
export class CortexApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "CortexApiError";
    this.status = status;
    this.body = body;
  }
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  if (signal?.aborted) {
    reject(new Error("aborted"));
    return promise;
  }
  const onAbort = (): void => {
    clearTimeout(timer);
    reject(new Error("aborted"));
  };
  const timer = setTimeout(() => {
    signal?.removeEventListener("abort", onAbort);
    resolve();
  }, ms);
  signal?.addEventListener("abort", onAbort, { once: true });
  return promise;
};

export class CortexClient {
  /** Normalised base URL (no trailing slash). */
  readonly baseUrl: string;
  /** Project scope for every request. */
  readonly project: string;
  private readonly agent: string | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CortexClientOptions) {
    if (!options.project) {
      throw new Error("CortexClient: `project` is required");
    }
    this.baseUrl = (
      options.baseUrl ??
      process.env.CORTEX_API_URL ??
      DEFAULT_CORTEX_API_URL
    ).replace(/\/+$/, "");
    this.project = options.project;
    this.agent = options.agent;
    this.fetchImpl = options.fetch ?? fetch;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
      "X-Project": this.project,
      ...extra,
    };
    if (this.agent) headers["X-Agent-Name"] = this.agent;
    return headers;
  }

  private async getJson<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: this.headers(),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new CortexApiError(
        `GET ${path} failed with HTTP ${response.status}`,
        response.status,
        text,
      );
    }
    return JSON.parse(text) as T;
  }

  /**
   * `POST` a JSON payload to a Cortex path. Returns the parsed JSON response
   * (or `undefined` for an empty body). Used by the session-checkpoint and
   * lifecycle-event writers (P2+).
   */
  async postJson<T>(
    path: string,
    payload: unknown,
    options: { agent?: string } = {},
  ): Promise<T> {
    const headers = this.headers({ "Content-Type": "application/json" });
    if (options.agent) headers["X-Agent-Name"] = options.agent;
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new CortexApiError(
        `POST ${path} failed with HTTP ${response.status}`,
        response.status,
        text,
      );
    }
    if (!text.trim()) return undefined as T;
    return JSON.parse(text) as T;
  }

  /** `GET /health` — liveness + backend configuration of this Cortex API. */
  health(): Promise<CortexHealth> {
    return this.getJson<CortexHealth>("/health");
  }

  /** `GET /projects/<key>` — registry record for a project (default: ours). */
  getProject(key: string = this.project): Promise<CortexProject> {
    return this.getJson<CortexProject>(`/projects/${encodeURIComponent(key)}`);
  }

  /**
   * `GET /events` — live SSE bridge over the project's `team_events`.
   *
   * Hygiene (OK-3 / handoff contract):
   *  - resume: last delivered id is re-sent as `last_id` (and `Last-Event-ID`)
   *    on every reconnect, so nothing is delivered twice or skipped;
   *  - keep-alives: `: ping` comments surface as `ping` items rather than
   *    being mistaken for events;
   *  - in-band errors: `event: error` frames surface as `stream-error`
   *    items and do NOT tear the stream down (the server keeps it open);
   *  - reconnect: transport failures and unexpected EOFs reconnect with
   *    exponential backoff starting at 1s, doubling to a 30s cap, reset on
   *    every successful connect;
   *  - ids are ascending bigints carried as strings (no precision loss).
   *
   * The generator runs until aborted or `maxRetries` is exceeded (then it
   * throws the last error).
   */
  async *streamEvents(
    options: StreamEventsOptions = {},
  ): AsyncGenerator<CortexStreamItem> {
    const {
      count = 50,
      pingSeconds = 15,
      signal,
      maxRetries = Number.POSITIVE_INFINITY,
      initialBackoffMs = 1000,
      maxBackoffMs = 30000,
    } = options;

    let cursor = options.lastId ?? "";
    let attempt = 0;
    let delayMs = initialBackoffMs;

    while (!signal?.aborted) {
      try {
        const params = new URLSearchParams({
          count: String(count),
          ping_seconds: String(pingSeconds),
        });
        if (cursor) params.set("last_id", cursor);

        const response = await this.fetchImpl(
          `${this.baseUrl}/events?${params.toString()}`,
          {
            headers: this.headers({
              Accept: "text/event-stream",
              ...(cursor ? { "Last-Event-ID": cursor } : {}),
            }),
            signal,
          },
        );

        if (!response.ok) {
          const body = await response.text();
          throw new CortexApiError(
            `GET /events failed with HTTP ${response.status}`,
            response.status,
            body,
          );
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("text/event-stream")) {
          throw new Error(
            `GET /events returned unexpected content-type "${contentType}"`,
          );
        }
        if (!response.body) {
          throw new Error("GET /events returned an empty body");
        }

        yield { kind: "connected", cursor };
        attempt = 0;
        delayMs = initialBackoffMs;

        for await (const frame of parseSse(response.body, signal)) {
          if (frame.kind === "comment") {
            yield { kind: "ping", comment: frame.comment };
            continue;
          }
          if (frame.event === "error") {
            yield { kind: "stream-error", message: frame.data };
            continue;
          }

          const parsed = JSON.parse(frame.data) as {
            id?: unknown;
            fields?: TeamEventFields;
          };
          const id = typeof parsed.id === "string" ? parsed.id : (frame.id ?? "");
          if (!id || !parsed.fields) continue; // uncursorable/malformed row
          cursor = id;

          yield { kind: "event", entry: { id, fields: parsed.fields } };
        }

        // Clean EOF: the server should hold the stream open forever, so
        // treat this exactly like a transport failure.
        throw new Error("GET /events stream ended unexpectedly");
      } catch (error) {
        if (signal?.aborted) return;
        const failure =
          error instanceof Error ? error : new Error(String(error));
        // 4xx is a configuration error (unknown project, bad params):
        // retrying cannot fix it, so fail fast instead of looping.
        if (
          failure instanceof CortexApiError &&
          failure.status >= 400 &&
          failure.status < 500
        ) {
          throw failure;
        }
        attempt += 1;
        if (attempt > maxRetries) throw failure;
        yield {
          kind: "retrying",
          attempt,
          delayMs,
          reason: failure.message,
        };
        await sleep(delayMs, signal).catch(() => undefined);
        delayMs = Math.min(delayMs * 2, maxBackoffMs);
      }
    }
  }
}