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
import { SessionStore } from "@kaidera/openkai-core";
import { filterAndSortSessions, readSessionSearchRows } from "./tui/session-search.js";

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
    const snippet = row.firstUserMessage.replace(/\n/g, " ").slice(0, 60);
    const parent = row.parentSessionId ? ` ← ${row.parentSessionId.slice(0, 8)}` : "";
    process.stdout.write(`${row.id}\t${row.name ?? ""}\t${row.messageCount}\t${snippet}${parent}\n`);
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

/** Extract a short text snippet from a message. */
function contentSnippet(message: { role?: string; content?: unknown }): string {
  const content = "content" in message ? (message as { content?: unknown }).content : undefined;
  if (typeof content === "string") {
    return content.replace(/\n/g, " ").slice(0, 60);
  }
  if (Array.isArray(content)) {
    const text = content
      .filter(
        (part): part is { type: "text"; text: string } =>
          typeof part === "object" && part !== null && "type" in part && part.type === "text",
      )
      .map((part) => part.text)
      .join("");
    return text.replace(/\n/g, " ").slice(0, 60);
  }
  return "";
}