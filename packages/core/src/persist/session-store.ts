/**
 * Local session store — pi JSONL v3 tree writer under `.openkai/sessions/`
 * (D-P2-3, scope §3).
 *
 * Each session is one JSONL file at `<root>/<sessionId>/session.jsonl`. Every
 * line is a tree entry with `{ type, id, seq, parentId, timestamp, … }` — the
 * pi-agent-core v3 entry shape ({@link MessageEntry}, {@link CustomEntry},
 * {@link CompactionEntry}). `id` is a uuidv7; `parentId` chains entries into a
 * branch so a reader can walk the conversation tree leaf→root. The store
 * appends entries as the transport settles them; OpenKai owns the directory
 * layout, the entry shapes come from the pi session format.
 *
 * P2 writes message entries + custom entries (the loop does not compact
 * yet). The compaction entry shape is supported by the format so a later
 * phase can append `retainedTail` summaries without a migration.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { uuidv7 } from "@earendil-works/pi-ai";
import type { Usage } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { redactSecrets } from "../secrets.js";

/**
 * Owner-only modes for the session tree (E001 finding F7). SECURITY.md §4 says
 * secrets never reach transcripts; a transcript every local user can read is
 * the same disclosure by another route, so the tree is 0700/0600.
 */
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

/** Common fields of every JSONL tree entry (the v3 shape). */
export interface EntryBase {
  type: string;
  id: string;
  seq: number;
  parentId: string | null;
  timestamp: number;
}

/** A conversation message entry. */
export interface MessageEntry extends EntryBase {
  type: "message";
  message: AgentMessage;
  terminate?: true;
}

/** A compaction entry carrying a summary and the retained tail. */
export interface CompactionEntry extends EntryBase {
  type: "compaction";
  summary: string;
  retainedTail: AgentMessage[];
  tokensBefore: number;
  details?: unknown;
  usage?: Usage;
}

/** A custom entry for extension/agent-owned state. */
export interface CustomEntry extends EntryBase {
  type: "custom";
  customType: string;
  data?: unknown;
}

export type Entry = MessageEntry | CompactionEntry | CustomEntry;

/** Session metadata persisted as the first line of the file (a v3 header). */
export interface SessionHeader {
  type: "header";
  version: 3;
  id: string;
  createdAt: number;
  parentSessionId?: string | null;
}

/** Options for opening or creating a session store. */
export interface SessionStoreOptions {
  /** Root directory containing per-session subdirectories (default: `.openkai/sessions`). */
  root?: string;
  /** Session id (uuidv7 by default). */
  sessionId?: string;
  /** Parent session id for branch-forking (optional). */
  parentSessionId?: string | null;
}

/** The local JSONL v3 session tree writer. */
export class SessionStore {
  readonly sessionId: string;
  readonly parentSessionId: string | null;
  readonly filePath: string;
  private readonly dirPath: string;
  private seq = 0;
  private leafId: string | null = null;
  private headerWritten = false;

  constructor(options: SessionStoreOptions = {}) {
    const root = options.root ?? defaultRoot();
    this.sessionId = options.sessionId ?? uuidv7();
    this.parentSessionId = options.parentSessionId ?? null;
    this.dirPath = path.join(root, this.sessionId);
    this.filePath = path.join(this.dirPath, "session.jsonl");
  }

  /** Ensure the session directory exists and the header line is written. */
  async ensure(): Promise<void> {
    await fs.mkdir(this.dirPath, { recursive: true, mode: DIR_MODE });
    // mkdir's mode applies only to directories it creates — chmod also narrows
    // a tree written by an older build. Best-effort: a filesystem without POSIX
    // modes must not break sessions.
    await fs.chmod(this.dirPath, DIR_MODE).catch(() => undefined);
    if (!this.headerWritten) {
      const header: SessionHeader = {
        type: "header",
        version: 3,
        id: this.sessionId,
        createdAt: Date.now(),
        parentSessionId: this.parentSessionId,
      };
      await this.appendLine(JSON.stringify(header));
      this.headerWritten = true;
    }
  }

  /**
   * Append one JSONL line: redacted, owner-readable only.
   *
   * Redaction is at the single write seam so every entry shape is covered
   * (messages, custom data, compaction summaries) — an approved `bash cat .env`
   * is the realistic path that puts a live key into a turn (E001 finding F7).
   */
  private async appendLine(line: string): Promise<void> {
    await fs.appendFile(this.filePath, redactSecrets(line) + "\n", {
      encoding: "utf-8",
      mode: FILE_MODE,
    });
    await fs.chmod(this.filePath, FILE_MODE).catch(() => undefined);
  }

  /** Append a message entry to the tree. Returns the entry id. */
  async appendMessage(message: AgentMessage, terminate?: true): Promise<string> {
    const entry = await this.appendEntry({ type: "message", message, terminate });
    return entry.id;
  }

  /** Append a custom entry for extension/agent-owned state. Returns the entry id. */
  async appendCustom(customType: string, data?: unknown): Promise<string> {
    const entry = await this.appendEntry({ type: "custom", customType, data });
    return entry.id;
  }

  /** Append a compaction entry (reserved for later phases). */
  async appendCompaction(
    summary: string,
    retainedTail: AgentMessage[],
    tokensBefore: number,
    details?: unknown,
    usage?: Usage,
  ): Promise<string> {
    const entry = await this.appendEntry({
      type: "compaction",
      summary,
      retainedTail,
      tokensBefore,
      details,
      usage,
    });
    return entry.id;
  }

  /** Low-level entry append — assigns id/seq/parentId/timestamp and persists. */
  private async appendEntry(fields: Omit<Entry, keyof EntryBase>): Promise<Entry> {
    await this.ensure();
    this.seq += 1;
    const entry = {
      ...fields,
      id: uuidv7(),
      seq: this.seq,
      parentId: this.leafId,
      timestamp: Date.now(),
    } as Entry;
    await this.appendLine(JSON.stringify(entry));
    this.leafId = entry.id;
    return entry;
  }

  /** Read all entries (skipping the header) in append order. */
  async readEntries(): Promise<Entry[]> {
    const text = await fs.readFile(this.filePath, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const entries: Entry[] = [];
    for (const line of lines) {
      const parsed = JSON.parse(line) as Entry | SessionHeader;
      if (parsed.type === "header") continue;
      entries.push(parsed as Entry);
    }
    return entries;
  }

  /** Read the session header (first line). */
  async readHeader(): Promise<SessionHeader | undefined> {
    const text = await fs.readFile(this.filePath, "utf-8");
    const firstLine = text.split("\n", 1)[0];
    if (!firstLine) return undefined;
    return JSON.parse(firstLine) as SessionHeader;
  }
}


/** List session ids (directory names) under a root, sorted. */
export async function listSessions(root?: string): Promise<string[]> {
  const dir = root ?? defaultRoot();
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

/** Read the message entries (AgentMessage) from a session file in append order. */
export async function readSessionMessages(filePath: string): Promise<AgentMessage[]> {
  const text = await fs.readFile(filePath, "utf-8");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const out: AgentMessage[] = [];
  for (const line of lines) {
    const parsed = JSON.parse(line) as Entry | SessionHeader;
    if (parsed.type === "message") out.push(parsed.message);
  }
  return out;
}

/** Default sessions root: `.openkai/sessions` relative to process.cwd(). */
export function defaultRoot(): string {
  return path.join(process.cwd(), ".openkai", "sessions");
}

/**
 * Fork a session (droid's background `/fork`): a new v3 branch whose header
 * points at the source session, seeded with the source's messages so the
 * forked context continues intact. Returns the new session's identity for
 * the paste-able resume receipt.
 */
export async function forkSession(
  source: SessionStore,
): Promise<{ sessionId: string; filePath: string }> {
  const root = path.dirname(path.dirname(source.filePath));
  const fork = new SessionStore({ root, parentSessionId: source.sessionId });
  await fork.ensure();
  const entries = await source.readEntries();
  for (const entry of entries) {
    if (entry.type === "message") await fork.appendMessage(entry.message);
  }
  return { sessionId: fork.sessionId, filePath: fork.filePath };
}

/** One row of the session tree view. */
export interface SessionTreeRow {
  sessionId: string;
  parentSessionId: string | null;
  createdAt: number;
  messages: number;
}

/** The session forest: every session under the root with its parent link. */
export async function sessionTree(root?: string): Promise<SessionTreeRow[]> {
  const base = root ?? defaultRoot();
  let dirs: string[] = [];
  try {
    dirs = (await fs.readdir(base, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
  const rows: SessionTreeRow[] = [];
  for (const id of dirs) {
    const store = new SessionStore({ root: base, sessionId: id });
    try {
      const header = await store.readHeader();
      const entries = await store.readEntries();
      rows.push({
        sessionId: id,
        parentSessionId: header?.parentSessionId ?? null,
        createdAt: header?.createdAt ?? 0,
        messages: entries.filter((e) => e.type === "message").length,
      });
    } catch {
      // unreadable session dir — skip
    }
  }
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}