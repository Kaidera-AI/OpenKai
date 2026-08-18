/**
 * MCP (Model Context Protocol) integration — connect to MCP servers,
 * discover their tools, and proxy them as native OpenKai AgentTools.
 *
 * Config: ~/.openkai/mcp.json — array of server descriptors:
 *   [{ "name": "filesystem", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "."] }]
 *
 * Protocol: JSON-RPC 2.0 over stdio (MCP spec 2024-11-05).
 * Operations: initialize → tools/list → tools/call per invocation.
 */

import { spawn as cpSpawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";

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
  nextId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  buffer: string;
  initialized: boolean;
  tools: McpToolDef[];
}

// ── Config ───────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(homedir(), ".openkai", "mcp.json");

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

async function connectServer(config: McpServerConfig): Promise<McpConnection> {
  const existing = _connections.get(config.name);
  if (existing) return existing;

  const proc = cpSpawn(config.command, config.args ?? [], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...config.env },
  });

  const conn: McpConnection = {
    process: proc,
    name: config.name,
    nextId: 1,
    pending: new Map(),
    buffer: "",
    initialized: false,
    tools: [],
  };

  proc.stdout!.on("data", (chunk: Buffer) => {
    conn.buffer += chunk.toString("utf-8");
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

function proxyTool(conn: McpConnection, toolDef: McpToolDef): AgentTool<Record<string, unknown>, unknown> {
  return {
    name: `mcp__${conn.name}__${toolDef.name}`,
    label: `MCP:${conn.name}:${toolDef.name}`,
    description: toolDef.description ?? `MCP tool ${toolDef.name} from ${conn.name}`,
    parameters: {
      type: "object",
      properties: toolDef.inputSchema.properties ?? {},
      required: toolDef.inputSchema.required,
      additionalProperties: false,
    } as unknown as Record<string, unknown>,
    async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
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
 */
export async function discoverMcpTools(): Promise<AgentTool<Record<string, unknown>, unknown>[]> {
  const configs = loadMcpConfig();
  if (configs.length === 0) return [];

  const tools: AgentTool<Record<string, unknown>, unknown>[] = [];
  for (const config of configs) {
    try {
      const conn = await connectServer(config);
      for (const toolDef of conn.tools) {
        tools.push(proxyTool(conn, toolDef));
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

/** Shut down all MCP connections. */
export function shutdownMcp(): void {
  for (const conn of _connections.values()) {
    try { conn.process.kill(); } catch { /* best effort */ }
  }
  _connections.clear();
}