/**
 * openkai tail — the live activity feed. Every session event lands in
 * `.openkai/activity.jsonl` (written by the TUI/chat at runtime); routing
 * events (Shift, E002 Inc 02) land in the same file through the same writer.
 * This renders it as human lines and follows it like `tail -f`.
 *
 * SECURITY (F7/F6c): every string field on an activity row is passed through
 * {@link redactSecrets} BEFORE the row is serialised to disk. A provider
 * error that echoes an API key back in a 401/429 body is redacted at this
 * boundary — the sanitiser existing in the tree is not enough; this writer
 * calls it. The reproducer in the shift test suite proves the redaction fires
 * on this exact path, both in the jsonl file and in `openkai tail` output.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { redactSecrets } from "@kaidera/openkai-core";

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
  // Shift routing event fields (E002 Inc 02; tier/source E017 — OK-9.1 labels).
  stage?: string;
  model?: string;
  provider?: string;
  attempt?: number;
  tier?: string;
  source?: string;
  reason?: string;
}

/**
 * Recursively redact every string value in an arbitrary structure. This is
 * the belt-and-braces layer: even if a future event shape adds a new string
 * field, it is redacted without needing to update this function.
 */
function redactStrings<T>(value: T): T {
  if (typeof value === "string") return redactSecrets(value) as T;
  if (Array.isArray(value)) return value.map((v) => redactStrings(v)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactStrings(v);
    }
    return out as T;
  }
  return value;
}

/** Append one event to the activity log (the runtime's onActivity sink). */
export function appendActivity(cwd: string, kind: string, extra: Partial<ActivityRow> = {}): void {
  try {
    const file = activityLogPath(cwd);
    mkdirSync(path.dirname(file), { recursive: true });
    // Redact every string field before serialising — the security boundary.
    const redactedExtra = redactStrings(extra);
    const row: ActivityRow = { ts: new Date().toISOString(), kind, ...redactedExtra };
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
    // ── Shift routing events (E002 Inc 02; tier/source labels E017) ──────
    case "routing":
      return `${time}  ⇄ ${row.stage ?? "?"} → ${row.model ?? "?"} (${row.provider ?? "?"})${row.tier ? ` [${row.tier}${row.source ? ` · ${row.source}` : ""}]` : ""}`;
    case "fallback":
      return `${time}  ↻ ${row.stage ?? "?"} fallback → ${row.model ?? "?"} (${row.provider ?? "?"}, attempt ${row.attempt ?? "?"})${row.tier ? ` [${row.tier}]` : ""}`;
    case "routing_error":
      return `${time}  ✗ routing: ${(row.reason ?? "").slice(0, 120)}`;
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
  /** Override the project directory (defaults to process.cwd()). */
  cwd?: string;
}

export async function runTail(options: TailOptions): Promise<number> {
  const file = activityLogPath(options.cwd);
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
        // Redact on READ as well as on write (E002-F1d). appendActivity
        // sanitises what IT writes, but the file outlives any one version:
        // a log written before the redactor covered a given provider still
        // holds that key in cleartext, and rendering it here would put it on
        // the operator's screen and into any pasted bug report. Same rule the
        // deny floor follows since 09b56ce — the boundary holds regardless of
        // who wrote the data.
        const rendered = renderRow(redactStrings(JSON.parse(line) as ActivityRow));
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
