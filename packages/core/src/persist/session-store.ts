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
 *
 * Rehydration: opening a store over an existing `session.jsonl` resumes it —
 * the header is validated (`version === 3`, else {@link SessionFormatError})
 * and `seq`/`leafId` continue from the tail, so a restarted TUI appends to
 * the same tree instead of writing a second header (ren review). Readers
 * skip unparseable lines so a truncated tail (crash mid-append) cannot brick
 * the session.
 *
 * Concurrency: `ensure()` takes a best-effort advisory lockfile
 * (`<dir>/.lock`, O_EXCL, pid+timestamp). A live pid holding the lock
 * refuses the open ({@link SessionLockError}); a dead pid's stale lock is
 * reclaimed. Released by {@link SessionStore.close}; a process killed
 * without closing leaves a stale lock the next open reclaims. Advisory only
 * — it coordinates OpenKai processes, it is not a security boundary.
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

/** The session file exists but is not a v3 tree (bad header or version). */
export class SessionFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionFormatError";
  }
}

/** Another live OpenKai process holds the session's advisory lock. */
export class SessionLockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionLockError";
  }
}

/** The local JSONL v3 session tree writer. */
export class SessionStore {
  readonly sessionId: string;
  readonly parentSessionId: string | null;
  readonly filePath: string;
  private readonly dirPath: string;
  private readonly lockPath: string;
  private seq = 0;
  private leafId: string | null = null;
  private headerWritten = false;
  private lockHeld = false;

  constructor(options: SessionStoreOptions = {}) {
    const root = options.root ?? defaultRoot();
    this.sessionId = options.sessionId ?? uuidv7();
    this.parentSessionId = options.parentSessionId ?? null;
    this.dirPath = path.join(root, this.sessionId);
    this.filePath = path.join(this.dirPath, "session.jsonl");
    this.lockPath = path.join(this.dirPath, ".lock");
  }

  /**
   * Ensure the session directory exists, take the advisory lock, and either
   * rehydrate from an existing tree or write the header for a new one.
   */
  async ensure(): Promise<void> {
    await fs.mkdir(this.dirPath, { recursive: true, mode: DIR_MODE });
    // mkdir's mode applies only to directories it creates — chmod also narrows
    // a tree written by an older build. Best-effort: a filesystem without POSIX
    // modes must not break sessions.
    await fs.chmod(this.dirPath, DIR_MODE).catch(() => undefined);
    await this.acquireLock();
    if (!this.headerWritten) {
      const existing = await this.readLinesOrUndefined();
      if (existing !== undefined) {
        this.rehydrate(existing);
      } else {
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
  }

  /** Release the advisory lock (best-effort; safe to call more than once). */
  async close(): Promise<void> {
    if (!this.lockHeld) return;
    this.lockHeld = false;
    await fs.rm(this.lockPath, { force: true }).catch(() => undefined);
  }

  /**
   * Take the advisory lockfile. A live pid holding it refuses the open; a
   * dead pid's stale lock is reclaimed (O_EXCL create + kill(pid, 0) probe).
   */
  private async acquireLock(): Promise<void> {
    if (this.lockHeld) return;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const handle = await fs.open(this.lockPath, "wx");
        await handle.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
        await handle.close();
        this.lockHeld = true;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const holder = await this.lockHolderPid();
        if (holder !== undefined && pidAlive(holder)) {
          // Any live holder refuses the open — including our own pid: two
          // live SessionStore instances on one tree would interleave appends
          // exactly like two processes would.
          throw new SessionLockError(
            `session ${this.sessionId} is locked by live pid ${holder} (${this.lockPath})`,
          );
        }
        // Stale lock (dead pid / unreadable contents): reclaim and retry once.
        await fs.rm(this.lockPath, { force: true }).catch(() => undefined);
      }
    }
    throw new SessionLockError(`session ${this.sessionId} lock could not be acquired (${this.lockPath})`);
  }

  /** Parse the pid out of an existing lockfile (undefined if unreadable). */
  private async lockHolderPid(): Promise<number | undefined> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.lockPath, "utf-8")) as { pid?: unknown };
      return typeof parsed.pid === "number" ? parsed.pid : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Resume an existing tree: validate the header and continue seq/leafId from
   * the tail. Unparseable lines are skipped (truncated tail tolerance), so a
   * crash mid-append loses at most the partial line.
   */
  private rehydrate(lines: string[]): void {
    const first = lines[0];
    if (!first) {
      throw new SessionFormatError(`session file ${this.filePath} is empty — no v3 header`);
    }
    let header: SessionHeader;
    try {
      header = JSON.parse(first) as SessionHeader;
    } catch {
      throw new SessionFormatError(`session file ${this.filePath} has an unparseable header`);
    }
    if (header.type !== "header" || header.version !== 3) {
      throw new SessionFormatError(
        `session file ${this.filePath} is not a v3 tree (header.version=${String(header.version)})`,
      );
    }
    for (const line of lines.slice(1)) {
      let entry: Entry;
      try {
        entry = JSON.parse(line) as Entry;
      } catch {
        continue; // tolerate a truncated tail
      }
      if (typeof entry.seq === "number" && entry.seq > this.seq) this.seq = entry.seq;
      if (typeof entry.id === "string") this.leafId = entry.id;
    }
    this.headerWritten = true;
  }

  /** All non-empty lines of the session file, or undefined when absent. */
  private async readLinesOrUndefined(): Promise<string[] | undefined> {
    let text: string;
    try {
      text = await fs.readFile(this.filePath, "utf-8");
    } catch {
      return undefined;
    }
    return text.split("\n").filter((l) => l.trim().length > 0);
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

  /** Read all entries (skipping the header) in append order. Bad lines are skipped. */
  async readEntries(): Promise<Entry[]> {
    const text = await fs.readFile(this.filePath, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const entries: Entry[] = [];
    for (const line of lines) {
      let parsed: Entry | SessionHeader;
      try {
        parsed = JSON.parse(line) as Entry | SessionHeader;
      } catch {
        continue; // tolerate a truncated tail — one bad line must not brick the session
      }
      if (parsed.type === "header") continue;
      entries.push(parsed as Entry);
    }
    return entries;
  }

  /** Read the session header (first line); undefined if missing/unparseable. */
  async readHeader(): Promise<SessionHeader | undefined> {
    const text = await fs.readFile(this.filePath, "utf-8");
    const firstLine = text.split("\n", 1)[0];
    if (!firstLine) return undefined;
    try {
      return JSON.parse(firstLine) as SessionHeader;
    } catch {
      return undefined;
    }
  }

  /**
   * Every user message in the tree, oldest first, with its entry id (E017
   * contract #2 — the fork picker's rows). Text is the message's joined text
   * parts, single-line-normalised for picker display.
   */
  async listUserMessages(): Promise<Array<{ entryId: string; text: string; timestamp: number }>> {
    const entries = await this.readEntries();
    const out: Array<{ entryId: string; text: string; timestamp: number }> = [];
    for (const entry of entries) {
      if (entry.type !== "message") continue;
      const message = entry.message;
      if (message === null || typeof message !== "object" || !("role" in message) || message.role !== "user") continue;
      const content = (message as { content?: unknown }).content;
      let text = "";
      if (typeof content === "string") {
        text = content;
      } else if (Array.isArray(content)) {
        const parts: string[] = [];
        for (const part of content as unknown[]) {
          if (part !== null && typeof part === "object" && "type" in part && part.type === "text" && "text" in part && typeof part.text === "string") {
            parts.push(part.text);
          }
        }
        text = parts.join("\n");
      }
      out.push({ entryId: entry.id, text: text.replace(/\s+/g, " ").trim(), timestamp: entry.timestamp });
    }
    return out;
  }

  /**
   * Fork at a past entry (E017 contract #2 — rewind-to-point): copy the
   * root→`entryId` path into a NEW session with a fresh id whose header's
   * `parentSessionId` names this session. Entry ids are re-minted and
   * parentIds re-anchored along the copy so the fork is a self-contained
   * linear tree. Returns the new store (locked open; caller closes).
   * Throws when `entryId` names no entry in this tree.
   */
  async forkAtEntry(entryId: string): Promise<SessionStore> {
    const entries = await this.readEntries();
    const byId = new Map<string, Entry>();
    for (const entry of entries) byId.set(entry.id, entry);
    // Walk leaf→root from the target, then reverse into root→target order.
    const pathEntries: Entry[] = [];
    let cursor: string | null = entryId;
    while (cursor !== null) {
      const entry = byId.get(cursor);
      if (entry === undefined) {
        throw new SessionFormatError(
          `fork point ${cursor} is not an entry of session ${this.sessionId}`,
        );
      }
      pathEntries.push(entry);
      cursor = entry.parentId;
    }
    pathEntries.reverse();

    const root = path.dirname(this.dirPath);
    const fork = new SessionStore({ root, parentSessionId: this.sessionId });
    await fork.ensure();
    // Appending in path order re-anchors each entry's parentId onto the
    // fork's own chain (appendEntry chains to the fork's leafId).
    for (const entry of pathEntries) {
      if (entry.type === "message") {
        await fork.appendMessage(entry.message, entry.terminate);
      } else if (entry.type === "compaction") {
        await fork.appendCompaction(entry.summary, entry.retainedTail, entry.tokensBefore, entry.details, entry.usage);
      } else {
        await fork.appendCustom(entry.customType, entry.data);
      }
    }
    return fork;
  }
}

/** kill(pid, 0) liveness probe: ESRCH = dead, EPERM = alive but not ours. */
function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
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
    let parsed: Entry | SessionHeader;
    try {
      parsed = JSON.parse(line) as Entry | SessionHeader;
    } catch {
      continue; // tolerate a truncated tail
    }
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