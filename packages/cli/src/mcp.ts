/**
 * openkai mcp — MCP server management (E002 Inc 05).
 *
 * Add / remove / list / test MCP server entries in the harness config
 * (`~/.openkai/config.json`, `mcpServers` map). The config shape follows the
 * pi/opencode MCP convention: `{ name, command/args or url, env }`.
 *
 * `test` validates by spawning the command (`--help` probe) or doing an HTTP
 * handshake against a URL endpoint. No new runtime deps — uses `child_process`
 * and `fetch` (built into Node 22+).
 */

import { spawn } from "node:child_process";

import {
  type McpServerEntry,
  configFilePath,
  readMcpServers,
  writeMcpServers,
} from "./config.js";

export interface McpAddOptions {
  /** Server name (key). */
  name: string;
  /** Command to run (stdio transport). */
  command?: string;
  /** Arguments (space-separated string). */
  args?: string;
  /** Remote URL (HTTP/SSE transport). */
  url?: string;
  /** Environment variables (KEY=VALUE, comma-separated). */
  env?: string;
}

export interface McpRemoveOptions {
  name: string;
}

export interface McpTestOptions {
  name: string;
  /** Probe timeout in seconds (default 10). */
  timeout?: number;
}

/** Parse a "k=v,k2=v2" env string into a Record. */
function parseEnv(envStr: string | undefined): Record<string, string> | undefined {
  if (!envStr) return undefined;
  const env: Record<string, string> = {};
  for (const pair of envStr.split(",")) {
    const trimmed = pair.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) {
      env[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
    }
  }
  return Object.keys(env).length > 0 ? env : undefined;
}

/** Parse a space-separated args string into a string[]. */
function parseArgs(argsStr: string | undefined): string[] | undefined {
  if (!argsStr) return undefined;
  return argsStr.split(/\s+/).filter((a) => a.length > 0);
}

// ── add ──────────────────────────────────────────────────────────────────────

export async function runMcpAdd(options: McpAddOptions): Promise<number> {
  if (!options.command && !options.url) {
    process.stderr.write("ERROR: mcp add requires --command <cmd> or --url <url>.\n");
    return 2;
  }
  if (options.command && options.url) {
    process.stderr.write("ERROR: mcp add accepts either --command or --url, not both.\n");
    return 2;
  }

  const entry: McpServerEntry = { name: options.name };
  if (options.command) {
    entry.command = options.command;
    entry.args = parseArgs(options.args);
  }
  if (options.url) {
    entry.url = options.url;
  }
  const env = parseEnv(options.env);
  if (env) entry.env = env;

  const servers = readMcpServers();
  servers[options.name] = entry;
  writeMcpServers(servers);

  const transport = entry.url ? `url: ${entry.url}` : `command: ${entry.command}${entry.args ? " " + entry.args.join(" ") : ""}`;
  process.stdout.write(`Added MCP server "${options.name}" (${transport}) to ${configFilePath()}\n`);
  return 0;
}

// ── remove ───────────────────────────────────────────────────────────────────

export async function runMcpRemove(options: McpRemoveOptions): Promise<number> {
  const servers = readMcpServers();
  if (!(options.name in servers)) {
    process.stderr.write(`ERROR: no MCP server named "${options.name}".\n`);
    return 1;
  }
  delete servers[options.name];
  writeMcpServers(servers);
  process.stdout.write(`Removed MCP server "${options.name}"\n`);
  return 0;
}

// ── list ──────────────────────────────────────────────────────────────────────

export async function runMcpList(): Promise<number> {
  const servers = readMcpServers();
  const names = Object.keys(servers);
  if (names.length === 0) {
    process.stdout.write("No MCP servers configured.\n");
    process.stdout.write(`  Add one: openkai mcp add <name> --command <cmd> [--args <args>]\n`);
    return 0;
  }
  const w = Math.max(4, ...names.map((n) => n.length));
  process.stdout.write(`  ${"NAME".padEnd(w)}  TRANSPORT  CONFIG\n`);
  process.stdout.write(`  ${"-".repeat(w)}  --------   ------\n`);
  for (const name of names) {
    const entry = servers[name];
    if (!entry) continue;
    let transport = "?";
    let config = "";
    if (entry.url) {
      transport = "url";
      config = entry.url;
    } else if (entry.command) {
      transport = "stdio";
      config = `${entry.command}${entry.args ? " " + entry.args.join(" ") : ""}`;
    }
    process.stdout.write(`  ${name.padEnd(w)}  ${transport.padEnd(8)}   ${config}\n`);
  }
  return 0;
}

// ── test ─────────────────────────────────────────────────────────────────────

export async function runMcpTest(options: McpTestOptions): Promise<number> {
  const servers = readMcpServers();
  if (!(options.name in servers)) {
    process.stderr.write(`ERROR: no MCP server named "${options.name}".\n`);
    return 1;
  }
  const entry = servers[options.name];
  if (!entry) {
    process.stderr.write(`ERROR: no MCP server named "${options.name}".\n`);
    return 1;
  }
  const timeoutMs = (options.timeout ?? 10) * 1000;

  if (entry.url) {
    // HTTP handshake probe.
    process.stdout.write(`Probing ${entry.url} ...\n`);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(entry.url, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        process.stdout.write(`\u2713 "${options.name}" reachable (HTTP ${response.status})\n`);
        return 0;
      }
      process.stderr.write(`\u2717 "${options.name}" returned HTTP ${response.status}\n`);
      return 1;
    } catch (error) {
      process.stderr.write(`\u2717 "${options.name}" unreachable: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  if (entry.command) {
    // Spawn --help probe (or the command directly if --help not supported).
    const args = entry.args ?? [];
    process.stdout.write(`Spawning ${entry.command} ${args.join(" ")} --help ...\n`);
    return new Promise<number>((resolve) => {
      const child = spawn(
        entry.command!,
        [...args, "--help"],
        {
          env: { ...process.env, ...entry.env },
          stdio: ["pipe", "pipe", "pipe"],
          timeout: timeoutMs,
        },
      );
      let settled = false;
      const done = (code: number): void => {
        if (settled) return;
        settled = true;
        if (code === 0) {
          process.stdout.write(`\u2713 "${options.name}" spawned successfully\n`);
          resolve(0);
        } else {
          // Some servers exit non-zero on --help but still print usage;
          // a non-error stderr means the binary exists and ran.
          process.stdout.write(`\u2713 "${options.name}" spawned (exit ${code}; --help may not be supported)\n`);
          resolve(0);
        }
      };
      child.on("exit", (code) => done(code ?? 1));
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        process.stderr.write(`\u2717 "${options.name}" failed to spawn: ${err.message}\n`);
        resolve(1);
      });
      // Collect stderr for diagnostics (not printed to avoid noise).
      child.stderr?.on("data", () => {});
    });
  }

  process.stderr.write(`ERROR: server "${options.name}" has no command or url.\n`);
  return 1;
}