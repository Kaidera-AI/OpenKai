/**
 * LSP tool — symbol-aware code intelligence via language server protocol.
 *
 * Spawns a language server (auto-detected: typescript-language-server for
 * TS/JS projects, gopls for Go, pyright for Python, etc.) and exposes
 * the key LSP operations as a tool the model can call.
 *
 * Operations: definition, references, hover, diagnostics, rename,
 *             symbols, code_actions, status, reload
 *
 * Pattern: omp's LSP tool (MIT, can1357/oh-my-pi), adapted for OpenKai's
 * AgentTool + TypeBox parameter surface.
 *
 * Confinement (ren's adversarial review): every `file` argument is routed
 * through the same canonical containment + deny-floor check as the file tools
 * ({@link guardPath}) — no absolute paths outside the session cwd, no floor
 * hits, and relative paths resolve against the tool's cwd, not process.cwd().
 * Semantics stay read-only: rename/code_actions only LIST proposed edits.
 */
import { spawn as cpSpawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import { guardPath } from "./tools.js";

// ── JSON-RPC 2.0 helpers ────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

type JsonRpcMessage = JsonRpcResponse | JsonRpcNotification;

/** Convert a file path to a file:// URI. */
function fileToUri(filePath: string): string {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
  return "file://" + abs.split(path.sep).map(encodeURIComponent).join("/");
}

/** Convert a file:// URI to a local path. */
function uriToFile(uri: string): string {
  if (uri.startsWith("file://")) {
    return decodeURIComponent(uri.slice(7));
  }
  return uri;
}

// ── LSP Client ──────────────────────────────────────────────────────────────

interface LspClientState {
  process: ReturnType<typeof cpSpawn>;
  nextId: number;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  buffer: string;
  rootUri: string;
  initialized: boolean;
  openFiles: Set<string>;
}

let _client: LspClientState | null = null;

/** Detect the language server binary for the current project. */
function detectServer(cwd: string): { command: string; args: string[] } | null {
  const hasTs = existsSync(path.join(cwd, "tsconfig.json")) ||
    existsSync(path.join(cwd, "package.json"));
  if (hasTs) {
    return { command: "typescript-language-server", args: ["--stdio"] };
  }
  const hasGo = existsSync(path.join(cwd, "go.mod"));
  if (hasGo) {
    return { command: "gopls", args: [] };
  }
  const hasPy = existsSync(path.join(cwd, "pyproject.toml")) ||
    existsSync(path.join(cwd, "setup.py")) ||
    existsSync(path.join(cwd, "requirements.txt"));
  if (hasPy) {
    return { command: "pyright-langserver", args: ["--stdio"] };
  }
  return null;
}

/** Parse one JSON-RPC message from the buffer. Returns the message and remaining buffer. */
function parseMessage(buffer: string): { message: JsonRpcMessage; remaining: string } | null {
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
    return { message: JSON.parse(body) as JsonRpcMessage, remaining };
  } catch {
    return null;
  }
}

/** Send a JSON-RPC request and wait for the response. */
function sendRequest(client: LspClientState, method: string, params?: unknown, timeoutMs = 20_000): Promise<unknown> {
  const id = client.nextId++;
  const request: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
  const body = JSON.stringify(request);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  client.process.stdin!.write(header + body);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.pending.delete(id);
      reject(new Error(`LSP request ${method} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    client.pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
  });
}

/** Send a notification (no response expected). */
function sendNotification(client: LspClientState, method: string, params?: unknown): void {
  const notification: JsonRpcNotification = { jsonrpc: "2.0", method, params };
  const body = JSON.stringify(notification);
  const header = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n`;
  client.process.stdin!.write(header + body);
}

/** Start the LSP client, initialise the server, and open the file. */
async function ensureClient(cwd: string, filePath: string): Promise<LspClientState> {
  if (_client) {
    // Open the file if not already open
    if (!_client.openFiles.has(filePath)) {
      const uri = fileToUri(filePath);
      const content = readFileSync(filePath, "utf-8");
      sendNotification(_client, "textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: detectLanguage(filePath),
          version: 1,
          text: content,
        },
      });
      _client.openFiles.add(filePath);
    }
    return _client;
  }

  const server = detectServer(cwd);
  if (!server) {
    throw new Error(`No language server detected for ${cwd}. Install typescript-language-server, gopls, or pyright.`);
  }

  const proc = cpSpawn(server.command, server.args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
  });

  const client: LspClientState = {
    process: proc,
    nextId: 1,
    pending: new Map(),
    buffer: "",
    rootUri: fileToUri(cwd),
    initialized: false,
    openFiles: new Set(),
  };

  // Read stdout — parse JSON-RPC messages
  proc.stdout!.on("data", (chunk: Buffer) => {
    client.buffer += chunk.toString("utf-8");

    let parsed;
    while ((parsed = parseMessage(client.buffer)) !== null) {
      client.buffer = parsed.remaining;
      const msg = parsed.message;
      if ("id" in msg && typeof msg.id === "number") {
        const pending = client.pending.get(msg.id);
        if (pending) {
          client.pending.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(`LSP error ${msg.error.code}: ${msg.error.message}`));
          } else {
            pending.resolve(msg.result);
          }
        }
      }
    }
  });

  proc.stderr!.on("data", () => {
    // suppress stderr noise
  });

  // Initialise
  await sendRequest(client, "initialize", {
    processId: process.pid,
    rootUri: client.rootUri,
    capabilities: {
      textDocument: {
        definition: { linkSupport: true },
        references: {},
        hover: { contentFormat: ["markdown", "plaintext"] },
        documentSymbol: { hierarchicalDocumentSymbolSupport: true },
        rename: { prepareSupport: true },
        codeAction: {},
        publishDiagnostics: {},
      },
      workspace: {
        symbol: {},
        workspaceEdit: {},
      },
    },
  });

  sendNotification(client, "initialized", {});
  client.initialized = true;

  // Open the file
  const uri = fileToUri(filePath);
  const content = readFileSync(filePath, "utf-8");
  sendNotification(client, "textDocument/didOpen", {
    textDocument: {
      uri,
      languageId: detectLanguage(filePath),
      version: 1,
      text: content,
    },
  });
  client.openFiles.add(filePath);

  // Wait briefly for server to process didOpen
  await new Promise((r) => setTimeout(r, 300));

  _client = client;
  return client;
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescriptreact",
    ".js": "javascript",
    ".jsx": "javascriptreact",
    ".json": "json",
    ".go": "go",
    ".py": "python",
    ".rs": "rust",
    ".css": "css",
    ".html": "html",
    ".md": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
  };
  return map[ext] ?? "plaintext";
}

/**
 * Shut down the active LSP client. Exported as the session-teardown seam —
 * the transport's close() calls it so a closed session never leaves a
 * language server running.
 */
export function shutdownLspClient(): void {
  if (!_client) return;
  try {
    sendNotification(_client, "exit", {});
    _client.process.kill();
  } catch {
    // best effort
  }
  _client = null;
}

// ── Formatting helpers ──────────────────────────────────────────────────────

interface Location {
  uri: string;
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

function formatLocation(loc: Location): string {
  const file = uriToFile(loc.uri);
  const l = loc.range.start.line + 1;
  const c = loc.range.start.character + 1;
  return `${file}:${l}:${c}`;
}

function formatLocations(locations: Location[]): string {
  if (locations.length === 0) return "No results.";
  return locations.map(formatLocation).join("\n");
}

function formatHover(hover: { contents: unknown; range?: unknown }): string {
  if (!hover?.contents) return "No hover information.";
  if (typeof hover.contents === "string") return hover.contents;
  if (Array.isArray(hover.contents)) {
    return hover.contents
      .map((c: { value: string } | string) => (typeof c === "string" ? c : c.value))
      .join("\n");
  }
  if (typeof hover.contents === "object" && hover.contents !== null) {
    const hc = hover.contents as { kind: string; value: string };
    return hc.value;
  }
  return JSON.stringify(hover.contents);
}

interface Diagnostic {
  range: { start: { line: number; character: number }; end: { line: number; character: number } };
  severity?: number;
  message: string;
  source?: string;
}

function formatDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return "No diagnostics.";
  const severityLabel = (s?: number): string => {
    if (s === 1) return "ERROR";
    if (s === 2) return "WARN";
    if (s === 3) return "INFO";
    return "HINT";
  };
  return diagnostics
    .map((d) => {
      const l = d.range.start.line + 1;
      const c = d.range.start.character + 1;
      return `[${severityLabel(d.severity)}] ${d.source ?? ""}:${l}:${c} — ${d.message}`;
    })
    .join("\n");
}

interface SymbolInfo {
  name: string;
  kind: number;
  location: Location;
  containerName?: string;
}

function formatSymbols(symbols: SymbolInfo[]): string {
  if (symbols.length === 0) return "No symbols found.";
  return symbols
    .map((s) => `${s.name} (kind ${s.kind}) — ${formatLocation(s.location)}`)
    .join("\n");
}

interface DocumentSymbol {
  name: string;
  kind: number;
  range: { start: { line: number }; end: { line: number } };
  children?: DocumentSymbol[];
}

function formatDocumentSymbols(symbols: DocumentSymbol[], indent = ""): string {
  if (symbols.length === 0) return "No symbols.";
  return symbols
    .map((s) => {
      const l = s.range.start.line + 1;
      const line = `${indent}${s.name} (kind ${s.kind}) :${l}`;
      if (s.children && s.children.length > 0) {
        return line + "\n" + formatDocumentSymbols(s.children, indent + "  ");
      }
      return line;
    })
    .join("\n");
}

// ── Tool definition ─────────────────────────────────────────────────────────

const LspParams = Type.Object({
  action: Type.Union([
    Type.Literal("definition"),
    Type.Literal("references"),
    Type.Literal("hover"),
    Type.Literal("diagnostics"),
    Type.Literal("rename"),
    Type.Literal("symbols"),
    Type.Literal("code_actions"),
    Type.Literal("status"),
    Type.Literal("reload"),
  ], { description: "LSP operation to perform." }),
  file: Type.String({ description: "File path relative to cwd." }),
  line: Type.Optional(Type.Integer({ description: "1-indexed line number.", minimum: 1 })),
  symbol: Type.Optional(Type.String({ description: "Symbol name for rename; substring match for references/symbols." })),
  newName: Type.Optional(Type.String({ description: "New name for rename operation." })),
  query: Type.Optional(Type.String({ description: "Search query for workspace symbols." })),
  timeout: Type.Optional(Type.Integer({ description: "Request timeout in seconds (default 20).", minimum: 1, maximum: 60 })),
});

type LspParamsType = Static<typeof LspParams>;

function textResult(text: string): AgentToolResult<unknown> {
  const content: TextContent[] = [{ type: "text", text }];
  return { content, details: text };
}

export const lspTool = (cwd: string): AgentTool<typeof LspParams, unknown> => ({
  name: "lsp",
  label: "LSP",
  description:
    "Query the language server for symbol-aware code intelligence. " +
    "Operations: definition (go to definition), references (find all usages), " +
    "hover (type info), diagnostics (errors/warnings), rename (symbol rename), " +
    "symbols (document/workspace symbols), code_actions (quick fixes), " +
    "status (server health), reload (restart server). " +
    "Use this instead of grep for symbol-aware lookups — it understands " +
    "shadowing, re-exports, and type information that text search misses.",
  parameters: LspParams,
  async execute(
    _toolCallId: string,
    params: LspParamsType,
    signal?: AbortSignal,
  ): Promise<AgentToolResult<unknown>> {
    const { action, file, line, symbol, newName, query, timeout } = params;

    try {
      // Status and reload don't need a file
      if (action === "status") {
        if (_client) {
          return textResult(`LSP server: active (${_client.initialized ? "initialized" : "starting"}), ${_client.openFiles.size} files open, root ${_client.rootUri}`);
        }
        return textResult("LSP server: not started. Run an LSP operation on a file to auto-start.");
      }

      if (action === "reload") {
        shutdownLspClient();
        return textResult("LSP server shut down. Next operation will auto-start.");
      }

      if (!file) {
        return textResult("Error: file parameter required for this operation.");
      }

      // Confinement: every file arg is routed through the shared canonical
      // containment check (guardPath — same boundary as the file tools). No
      // absolute paths outside cwd, no deny-floor hits; relative paths resolve
      // against the TOOL's cwd, not process.cwd().
      const guard = guardPath(cwd, file);
      if (guard.refusal !== undefined) {
        return textResult(`Error: ${guard.refusal}`);
      }
      const target = guard.target!;

      const client = await ensureClient(cwd, target);
      const uri = fileToUri(target);
      const l = (line ?? 1) - 1; // convert to 0-indexed
      const pos = { line: l, character: symbol ? 0 : 0 };

      // If symbol is provided, try to find its position on the line
      let actualPos = pos;
      if (symbol && line) {
        try {
          const fileContent = readFileSync(target, "utf-8");
          const lines = fileContent.split("\n");
          const targetLine = lines[l];
          if (targetLine) {
            const idx = targetLine.indexOf(symbol);
            if (idx !== -1) {
              actualPos = { line: l, character: idx };
            }
          }
        } catch {
          // fall through to position 0
        }
      }

      switch (action) {
        case "definition": {
          const result = await sendRequest(client, "textDocument/definition", {
            textDocument: { uri },
            position: actualPos,
          }, (timeout ?? 20) * 1000);
          if (Array.isArray(result)) {
            return textResult(formatLocations(result as Location[]));
          }
          if (result && typeof result === "object") {
            return textResult(formatLocations([result as Location]));
          }
          return textResult("No definition found.");
        }

        case "references": {
          const result = await sendRequest(client, "textDocument/references", {
            textDocument: { uri },
            position: actualPos,
            context: { includeDeclaration: false },
          }, (timeout ?? 20) * 1000);
          if (Array.isArray(result)) {
            return textResult(formatLocations(result as Location[]));
          }
          return textResult("No references found.");
        }

        case "hover": {
          const result = await sendRequest(client, "textDocument/hover", {
            textDocument: { uri },
            position: actualPos,
          }, (timeout ?? 20) * 1000);
          return textResult(formatHover(result as { contents: unknown }));
        }

        case "diagnostics": {
          // Wait briefly for diagnostics to arrive after didOpen
          await new Promise((r) => setTimeout(r, 500));
          // Diagnostics arrive as notifications; we collect them from the last publish
          const result = await sendRequest(client, "textDocument/diagnostic", {
            textDocument: { uri },
          }, (timeout ?? 20) * 1000);
          if (result && typeof result === "object") {
            const diagResult = result as { items?: Diagnostic[]; kind?: string };
            if (diagResult.items) {
              return textResult(formatDiagnostics(diagResult.items));
            }
          }
          // Fallback: some servers don't support textDocument/diagnostic
          return textResult("Diagnostics: use lsp status to check server health. The server may publish diagnostics asynchronously.");
        }

        case "rename": {
          if (!newName) {
            return textResult("Error: newName parameter required for rename operation.");
          }
          const result = await sendRequest(client, "textDocument/rename", {
            textDocument: { uri },
            position: actualPos,
            newName,
          }, (timeout ?? 20) * 1000);
          if (result && typeof result === "object") {
            const we = result as { changes?: Record<string, { range: { start: { line: number } }; newText: string }[]> };
            if (we.changes) {
              const edits = Object.entries(we.changes).flatMap(([fileUri, changes]) =>
                changes.map((c) => `${uriToFile(fileUri)}:${c.range.start.line + 1}: ${c.newText}`),
              );
              return textResult(`Rename "${symbol}" → "${newName}":\n${edits.join("\n")}`);
            }
          }
          return textResult("Rename produced no edits.");
        }

        case "symbols": {
          if (query) {
            // Workspace symbol search
            const result = await sendRequest(client, "workspace/symbol", {
              query,
            }, (timeout ?? 20) * 1000);
            if (Array.isArray(result)) {
              return textResult(formatSymbols(result as SymbolInfo[]));
            }
            return textResult("No workspace symbols found.");
          }
          // Document symbols
          const result = await sendRequest(client, "textDocument/documentSymbol", {
            textDocument: { uri },
          }, (timeout ?? 20) * 1000);
          if (Array.isArray(result)) {
            return textResult(formatDocumentSymbols(result as DocumentSymbol[]));
          }
          return textResult("No document symbols found.");
        }

        case "code_actions": {
          const result = await sendRequest(client, "textDocument/codeAction", {
            textDocument: { uri },
            range: {
              start: actualPos,
              end: { line: actualPos.line, character: actualPos.character + 1 },
            },
            context: { diagnostics: [] },
          }, (timeout ?? 20) * 1000);
          if (Array.isArray(result)) {
            const actions = result as { title: string; kind?: string }[];
            if (actions.length === 0) return textResult("No code actions available.");
            return textResult(actions.map((a) => `- ${a.title}${a.kind ? ` (${a.kind})` : ""}`).join("\n"));
          }
          return textResult("No code actions available.");
        }

        default:
          return textResult(`Unknown action: ${action}`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return textResult(`LSP error: ${msg}`);
    }

    // Check abort signal
    if (signal?.aborted) {
      return textResult("LSP operation aborted.");
    }
  },
});