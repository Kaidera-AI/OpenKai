/**
 * Cortex session checkpoint — debounced `POST /sessions/ingest` at turn
 * settlement + `POST /log` lifecycle events (D-P2-3, scope §3).
 *
 * The local JSONL tree is the source of truth; Cortex ingests a snapshot so
 * the memory layer can reason over the run. Checkpoints are debounced and
 * idempotent: the payload carries `session_uuid` (the OpenKai session id) and
 * `source_path` so the Cortex dedup-by-session applies. We only checkpoint at
 * turn settlement (after `turn_end`/`session_end`), never mid-stream.
 *
 * Lifecycle events (`POST /log`) mark `started`/`stopped` so the run is
 * visible on the team_events feed (`openkai events --print`).
 */

import path from "node:path";
import { execSync } from "node:child_process";
import { CortexClient, CortexApiError } from "../cortex/client.js";
import { redactSecrets } from "../secrets.js";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Entry, MessageEntry } from "./session-store.js";

/** A message in the Cortex SessionIngest payload shape. */
export interface SessionIngestMessage {
  role: string;
  content: string;
  ts?: string | null;
  metadata?: Record<string, unknown>;
}

/** The `POST /sessions/ingest` payload (matches the Cortex `SessionIngest` schema). */
export interface SessionIngestPayload {
  session_uuid: string;
  agent: string;
  task: string;
  source_path: string;
  provider: string;
  cwd: string;
  git_branch?: string;
  source_kind: string;
  metadata: Record<string, unknown>;
  messages: SessionIngestMessage[];
}

/** The `POST /log` payload (matches the Cortex `LogRequest` schema). */
export interface LogPayload {
  event_type: string;
  summary: string;
  category?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}

/** Options for the checkpoint writer. */
export interface CortexCheckpointOptions {
  client: CortexClient;
  /** Agent name for the run (e.g. "bob"). */
  agent: string;
  /** OpenKai session id (becomes `session_uuid`). */
  sessionId: string;
  /** Absolute path to the local JSONL file. */
  sourcePath: string;
  /** Provider id (e.g. "openrouter"). */
  provider: string;
  /** Model id used for the run. */
  modelId: string;
  /** Working directory of the run. */
  cwd: string;
  /** Task/prompt description. */
  task: string;
  /** Debounce window in ms (default 1500). */
  debounceMs?: number;
}

/**
 * Extract text content from an AgentMessage for the ingest payload.
 *
 * Redacted here, at the seam where content is lifted onto the wire (E001
 * finding F7b). The file seam in `SessionStore` does NOT cover this path:
 * `record()` takes an `Entry[]` from any source, and both call sites feed it
 * `readEntries()` only by convention — the obvious "why re-read the file every
 * turn?" refactor would silently ship `.env` material into shared team memory,
 * which SECURITY.md §4 names first ("never in Cortex memory").
 */
function messageContent(message: AgentMessage): string {
  if (!("content" in message)) return "";
  const content = message.content;
  if (typeof content === "string") return redactSecrets(content);
  if (Array.isArray(content)) {
    return redactSecrets(
      content
        .filter(
          (part): part is { type: "text"; text: string } =>
            typeof part === "object" && part !== null && "type" in part && part.type === "text",
        )
        .map((part) => part.text)
        .join(""),
    );
  }
  return "";
}

/** Map a role to the Cortex role vocabulary. */
function mapRole(role: string): string {
  switch (role) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "toolResult":
      return "tool";
    default:
      return role;
  }
}

/** Best-effort git branch detection (empty string if not a git repo). */
function detectGitBranch(cwd: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * Debounced, idempotent Cortex session checkpoint writer. Collects settled
 * entries and flushes them to `POST /sessions/ingest` after a debounce window
 * at turn settlement.
 */
export class CortexCheckpoint {
  private readonly options: CortexCheckpointOptions;
  private pendingEntries: Entry[] = [];
  private pendingMessages: SessionIngestMessage[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastFlushHash = "";

  constructor(options: CortexCheckpointOptions) {
    this.options = options;
  }

  /** Record settled entries (called by the transport loop after a turn ends). */
  record(entries: Entry[]): void {
    const messages = entries
      .filter((e): e is MessageEntry => e.type === "message")
      .map((e) => ({
        role: mapRole(e.message.role),
        content: messageContent(e.message),
        ts: new Date(e.timestamp).toISOString(),
        metadata: { seq: e.seq, entryId: e.id, parentId: e.parentId },
      }));
    this.pendingEntries.push(...entries);
    this.pendingMessages.push(...messages);
    this.schedule();
  }

  /** Emit a lifecycle `POST /log` event (started/stopped). */
  async logLifecycle(eventType: "started" | "stopped", summary: string): Promise<void> {
    const payload: LogPayload = {
      event_type: eventType,
      summary,
      category: "agent_lifecycle",
      
      metadata: {
        session_uuid: this.options.sessionId,
        agent: this.options.agent,
        provider: this.options.provider,
        model: this.options.modelId,
        source_path: this.options.sourcePath,
      },
    };
    try {
      await this.options.client.postJson("/log", payload, { agent: this.options.agent });
    } catch (error) {
      // Lifecycle events are best-effort: never fail the run over them.
      console.error(
        `[openkai] POST /log ${eventType} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** Flush the checkpoint now (debounce-bypass). */
  async flushNow(): Promise<SessionIngestResult | undefined> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingMessages.length === 0) return undefined;

    const messages = this.pendingMessages.splice(0);
    this.pendingEntries = [];

    const payload: SessionIngestPayload = {
      session_uuid: this.options.sessionId,
      agent: this.options.agent,
      // The task is the operator's prompt — a paste carries a key just like
      // model text does, same parity argument as the `/btw` header (F6c).
      task: redactSecrets(this.options.task),
      source_path: this.options.sourcePath,
      provider: this.options.provider,
      cwd: this.options.cwd,
      git_branch: detectGitBranch(this.options.cwd),
      source_kind: "openkai",
      metadata: {
        source: "openkai",
        writer_agent: this.options.agent,
        project: this.options.client.project,
        provider: this.options.provider,
        model: this.options.modelId,
        messages_parsed: messages.length,
      },
      messages,
    };

    // Idempotency: skip if the payload hash is unchanged since the last flush.
    const hash = JSON.stringify({
      uuid: payload.session_uuid,
      count: messages.length,
      lastTs: messages.at(-1)?.ts,
    });
    if (hash === this.lastFlushHash) return undefined;
    this.lastFlushHash = hash;

    try {
      const result = await this.options.client.postJson<SessionIngestResult>(
        "/sessions/ingest",
        payload,
        { agent: this.options.agent },
      );
      return result;
    } catch (error) {
      if (error instanceof CortexApiError && error.status === 409) {
        // Already ingested — idempotent no-op.
        return undefined;
      }
      console.error(
        `[openkai] POST /sessions/ingest failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  /** Schedule a debounced flush. */
  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    const delay = this.options.debounceMs ?? 1500;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flushNow();
    }, delay);
  }
}

/** The `POST /sessions/ingest` response shape. */
export interface SessionIngestResult {
  messages_inserted?: number;
  [key: string]: unknown;
}

/** Build the absolute source path for a session JSONL file. */
export function sessionSourcePath(root: string, sessionId: string): string {
  return path.resolve(root, sessionId, "session.jsonl");
}