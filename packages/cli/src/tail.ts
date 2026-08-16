/**
 * openkai tail — the live activity feed. Every session event lands in
 * `.openkai/activity.jsonl` (written by the TUI/chat at runtime); this
 * renders it as human lines and follows it like `tail -f`.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/** The per-project activity log. */
export function activityLogPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".openkai", "activity.jsonl");
}

interface ActivityRow {
  ts: string;
  kind: string;
  field?: string;
  toolName?: string;
  args?: unknown;
  isError?: boolean;
  usage?: { totalTokens?: number };
  message?: string;
}

/** Append one event to the activity log (the runtime's onActivity sink). */
export function appendActivity(cwd: string, kind: string, extra: Partial<ActivityRow> = {}): void {
  try {
    const file = activityLogPath(cwd);
    mkdirSync(path.dirname(file), { recursive: true });
    const row: ActivityRow = { ts: new Date().toISOString(), kind, ...extra };
    appendFileSync(file, `${JSON.stringify(row)}\n`, "utf-8");
  } catch {
    // the feed must never break the app
  }
}

/** Render one row as a human line. */
function renderRow(row: ActivityRow): string | undefined {
  const time = row.ts.slice(11, 19);
  switch (row.kind) {
    case "connected":
      return `${time}  ◇ turn started`;
    case "tool_call":
      return `${time}  → tool ${row.toolName ?? "?"} ${summarise(row.args)}`;
    case "tool_result":
      return `${time}  ${row.isError ? "✗" : "✓"} ${row.toolName ?? "tool"} finished`;
    case "usage":
      return `${time}  ⏱ ${row.usage?.totalTokens ?? "?"} tokens`;
    case "turn_end":
      return `${time}  ◆ turn complete`;
    case "session_end":
      return `${time}  ■ session end`;
    case "error":
      return `${time}  ✗ error: ${(row.message ?? "").slice(0, 120)}`;
    default:
      return undefined; // deltas are too noisy for the feed
  }
}

const summarise = (args: unknown): string => {
  if (!args || typeof args !== "object") return "";
  const entries = Object.entries(args as Record<string, unknown>);
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}=${String(v).slice(0, 40)}`)
    .join(" ");
};

export interface TailOptions {
  follow: boolean;
  lines: number;
}

export async function runTail(options: TailOptions): Promise<number> {
  const file = activityLogPath();
  if (!existsSync(file)) {
    process.stdout.write(`no activity yet (${file})\nrun the TUI or a chat turn first, then tail again.\n`);
    return 0;
  }

  const printFrom = (offset: number): number => {
    const text = readFileSync(file, "utf-8");
    const lines = text.split("\n").filter((l) => l.trim().length > 0);
    const slice = lines.slice(offset < 0 ? Math.max(0, lines.length + offset) : offset);
    for (const line of slice) {
      try {
        const rendered = renderRow(JSON.parse(line) as ActivityRow);
        if (rendered) process.stdout.write(`${rendered}\n`);
      } catch {
        // skip malformed rows
      }
    }
    return lines.length;
  };

  let cursor = printFrom(-options.lines);
  if (!options.follow) return 0;

  // Follow mode: poll for growth (portable, no fs.watch flakiness).
  process.stdout.write("— following (Ctrl+C to stop) —\n");
  await new Promise<void>((resolve) => {
    const abort = () => resolve();
    process.on("SIGINT", abort);
    process.on("SIGTERM", abort);
    const timer = setInterval(() => {
      try {
        if (statSync(file).size === 0) return;
        cursor = printFrom(cursor);
      } catch {
        // transient read during rotation — next tick
      }
    }, 500);
    timer.unref?.();
  });
  return 0;
}
