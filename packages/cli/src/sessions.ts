/**
 * `openkai sessions` — list local persisted sessions (D-P2-6, scope §4).
 *
 * Prints one TSV row per session found under `.openkai/sessions/`, with the
 * session id, entry count, and first-user-message snippet. The local JSONL v3
 * tree is the source of truth; this command reads it back without touching
 * Cortex.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { SessionStore, redactSecrets } from "@kaidera/openkai-core";
import { filterAndSortSessions, readSessionSearchRows } from "./tui/session-search.js";
import { sanitizeTerminalText } from "./tui/sanitize.js";

/**
 * Session names and message text are file-sourced and `/name`-authored, so
 * they are hostile terminal input (OSC title/clipboard, CSI clears). The TUI
 * /resume picker already sanitises at its render boundary; this CLI listing is
 * a SEPARATE reader of the same data (E019 render-boundary finding). Strip
 * control/ESC/BEL, then collapse remaining whitespace so an embedded TAB can't
 * break the TSV columns (sanitizeTerminalText keeps \t and \n as layout).
 */
function cleanCell(text: string, max: number): string {
  return sanitizeTerminalText(text).replace(/\s+/g, " ").trim().slice(0, max);
}

/** Options for the `sessions` command. */
export interface SessionsOptions {
  /** Root directory (default: `.openkai/sessions`). */
  root?: string;
  /** Show full entry details for one session id. */
  show?: string;
  /**
   * Filter the listing by a search query (E017 dossier pick 5): fuzzy
   * tokens, `"quoted phrases"`, `re:` regex — the same language as the
   * TUI's /resume picker (session-search.ts).
   */
  search?: string;
}

/** Run the sessions listing. */
export async function runSessions(options: SessionsOptions): Promise<number> {
  const root = options.root ?? path.join(process.cwd(), ".openkai", "sessions");

  if (options.show) {
    return showSession(root, options.show);
  }

  const rows = await readSessionSearchRows(root, { withText: options.search !== undefined });
  if (rows.length === 0) {
    process.stdout.write("(no sessions)\n");
    return 0;
  }

  // Search ranks by relevance (the picker's order); a plain listing keeps
  // the legacy alphabetical-by-id order.
  const filtered =
    options.search !== undefined
      ? filterAndSortSessions(rows, options.search, "relevance")
      : [...rows].sort((a, b) => a.id.localeCompare(b.id));
  if (filtered.length === 0) {
    process.stdout.write(`(no sessions matching ${JSON.stringify(options.search)})\n`);
    return 0;
  }

  process.stdout.write("session_id\tname\tentries\tfirst_user_message\n");
  for (const row of filtered) {
    const name = row.name ? cleanCell(row.name, 60) : "";
    const snippet = cleanCell(row.firstUserMessage, 60);
    const parent = row.parentSessionId ? ` ← ${row.parentSessionId.slice(0, 8)}` : "";
    process.stdout.write(`${row.id}\t${name}\t${row.messageCount}\t${snippet}${parent}\n`);
  }
  return 0;
}

/** Show full entry details for one session. */
async function showSession(root: string, sessionId: string): Promise<number> {
  const store = new SessionStore({ root, sessionId });
  try {
    const header = await store.readHeader();
    const entries = await store.readEntries();
    process.stdout.write(
      `=== session ${sessionId} (v${header?.version ?? "?"}, parent=${header?.parentSessionId ?? "none"}) ===\n`,
    );
    for (const entry of entries) {
      const parent = entry.parentId ? entry.parentId.slice(0, 8) : "root";
      const id = entry.id.slice(0, 8);
      if (entry.type === "message") {
        const role = entry.message.role;
        const text = contentSnippet(entry.message);
        process.stdout.write(`  [${entry.seq}] ${id} ← ${parent}  ${role}: ${text}\n`);
      } else if (entry.type === "custom") {
        process.stdout.write(`  [${entry.seq}] ${id} ← ${parent}  custom:${entry.customType}\n`);
      } else {
        process.stdout.write(`  [${entry.seq}] ${id} ← ${parent}  ${entry.type}\n`);
      }
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

/**
 * Extract a short text snippet from a message.
 *
 * The chokepoint `showSession` uses to put stored message text on screen, so
 * redaction goes here once. Redact BEFORE slicing: slicing first can cut a
 * token below the pattern's length floor, and a half-printed key is still a
 * leaked key. (`runSessions` renders a different seam — see
 * `readSessionSearchRows`, which redacts at row construction.)
 */
function contentSnippet(message: { role?: string; content?: unknown }): string {
  const content = "content" in message ? (message as { content?: unknown }).content : undefined;
  // Union of the two protections on this seam: redact SECRETS first (before any
  // slice — a half-printed key is still a key, E002-F1d2), then strip terminal
  // ESCAPES + collapse whitespace + slice (E019 render-boundary). cleanCell does
  // the slice, so redactSecrets must wrap inside it.
  if (typeof content === "string") {
    return cleanCell(redactSecrets(content), 60);
  }
  if (Array.isArray(content)) {
    const text = content
      .filter(
        (part): part is { type: "text"; text: string } =>
          typeof part === "object" && part !== null && "type" in part && part.type === "text",
      )
      .map((part) => part.text)
      .join("");
    return cleanCell(redactSecrets(text), 60);
  }
  return "";
}