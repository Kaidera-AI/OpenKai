/**
 * Session search query language + `/resume` picker (E017 dossier pick 5).
 *
 * A near-verbatim port of pi's `session-selector-search.ts`: fuzzy per-token
 * matching, `"quoted phrases"`, and `re:` regex, with relevance scoring and
 * a recency tie-break. The only adaptation is the row shape — ours is a
 * plain {@link SessionSearchRow} (pi's `SessionInfo` carries Date objects
 * and a name filter we don't need yet).
 *
 * Consumers: the `/resume` picker overlay (below), and the
 * `openkai sessions --search <query>` CLI (sessions.ts) — one module, both
 * surfaces, identical semantics.
 *
 * `fuzzyMatch` comes from our vendored pi-tui (already a dependency — the
 * same import models-hub.ts uses). No new dependency.
 */

import { SelectList, fuzzyMatch } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { SessionStore } from "@kaidera/openkai-core";
import type { Entry } from "@kaidera/openkai-core";
import { highlight, opaquePanel, paletteSelectTheme, renderOverlayFooter, text as textToken } from "./theme.js";
import { relativeTime } from "./history-search.js";
import { sanitizeTerminalText } from "./sanitize.js";

/** One searchable session row (the TUI + CLI listing shape). */
export interface SessionSearchRow {
  id: string;
  /** Display name from the `session_name` custom entry (/name), if any. */
  name?: string;
  firstUserMessage: string;
  /** All message text, joined — built lazily by the caller when listing is cheap. */
  allMessagesText: string;
  cwd: string;
  /** Last-modified epoch ms (file mtime; falls back to header createdAt). */
  modified: number;
  messageCount: number;
  /** Fork parent (header link), when this session branched off another. */
  parentSessionId?: string | null;
}

export type SortMode = "recent" | "relevance";

export type NameFilter = "all" | "named";

export interface ParsedSearchQuery {
  mode: "tokens" | "regex";
  tokens: { kind: "fuzzy" | "phrase"; value: string }[];
  regex: RegExp | null;
  /** If set, parsing failed and we should treat the query as non-matching. */
  error?: string;
}

export interface MatchResult {
  matches: boolean;
  /** Lower is better; only meaningful when matches === true. */
  score: number;
}

function normalizeWhitespaceLower(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function getSessionSearchText(session: SessionSearchRow): string {
  return `${session.id} ${session.name ?? ""} ${session.firstUserMessage} ${session.allMessagesText} ${session.cwd}`;
}

export function hasSessionName(session: SessionSearchRow): boolean {
  return Boolean(session.name?.trim());
}

/**
 * The session's display name (the `/name` command's `session_name` custom
 * entry — pi's setSessionName appends a session_info entry; ours is the
 * append-only analogue). Last write wins; undefined when never named.
 */
export function sessionNameFromEntries(entries: readonly Entry[]): string | undefined {
  let name: string | undefined;
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== "session_name") continue;
    const data = entry.data;
    if (typeof data === "object" && data !== null && "name" in data && typeof data.name === "string" && data.name.trim().length > 0) {
      name = data.name.trim();
    }
  }
  return name;
}

/** Flatten one message's content to plain text (for the search corpus). */
function entryText(message: { role?: string; content?: unknown }): string {
  const content = "content" in message ? message.content : undefined;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: unknown[] = content;
  const texts: string[] = [];
  for (const part of parts) {
    if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") {
      texts.push(part.text);
    }
  }
  return texts.join(" ");
}

/**
 * Read every session under `root` into searchable rows (shared by the
 * `/resume` picker and `openkai sessions --search`). `withText` controls
 * whether the full message corpus is joined (the search needs it; a plain
 * listing doesn't). Unreadable sessions are skipped — one corrupt tree must
 * not break the picker. Rows come back newest-first (file mtime).
 */
export async function readSessionSearchRows(root: string, options?: { withText?: boolean }): Promise<SessionSearchRow[]> {
  const withText = options?.withText ?? true;
  let dirs: string[];
  try {
    dirs = (await fsp.readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const rows: SessionSearchRow[] = [];
  for (const id of dirs) {
    try {
      const store = new SessionStore({ root, sessionId: id });
      const entries = await store.readEntries();
      const header = await store.readHeader();
      const messages = entries.filter((e) => e.type === "message");
      const firstUser = messages.find((e) => e.type === "message" && "role" in e.message && e.message.role === "user");
      const stat = await fsp.stat(store.filePath).catch(() => undefined);
      rows.push({
        id,
        name: sessionNameFromEntries(entries),
        firstUserMessage: firstUser && firstUser.type === "message" ? entryText(firstUser.message).slice(0, 120) : "",
        allMessagesText: withText
          ? messages.map((e) => (e.type === "message" ? entryText(e.message) : "")).join(" ").slice(0, 200_000)
          : "",
        cwd: path.resolve(root, "..", ".."), // <cwd>/.openkai/sessions → the project root
        modified: stat?.mtimeMs ?? 0,
        messageCount: messages.length,
        parentSessionId: header?.parentSessionId ?? null,
      });
    } catch {
      // unreadable session dir — skip it
    }
  }
  return rows.sort((a, b) => b.modified - a.modified);
}

/**
 * Parse a search query (near-verbatim pi port).
 *
 * Token mode with quote support:  foo "node cve" bar
 * → tokens: [{kind:"fuzzy",value:"foo"},{kind:"phrase",value:"node cve"},…]
 * Unbalanced quotes degrade gracefully to plain whitespace tokenisation.
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const trimmed = query.trim();
  if (!trimmed) {
    return { mode: "tokens", tokens: [], regex: null };
  }

  // Regex mode: re:<pattern>
  if (trimmed.startsWith("re:")) {
    const pattern = trimmed.slice(3).trim();
    if (!pattern) {
      return { mode: "regex", tokens: [], regex: null, error: "Empty regex" };
    }
    try {
      return { mode: "regex", tokens: [], regex: new RegExp(pattern, "i") };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { mode: "regex", tokens: [], regex: null, error: msg };
    }
  }

  // Token mode with quote support.
  const tokens: { kind: "fuzzy" | "phrase"; value: string }[] = [];
  let buf = "";
  let inQuote = false;
  let hadUnclosedQuote = false;

  const flush = (kind: "fuzzy" | "phrase"): void => {
    const v = buf.trim();
    buf = "";
    if (!v) return;
    tokens.push({ kind, value: v });
  };

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ch === '"') {
      if (inQuote) {
        flush("phrase");
        inQuote = false;
      } else {
        flush("fuzzy");
        inQuote = true;
      }
      continue;
    }

    if (!inQuote && /\s/.test(ch)) {
      flush("fuzzy");
      continue;
    }

    buf += ch;
  }

  if (inQuote) {
    hadUnclosedQuote = true;
  }

  // If quotes were unbalanced, fall back to plain whitespace tokenisation.
  if (hadUnclosedQuote) {
    return {
      mode: "tokens",
      tokens: trimmed
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
        .map((t) => ({ kind: "fuzzy" as const, value: t })),
      regex: null,
    };
  }

  flush(inQuote ? "phrase" : "fuzzy");

  return { mode: "tokens", tokens, regex: null };
}

/** Score one session against a parsed query (near-verbatim pi port). */
export function matchSession(session: SessionSearchRow, parsed: ParsedSearchQuery): MatchResult {
  const text = getSessionSearchText(session);

  if (parsed.mode === "regex") {
    if (!parsed.regex) {
      return { matches: false, score: 0 };
    }
    const idx = text.search(parsed.regex);
    if (idx < 0) return { matches: false, score: 0 };
    return { matches: true, score: idx * 0.1 };
  }

  if (parsed.tokens.length === 0) {
    return { matches: true, score: 0 };
  }

  let totalScore = 0;
  let normalizedText: string | null = null;

  for (const token of parsed.tokens) {
    if (token.kind === "phrase") {
      if (normalizedText === null) {
        normalizedText = normalizeWhitespaceLower(text);
      }
      const phrase = normalizeWhitespaceLower(token.value);
      if (!phrase) continue;
      const idx = normalizedText.indexOf(phrase);
      if (idx < 0) return { matches: false, score: 0 };
      totalScore += idx * 0.1;
      continue;
    }

    const m = fuzzyMatch(token.value, text);
    if (!m.matches) return { matches: false, score: 0 };
    totalScore += m.score;
  }

  return { matches: true, score: totalScore };
}

/**
 * Filter + sort sessions by a query (near-verbatim pi port). Empty query
 * returns the input (name-filtered); "recent" filters only and keeps the
 * incoming order; "relevance" sorts by score ascending, tie-break modified
 * descending.
 */
export function filterAndSortSessions(
  sessions: SessionSearchRow[],
  query: string,
  sortMode: SortMode,
  nameFilter: NameFilter = "all",
): SessionSearchRow[] {
  const nameFiltered =
    nameFilter === "all" ? sessions : sessions.filter((session) => (nameFilter === "named" ? hasSessionName(session) : true));
  const trimmed = query.trim();
  if (!trimmed) return nameFiltered;

  const parsed = parseSearchQuery(query);
  if (parsed.error) return [];

  // Recent mode: filter only, keep incoming order.
  if (sortMode === "recent") {
    const filtered: SessionSearchRow[] = [];
    for (const s of nameFiltered) {
      const res = matchSession(s, parsed);
      if (res.matches) filtered.push(s);
    }
    return filtered;
  }

  // Relevance mode: sort by score, tie-break by modified desc.
  const scored: { session: SessionSearchRow; score: number }[] = [];
  for (const s of nameFiltered) {
    const res = matchSession(s, parsed);
    if (!res.matches) continue;
    scored.push({ session: s, score: res.score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return b.session.modified - a.session.modified;
  });

  return scored.map((r) => r.session);
}

/**
 * The `/resume` picker: type to search the session list (fuzzy tokens,
 * `"quoted phrases"`, `re:` regex), Enter resumes the selected session, Esc
 * cancels. Rows are newest-first until a query narrows them by relevance.
 * Same overlay grammar as the history search (scope §3.2): canonical footer,
 * opaque panel.
 */
export class SessionSearchPicker implements Component {
  private query = "";
  private list: SelectList;
  /** Rows, newest first (the controller pre-sorts by modified desc). */
  private readonly rows: SessionSearchRow[];

  constructor(
    rows: readonly SessionSearchRow[],
    private readonly onPick: (sessionId: string) => void,
    private readonly onCancel: () => void,
  ) {
    this.rows = [...rows];
    this.list = this.buildList();
  }

  private buildList(): SelectList {
    const filtered = this.query
      ? filterAndSortSessions(this.rows, this.query, "relevance")
      : this.rows;
    const items: SelectItem[] = filtered.map((row) => ({
      value: row.id,
      // The name is file-sourced — sanitise before it hits the terminal
      // (same choke point as app.ts setSessionName).
      label: row.name?.trim() ? sanitizeTerminalText(row.name).replace(/\s+/g, " ").trim() : row.id.slice(0, 8),
      description: `${row.firstUserMessage.replace(/\s+/g, " ").slice(0, 40)} · ${row.messageCount} msgs · ${relativeTime(row.modified)}`,
    }));
    const list = new SelectList(items, 10, paletteSelectTheme);
    list.onSelect = (item) => this.onPick(item.value);
    list.onCancel = () => this.onCancel();
    return list;
  }

  /** Current filter text (test accessor). */
  get filterText(): string {
    return this.query;
  }

  handleInput(data: string): void {
    if (data === "\x7f") {
      this.query = this.query.slice(0, -1);
      this.list = this.buildList();
      return;
    }
    if (data.length === 1 && data >= " ") {
      this.query += data;
      this.list = this.buildList();
      return;
    }
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    return opaquePanel(
      [
        ` ${highlight.base("resume")} ${textToken.dim(`— ${this.query ? `search: ${this.query}` : 'type to search (fuzzy · "phrase" · re:regex)'}; Enter resumes; Esc back`)}`,
        "",
        ...this.list.render(width - 4),
        "",
        ` ${textToken.dim(renderOverlayFooter())}`,
      ],
      width,
    );
  }

  invalidate(): void {
    this.list.invalidate();
  }
}
