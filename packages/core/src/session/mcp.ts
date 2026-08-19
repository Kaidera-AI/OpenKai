/**
 * MCP (Model Context Protocol) integration — connect to MCP servers,
 * discover their tools, and proxy them as native OpenKai AgentTools.
 *
 * Config: ~/.openkai/mcp.json — array of server descriptors:
 *   [{ "name": "filesystem", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] }]
 *
 * Protocol: JSON-RPC 2.0 over stdio (MCP spec 2024-11-05).
 * Operations: initialize → tools/list → tools/call per invocation.
 *
 * Hardening (ren's adversarial review):
 *  - Spawned servers get a SCRUBBED environment ({@link scrubbedChildEnv}) —
 *    credential-named/valued variables are dropped; the operator's explicit
 *    `config.env` entries are applied last (explicit beats scrub).
 *  - Every proxied `tools/call` is wrapped in the session {@link PermissionGate}
 *    when one is threaded through {@link discoverMcpTools} — an MCP tool is a
 *    remote-controlled capability and must not bypass consent.
 *  - The per-connection read buffer is capped at 1 MiB; on overflow the
 *    connection is killed and its pending requests rejected (a runaway server
 *    must not balloon memory).
 */

import { spawn as cpSpawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { PermissionGate } from "./permission-gate.js";
import { scrubbedChildEnv } from "../procenv.js";
import { openkaiHome } from "../credentials.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, unknown>;
    required?: string[];
  };
}

interface McpConnection {
  process: ChildProcess;
  name: string;
  /** Working directory the server was spawned from (used in gate previews). */
  cwd: string;
  nextId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  buffer: string;
  initialized: boolean;
  tools: McpToolDef[];
}

// ── Config ───────────────────────────────────────────────────────────────────

// openkaiHome honours OPENKAI_HOME — mcp.json follows the same
// relocation rule as config.json (credentials.ts is the single definition).
const CONFIG_PATH = path.join(openkaiHome(), "mcp.json");

function loadMcpConfig(): McpServerConfig[] {
  try {
    if (!existsSync(CONFIG_PATH)) return [];
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    return JSON.parse(raw) as McpServerConfig[];
  } catch {
    return [];
  }
}

// ── JSON-RPC transport ───────────────────────────────────────────────────────

function parseMessage(buffer: string): { message: Record<string, unknown>; remaining: string } | null {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;
  const header = buffer.slice(0, headerEnd);
  const clMatch = header.match(/^Content-Length: (\d+)$/im);
  if (!clMatch) return null;
  const contentLength = parseInt(clMatch[1]!, 10);
  const bodyStart = headerEnd + 4;
  if (buffer.length < bodyStart + contentLength) return null;
  const body = buffer.slice(bodyStart, bodyStart + contentLength);
  const remaining = buffer.slice(bodyStart + contentLength);
  try {
    return { message: JSON.parse(body) as Record<string, unknown>, remaining };
  } catch {
    return null;
  }
}

function sendJsonRpc(conn: McpConnection, method: string, params?: unknown): Promise<unknown> {
  const id = conn.nextId++;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  conn.process.stdin!.write(header + body);

  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  const timer = setTimeout(() => {
    conn.pending.delete(id);
    reject(new Error(`MCP ${method} timed out`));
  }, 30_000);
  conn.pending.set(id, {
    resolve: (v) => { clearTimeout(timer); resolve(v); },
    reject: (e) => { clearTimeout(timer); reject(e); },
  });
  return promise;
}

// ── MCP Client ───────────────────────────────────────────────────────────────

const _connections = new Map<string, McpConnection>();

/** Per-connection read-buffer cap (1 MiB); overflow kills the connection. */
const BUFFER_CAP = 1 << 20;

/** Kill a runaway connection: terminate the process, reject all pending. */
function killConnection(conn: McpConnection, why: string): void {
  for (const [, pending] of conn.pending) {
    pending.reject(new Error(why));
  }
  conn.pending.clear();
  try { conn.process.kill(); } catch { /* best effort */ }
  _connections.delete(conn.name);
}

async function connectServer(config: McpServerConfig): Promise<McpConnection> {
  const existing = _connections.get(config.name);
  if (existing) return existing;

  const proc = cpSpawn(config.command, config.args ?? [], {
    stdio: ["pipe", "pipe", "pipe"],
    // Scrubbed environment: credential-named/valued vars are dropped; the
    // operator's explicit config.env is applied LAST (explicit beats scrub).
    env: scrubbedChildEnv(config.env),
  });

  const conn: McpConnection = {
    process: proc,
    name: config.name,
    cwd: process.cwd(),
    nextId: 1,
    pending: new Map(),
    buffer: "",
    initialized: false,
    tools: [],
  };

  proc.stdout!.on("data", (chunk: Buffer) => {
    conn.buffer += chunk.toString("utf-8");
    if (conn.buffer.length > BUFFER_CAP) {
      killConnection(conn, `MCP server "${conn.name}" exceeded the 1MiB buffer cap — connection killed`);
      return;
    }
    let parsed;
    while ((parsed = parseMessage(conn.buffer)) !== null) {
      conn.buffer = parsed.remaining;
      const msg = parsed.message;
      if (typeof msg.id === "number") {
        const pending = conn.pending.get(msg.id);
        if (pending) {
          conn.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(String((msg.error as { message?: string })?.message ?? "MCP error")));
          } else {
            pending.resolve(msg.result);
          }
        }
      }
    }
  });

  proc.stderr!.on("data", () => { /* suppress */ });

  // Initialize
  const initResult = await sendJsonRpc(conn, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: { tools: {} },
    clientInfo: { name: "openkai", version: "0.1.0" },
  }) as { serverInfo?: { name: string }; capabilities?: { tools?: Record<string, unknown> } };

  // Send initialized notification
  const notified = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
  conn.process.stdin!.write(`Content-Length: ${Buffer.byteLength(notified)}\r\n\r\n${notified}`);

  conn.initialized = true;

  // List tools (only if server supports tools)
  if (initResult.capabilities?.tools) {
    const toolsResult = await sendJsonRpc(conn, "tools/list") as { tools?: McpToolDef[] };
    conn.tools = toolsResult.tools ?? [];
  }

  _connections.set(config.name, conn);
  return conn;
}

// ── Tool factory ─────────────────────────────────────────────────────────────

function textResult(text: string): AgentToolResult<unknown> {
  return { content: [{ type: "text", text }] as TextContent[], details: text };
}

function proxyTool(conn: McpConnection, toolDef: McpToolDef, gate?: PermissionGate): AgentTool<Record<string, unknown>, unknown> {
  const fullName = `mcp__${conn.name}__${toolDef.name}`;
  return {
    name: fullName,
    label: `MCP:${conn.name}:${toolDef.name}`,
    description: toolDef.description ?? `MCP tool ${toolDef.name} from ${conn.name}`,
    parameters: {
      type: "object",
      properties: toolDef.inputSchema.properties ?? {},
      required: toolDef.inputSchema.required,
      additionalProperties: false,
    } as unknown as Record<string, unknown>,
    async execute(toolCallId, params): Promise<AgentToolResult<unknown>> {
      // With a gate threaded through, every tools/call goes through consent —
      // the preview shows the proxied invocation as a command line.
      if (gate) {
        const outcome = await gate.request(fullName, toolCallId, params, () => ({
          kind: "command",
          command: `${fullName} ${JSON.stringify(params).slice(0, 500)}`,
          cwd: conn.cwd,
        }));
        if (outcome.decision === "reject") {
          return textResult(`Permission denied: ${outcome.reason}`);
        }
      }
      try {
        const result = await sendJsonRpc(conn, "tools/call", {
          name: toolDef.name,
          arguments: params,
        });
        const content = (result as { content?: { type: string; text?: string }[] })?.content;
        if (content && content.length > 0) {
          const text = content.map((c) => c.text ?? "").join("\n");
          return textResult(text);
        }
        return textResult(JSON.stringify(result));
      } catch (error) {
        return textResult(`MCP error: ${error instanceof Error ? error.message : String(error)}`);
      }
    },
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Discover and connect to all configured MCP servers.
 * Returns an array of proxy AgentTools — one per discovered tool.
 * When `gate` is supplied, every proxied `tools/call` is wrapped in a
 * permission request (consent preview shows the invocation as a command).
 */
export async function discoverMcpTools(gate?: PermissionGate): Promise<AgentTool<Record<string, unknown>, unknown>[]> {
  const configs = loadMcpConfig();
  if (configs.length === 0) return [];

  const tools: AgentTool<Record<string, unknown>, unknown>[] = [];
  for (const config of configs) {
    try {
      const conn = await connectServer(config);
      for (const toolDef of conn.tools) {
        tools.push(proxyTool(conn, toolDef, gate));
      }
    } catch {
      // Server failed to connect — skip, don't block boot
    }
  }
  return tools;
}

/**
 * MCP status tool — reports connected servers and their tools.
 * Registered as a built-in so the model can inspect the MCP surface.
 */
export function mcpStatusTool(): AgentTool<Record<string, unknown>, unknown> {
  return {
    name: "mcp_status",
    label: "MCP Status",
    description: "List connected MCP servers and their available tools.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    } as unknown as Record<string, unknown>,
    async execute(): Promise<AgentToolResult<unknown>> {
      if (_connections.size === 0) {
        return textResult("No MCP servers connected. Configure servers in ~/.openkai/mcp.json");
      }
      const lines: string[] = [];
      for (const [name, conn] of _connections) {
        lines.push(`${name}: ${conn.tools.length} tools`);
        for (const t of conn.tools) {
          lines.push(`  - ${t.name}: ${t.description ?? "(no description)"}`);
        }
      }
      return textResult(lines.join("\n"));
    },
  };
}

/** Shut down all MCP connections, rejecting any in-flight requests. */
export function shutdownMcp(): void {
  for (const conn of [..._connections.values()]) {
    killConnection(conn, "MCP shutdown");
  }
}