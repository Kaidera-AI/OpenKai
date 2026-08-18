/**
 * Config helpers (E002 Inc 05) — the shared read/write layer for
 * `~/.openkai/config.json`.
 *
 * `readConfig`/`writeConfig` live in tui/welcome.ts for onboarding; this module
 * re-exports them and adds the capability-management keys (mcpServers,
 * statusline) so skills/mcp/statusline commands share one path + one shape.
 * The `OPENKAI_HOME` env var overrides `~/.openkai` for tests (no monkey
 * patching of `os.homedir`).
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ShiftPosture } from "@kaidera/openkai-core";


/** The OpenKai home directory (~/.openkai or $OPENKAI_HOME for tests). */
export function openkaiHome(): string {
  return process.env.OPENKAI_HOME ?? path.join(homedir(), ".openkai");
}

/** Path to the config file. */
export function configFilePath(): string {
  return path.join(openkaiHome(), "config.json");
}

/** Read the config file; returns `{}` if missing or unparseable. */
export function readConfigFile(): Record<string, unknown> {
  try {
    const file = configFilePath();
    if (!existsSync(file)) return {};
    return JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Write the config file, creating the directory if needed. */
export function writeConfigFile(config: Record<string, unknown>): void {
  const file = configFilePath();
  // The home dir and config file carry provider/MCP configuration — operator
  // only (0o700 / 0o600). The chmod also repairs pre-existing loose files.
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  chmodSync(file, 0o600);
}

// ── MCP server config (pi/opencode shape) ──────────────────────────────────

/** One MCP server entry (pi/opencode config shape). */
export interface McpServerEntry {
  /** Server name (key in the mcpServers map). */
  name: string;
  /** Command to run (stdio transport), or undefined when using `url`. */
  command?: string;
  /** Arguments for the command. */
  args?: string[];
  /** SSE/HTTP URL (remote transport), or undefined when using `command`. */
  url?: string;
  /** Environment variables for the command. */
  env?: Record<string, string>;
}

/** Read the mcpServers map from config (empty when absent). */
export function readMcpServers(): Record<string, McpServerEntry> {
  const raw = readConfigFile()["mcpServers"];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, McpServerEntry>;
  }
  return {};
}

/** Write the mcpServers map back to config (merges with existing keys). */
export function writeMcpServers(servers: Record<string, McpServerEntry>): void {
  const config = readConfigFile();
  config["mcpServers"] = servers;
  writeConfigFile(config);
}

// ── Statusline chip config ──────────────────────────────────────────────────

/** All chip ids the status line knows about. */
export const STATUSLINE_CHIPS = [
  "brand",
  "agent",
  "model",
  "session",
  "tokens",
  "persist",
  "provider",
  "state",
  "git",
  "ctx",
  "plan",
] as const;

export type StatuslineChip = (typeof STATUSLINE_CHIPS)[number];

/** Default chip order (brand glyph leads; matches the omp two-sided chrome). */
export const DEFAULT_STATUSLINE_CHIPS: StatuslineChip[] = [
  "brand",
  "agent",
  "provider",
  "git",
  "persist",
  "session",
  "state",
  "plan",
  "ctx",
  "tokens",
  "model",
];

/** Read the statusline chip config (order + which chips to show). */
export function readStatuslineChips(): StatuslineChip[] {
  const raw = readConfigFile()["statusline"];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const chips = (raw as Record<string, unknown>)["chips"];
    if (Array.isArray(chips)) {
      const valid = chips.filter(
        (c): c is StatuslineChip =>
          typeof c === "string" &&
          (STATUSLINE_CHIPS as readonly string[]).includes(c),
      );
      if (valid.length > 0) return valid;
    }
  }
  return [...DEFAULT_STATUSLINE_CHIPS];
}

/** Write the statusline chip config. */
export function writeStatuslineChips(chips: StatuslineChip[]): void {
  const config = readConfigFile();
  config["statusline"] = { chips };
  writeConfigFile(config);
}

// ── Shift routing config (E017) ─────────────────────────────────────────────
// The pinned contract (a sibling consumes it in core/orchestrate.ts):
//   "shift": { "posture": "quality"|"balanced"|"saver",
//              "pins": { "floor": {...}, "ceiling": "...", "never": [...] } }
// The READ side lives in fuse.ts (`readShiftConfig`) — this is the write
// path only: it sets posture and preserves any pins the operator hand-edited.

/** Persist the shift posture, preserving `shift.pins` and every other key. */
export function writeShiftPosture(posture: ShiftPosture): void {
  const config = readConfigFile();
  const shift = config["shift"];
  const existing = shift && typeof shift === "object" && !Array.isArray(shift)
    ? (shift as Record<string, unknown>)
    : {};
  config["shift"] = { ...existing, posture };
  writeConfigFile(config);
}
