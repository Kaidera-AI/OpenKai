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
import { SessionStore } from "openkai-core";

/** Options for the `sessions` command. */
export interface SessionsOptions {
  /** Root directory (default: `.openkai/sessions`). */
  root?: string;
  /** Show full entry details for one session id. */
  show?: string;
}

/** Run the sessions listing. */
export async function runSessions(options: SessionsOptions): Promise<number> {
  const root = options.root ?? path.join(process.cwd(), ".openkai", "sessions");

  if (options.show) {
    return showSession(root, options.show);
  }

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    // No sessions dir yet — clean empty state.
    process.stdout.write("(no sessions)\n");
    return 0;
  }

  const sessionIds = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  if (sessionIds.length === 0) {
    process.stdout.write("(no sessions)\n");
    return 0;
  }

  process.stdout.write("session_id\tentries\tfirst_user_message\n");
  for (const sessionId of sessionIds.sort()) {
    const store = new SessionStore({ root, sessionId });
    try {
      const storeEntries = await store.readEntries();
      const header = await store.readHeader();
      const messageEntries = storeEntries.filter((e) => e.type === "message");
      const firstUser = messageEntries.find((e) => {
        if (e.type !== "message") return false;
        return e.message.role === "user";
      });
      const snippet =
        firstUser && firstUser.type === "message"
          ? contentSnippet(firstUser.message)
          : "";
      const parent = header?.parentSessionId ? ` ← ${header.parentSessionId.slice(0, 8)}` : "";
      process.stdout.write(
        `${sessionId}\t${messageEntries.length}\t${snippet}${parent}\n`,
      );
    } catch (error) {
      process.stderr.write(
        `ERROR reading ${sessionId}: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
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