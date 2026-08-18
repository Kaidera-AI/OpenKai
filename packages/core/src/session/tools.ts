/**
 * OpenKai tool set (P2 read trio + P4b gated mutation, scope §3 + §4).
 *
 * Read trio (`read_file`, `list_files`, `grep`) — unchanged since P2; enough for
 * the loop to exercise tool-calling end-to-end without mutation.
 *
 * Gated mutations (`write_file`, `edit_file`, `hashline_edit`, `bash`) — each
 * behind the
 * {@link PermissionGate} + the pure {@link evaluate} policy engine. The P2 block
 * ("no write/bash until the permission engine exists") is now satisfied. The
 * honest-posture rule (ADR §5.6) still applies: execution is not sandboxed, and
 * the gate is **consent, not a sandbox** — approving a `bash` call runs it
 * unsandboxed. Denial is a refusal result returned to the model, not a throw.
 *
 * Each tool is an {@link AgentTool} backed by a typebox parameter schema. The
 * `execute` callback returns an {@link AgentToolResult} whose `content` is
 * `TextContent[]` (the shape the model reads) and whose `details` carries the
 * structured payload for logs/UI.
 *
 * Hardening posture (ren's adversarial review):
 *  - `read_file` stats first and reads at most `maxBytes` (+1 sentinel) off
 *    disk — a multi-GB target is never buffered whole.
 *  - `web_fetch` runs under a 30 s AbortSignal timeout and caps the response
 *    read at 1 MiB before truncating to `maxBytes` for output.
 *  - `grep` rejects patterns over 500 chars. ReDoS posture: patterns are
 *    model-authored and run in-process on bounded file reads; the length cap
 *    plus per-file/result caps keep a catastrophic-backtracking pattern a
 *    latency problem, not a process-killer. No full ReDoS proof is attempted.
 *  - `grep`/`glob` walkers carry a visited-realpath set, so an in-cwd symlink
 *    cycle (a/sub -> a) terminates instead of recursing forever.
 *  - `bash` honours the pi-agent-core AbortSignal (kills the child) and has a
 *    120 s default exec timeout, param-overridable.
 *  - `write_file` re-canonicalises its target AFTER approval (TOCTOU window).
 */

import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { PermissionGate } from "./permission-gate.js";
import type { PermissionPreview } from "./transport.js";
import { floorDeny, resolveCanonical } from "./permissions.js";
import { buildDiffPreview, readForPreview, resolvePreviewPath } from "./permission-gate.js";
import { hashlineEditTool } from "./hashline.js";
import { lspTool } from "./lsp.js";
import { discoverMcpTools, mcpStatusTool } from "./mcp.js";
import { taskTool } from "./task.js";
import { DEFAULT_MODEL_ID } from "./local-transport.js";
import type { CastConfig } from "../fusion/casts.js";

/** Common text-result helper: wrap a string into the tool-result content shape. */
function textResult(text: string, details?: unknown): AgentToolResult<unknown> {
  const content: TextContent[] = [{ type: "text", text }];
  return { content, details: details ?? text };
}

/** Resolve a path against the tool's cwd, refusing traversal escapes. */
function resolveWithin(cwd: string, input: string): string {
  // Canonical (symlink-following) resolution — lexical-only checks pass
  // in-cwd symlinks pointing outside (E001 security finding 1).
  const canonicalCwd = resolveCanonical(cwd, ".");
  const resolved = resolveCanonical(cwd, input);
  if (resolved !== canonicalCwd && !resolved.startsWith(canonicalCwd + path.sep)) {
    throw new Error(`path escapes working directory: ${input}`);
  }
  return resolved;
}

/**
 * Resolve + floor-check in one step, returning the refusal text when the
 * path is out of bounds (containment escape OR deny-floor hit). The floor
 * applies to every tool — read-only included; it is a boundary, not a
 * permission decision (E001 security findings 1–2).
 *
 * Exported for the sibling tools that need the identical boundary
 * (hashline_edit's pre-read guard, the LSP tool's file confinement) — one
 * implementation, no drift.
 */
export function guardPath(cwd: string, input: string): { target?: string; refusal?: string } {
  let target: string;
  try {
    target = resolveWithin(cwd, input);
  } catch (error) {
    return { refusal: error instanceof Error ? error.message : String(error) };
  }
  const floor = floorDeny(cwd, input);
  if (floor !== undefined) {
    return { refusal: `denied — protected path (${floor}): ${input}` };
  }
  return { target };
}

const ReadFileParams = Type.Object({
  path: Type.String({ description: "File path relative to cwd." }),
  maxBytes: Type.Optional(
    Type.Integer({ description: "Cap output size in bytes (default 65536).", minimum: 1 }),
  ),
});

/** read_file: read a UTF-8 file and return its (truncated) text. */
export const readFileTool = (cwd: string): AgentTool<typeof ReadFileParams, unknown> => ({
  name: "read_file",
  label: "Read File",
  description:
    "Read a UTF-8 text file and return its contents (truncated to maxBytes, default 64KiB).",
  parameters: ReadFileParams,
  async execute(
    _toolCallId: string,
    params: Static<typeof ReadFileParams>,
  ): Promise<AgentToolResult<unknown>> {
    const max = params.maxBytes ?? 65536;
    const guard = guardPath(cwd, params.path);
    if (guard.refusal !== undefined) {
      return textResult(`Error: ${guard.refusal}`, { path: params.path, denied: true });
    }
    const target = guard.target!;
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) {
        return textResult(`Error: not a file: ${params.path}`, params.path);
      }
      // Bounded read: open + read at most `max` bytes (+1 sentinel to detect
      // truncation) so a multi-GB target is never buffered whole.
      const handle = await fs.open(target, "r");
      let raw: string;
      let truncated: boolean;
      try {
        const buf = Buffer.alloc(Math.min(stat.size, max + 1));
        const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
        truncated = stat.size > max;
        raw = buf.subarray(0, truncated ? Math.min(bytesRead, max) : bytesRead).toString("utf-8");
      } finally {
        await handle.close();
      }
      // A mid-codepoint slice leaves a trailing U+FFFD — drop it.
      const content = raw.endsWith("�") ? raw.slice(0, -1) : raw;
      const text = truncated ? content + `\n…[truncated at ${max} bytes]` : content;
      return textResult(text, { path: params.path, bytes: stat.size, truncated });
    } catch (error) {
      return textResult(`Error reading ${params.path}: ${error instanceof Error ? error.message : String(error)}`, params.path);
    }
  },
});

const ListFilesParams = Type.Object({
  path: Type.Optional(
    Type.String({ description: "Directory path relative to cwd (default: cwd)." }),
  ),
});

/** list_files: list direct children of a directory. */
export const listFilesTool = (cwd: string): AgentTool<typeof ListFilesParams, unknown> => ({
  name: "list_files",
  label: "List Files",
  description: "List the direct children (files and directories) of a path.",
  parameters: ListFilesParams,
  async execute(
    _toolCallId: string,
    params: Static<typeof ListFilesParams>,
  ): Promise<AgentToolResult<unknown>> {
    const guard = guardPath(cwd, params.path ?? ".");
    if (guard.refusal !== undefined) {
      return textResult(`Error: ${guard.refusal}`, { path: params.path ?? ".", denied: true });
    }
    const target = guard.target!;
    try {
      const entries = await fs.readdir(target, { withFileTypes: true });
      const lines = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name)).sort();
      return textResult(lines.join("\n") || "(empty directory)", { path: params.path ?? ".", count: lines.length });
    } catch (error) {
      return textResult(`Error listing ${params.path ?? "."}: ${error instanceof Error ? error.message : String(error)}`, params.path);
    }
  },
});

const GrepParams = Type.Object({
  pattern: Type.String({ description: "RegExp pattern to search for." }),
  path: Type.Optional(
    Type.String({ description: "File or directory to search (default: cwd)." }),
  ),
  maxResults: Type.Optional(
    Type.Integer({ description: "Max matches (default 50).", minimum: 1 }),
  ),
});

/** grep: search file contents for a RegExp pattern (no shell, pure JS). */
export const grepTool = (cwd: string): AgentTool<typeof GrepParams, unknown> => ({
  name: "grep",
  label: "Grep",
  description:
    "Search file contents for a RegExp pattern. Returns matching lines with file:line prefixes. Searches one file or recursively under a directory.",
  parameters: GrepParams,
  async execute(
    _toolCallId: string,
    params: Static<typeof GrepParams>,
  ): Promise<AgentToolResult<unknown>> {
    const max = params.maxResults ?? 50;
    // Pattern cost cap (ReDoS posture, see header): model-authored patterns
    // run in-process; reject pathological-length patterns outright.
    if (params.pattern.length > 500) {
      return textResult(`Error: pattern too long (${params.pattern.length} > 500 chars)`, params.pattern);
    }
    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, "i");
    } catch (error) {
      return textResult(`Error: invalid pattern: ${error instanceof Error ? error.message : String(error)}`, params.pattern);
    }
    const guard = guardPath(cwd, params.path ?? ".");
    if (guard.refusal !== undefined) {
      return textResult(`Error: ${guard.refusal}`, { pattern: params.pattern, denied: true });
    }
    const root = guard.target!;
    const matches: string[] = [];
    try {
      await walkGrep(root, regex, max, matches, cwd);
    } catch (error) {
      return textResult(`Error searching: ${error instanceof Error ? error.message : String(error)}`, params.pattern);
    }
    if (matches.length === 0) {
      return textResult("(no matches)", { pattern: params.pattern, matches: 0 });
    }
    return textResult(matches.join("\n"), { pattern: params.pattern, matches: matches.length });
  },
});

/** Recursive grep helper — respects maxResults; skips node_modules/.git/dist,
 *  symlink escapes, and deny-floor files (.env, keys, …) at every step.
 *  `visited` holds directory realpaths: an in-cwd symlink cycle passes the
 *  containment check but must not recurse forever. */
async function walkGrep(
  target: string,
  regex: RegExp,
  max: number,
  out: string[],
  cwd: string,
  visited: Set<string> = new Set(),
): Promise<void> {
  if (out.length >= max) return;
  const stat = await fs.stat(target);
  if (stat.isFile()) {
    let content: string;
    try {
      content = await fs.readFile(target, "utf-8");
    } catch {
      return; // binary or unreadable — skip
    }
    const lines = content.split("\n");
    for (let i = 0; i < lines.length && out.length < max; i += 1) {
      if (regex.test(lines[i]!)) {
        out.push(`${path.relative(process.cwd(), target)}:${i + 1}:${lines[i]!.slice(0, 500)}`);
      }
    }
    return;
  }
  if (stat.isDirectory()) {
    const base = path.basename(target);
    if (base === "node_modules" || base === ".git" || base === "dist") return;
    // Symlink-cycle guard: each real directory is walked once.
    const real = await fs.realpath(target);
    if (visited.has(real)) return;
    visited.add(real);
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= max) return;
      // Re-guard every child: a symlinked directory mid-walk must not lead
      // outside cwd, and floor files are never read.
      const child = path.join(target, entry.name);
      const guard = guardPath(cwd, child);
      if (guard.refusal !== undefined) continue;
      await walkGrep(child, regex, max, out, cwd, visited);
    }
  }
}

// ── E008 lifted tools: glob / web_fetch / todo (ren's OMP research) ────────

const GlobParams = Type.Object({
  pattern: Type.String({ description: "Glob pattern, e.g. 'src/**/*.ts'." }),
  path: Type.Optional(Type.String({ description: "Root directory relative to cwd (default: cwd)." })),
  maxResults: Type.Optional(Type.Integer({ description: "Cap results (default 100).", minimum: 1 })),
});

/** glob: match files under a directory by glob pattern (no new deps). */
export const globTool = (cwd: string): AgentTool<typeof GlobParams, unknown> => ({
  name: "glob",
  label: "Glob",
  description: "Find files matching a glob pattern (e.g. 'src/**/*.ts'). Returns matching paths.",
  parameters: GlobParams,
  async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
    const max = params.maxResults ?? 100;
    const guard = guardPath(cwd, params.path ?? ".");
    if (guard.refusal !== undefined) return textResult(`Error: ${guard.refusal}`, { denied: true });
    const regex = globToRegex(params.pattern);
    const out: string[] = [];
    try {
      await walkGlob(guard.target!, regex, max, out, cwd);
    } catch (error) {
      return textResult(`Error globbing: ${error instanceof Error ? error.message : String(error)}`, params.pattern);
    }
    if (out.length === 0) return textResult("(no matches)", { pattern: params.pattern, matches: 0 });
    return textResult(out.join("\n"), { pattern: params.pattern, matches: out.length });
  },
});

/** Convert a glob to a RegExp: ** → any depth, * → segment, ? → one char. */
function globToRegex(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i]!;
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i += 1;
        if (pattern[i + 1] === "/") i += 1;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if ("\\^$.|+()[]{}".includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`(^|/)${re}$`);
}

async function walkGlob(target: string, regex: RegExp, max: number, out: string[], cwd: string, visited: Set<string> = new Set()): Promise<void> {
  if (out.length >= max) return;
  const stat = await fs.stat(target);
  if (stat.isFile()) {
    const rel = path.relative(cwd, target);
    if (regex.test(rel) || regex.test(path.basename(target))) out.push(rel);
    return;
  }
  if (stat.isDirectory()) {
    const base = path.basename(target);
    if (base === "node_modules" || base === ".git" || base === "dist") return;
    // Symlink-cycle guard: each real directory is walked once.
    const real = await fs.realpath(target);
    if (visited.has(real)) return;
    visited.add(real);
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= max) return;
      const child = path.join(target, entry.name);
      const guard = guardPath(cwd, child);
      if (guard.refusal !== undefined) continue;
      await walkGlob(child, regex, max, out, cwd, visited);
    }
  }
}

const WebFetchParams = Type.Object({
  url: Type.String({ description: "Absolute http(s) URL to fetch." }),
  maxBytes: Type.Optional(Type.Integer({ description: "Cap body size in bytes (default 65536).", minimum: 1 })),
});

/** web_fetch: GET a URL and return the body as text (read-only). */
export const webFetchTool = (cwd: string): AgentTool<typeof WebFetchParams, unknown> => ({
  name: "web_fetch",
  label: "Web Fetch",
  description: "Fetch a URL over HTTP(S) and return the response body as text (truncated to maxBytes).",
  parameters: WebFetchParams,
  async execute(_toolCallId, params, signal?: AbortSignal): Promise<AgentToolResult<unknown>> {
    void cwd;
    const max = params.maxBytes ?? 65536;
    let url: URL;
    try {
      url = new URL(params.url);
    } catch {
      return textResult(`Error: invalid URL: ${params.url}`, params.url);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return textResult("Error: only http(s) URLs are supported", params.url);
    }
    // 30 s wall-clock timeout + 1 MiB response-read cap: a slow or endless
    // endpoint must not stall the turn or balloon memory. The caller's signal
    // (task timeout / session abort) joins the timeout's (K3: in-flight tools
    // used to outlive the abort by up to one full fetch).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    const onCallerAbort = (): void => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", onCallerAbort, { once: true });
    try {
      const res = await fetch(url, { redirect: "follow", signal: controller.signal });
      const CAP = 1 << 20; // 1 MiB read cap
      const chunks: Uint8Array[] = [];
      let received = 0;
      let readCapped = false;
      const reader = res.body?.getReader();
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > CAP) {
            chunks.push(value.subarray(0, value.byteLength - (received - CAP)));
            readCapped = true;
            await reader.cancel().catch(() => undefined);
            break;
          }
          chunks.push(value);
        }
      }
      const body = Buffer.concat(chunks).toString("utf-8");
      const truncated = body.length > max ? body.slice(0, max) + `\n…[truncated ${body.length - max} chars]` : body;
      const suffix = readCapped && body.length <= max ? "\n…[response capped at 1MiB]" : "";
      return textResult(truncated + suffix, { url: params.url, status: res.status, bytes: body.length, readCapped });
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const msg = isTimeout ? (signal?.aborted ? "aborted" : "timed out after 30s") : error instanceof Error ? error.message : String(error);
      return textResult(`Error fetching ${params.url}: ${msg}`, params.url);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
    }
  },
});

const TodoParams = Type.Object({
  op: Type.Union([Type.Literal("add"), Type.Literal("done"), Type.Literal("list"), Type.Literal("clear")], {
    description: "add | done | list | clear",
  }),
  text: Type.Optional(Type.String({ description: "Todo text (for add) or index (for done)." })),
});

/** todo: a shared per-project task list in .openkai/memory/todo.md (multi-instance aware). */
export const todoTool = (cwd: string): AgentTool<typeof TodoParams, unknown> => ({
  name: "todo",
  label: "Todo",
  description: "Manage a shared project task list (add/done/list/clear) in .openkai/memory/todo.md.",
  parameters: TodoParams,
  async execute(_toolCallId, params): Promise<AgentToolResult<unknown>> {
    const file = path.join(cwd, ".openkai", "memory", "todo.md");
    await fs.mkdir(path.dirname(file), { recursive: true });
    const read = async (): Promise<string[]> => {
      try {
        return (await fs.readFile(file, "utf-8")).split("\n").filter((l) => l.startsWith("- ["));
      } catch {
        return [];
      }
    };
    if (params.op === "list") {
      const items = await read();
      return textResult(items.length ? items.join("\n") : "(no todos)", { count: items.length });
    }
    if (params.op === "clear") {
      await fs.writeFile(file, "# Todos\n", "utf-8");
      return textResult("todos cleared", { count: 0 });
    }
    if (params.op === "add") {
      if (!params.text) return textResult("Error: add needs text", params.op);
      await fs.appendFile(file, `- [ ] ${params.text.replace(/\s+/g, " ").trim()}\n`, "utf-8");
      return textResult(`added: ${params.text}`, { op: "add" });
    }
    const items = await read();
    const idx = parseInt(params.text ?? "", 10);
    if (Number.isNaN(idx) || idx < 0 || idx >= items.length) {
      return textResult(`Error: done needs a valid index 0..${items.length - 1}`, params.op);
    }
    items[idx] = items[idx]!.replace("- [ ]", "- [x]");
    await fs.writeFile(file, `# Todos\n${items.join("\n")}\n`, "utf-8");
    return textResult(`done: ${items[idx]}`, { op: "done" });
  },
});

/** The read-only tool set, bound to a cwd (v1-compat path for `openkai chat`). */
export function readOnlyTools(cwd: string): AgentTool<any>[] {
  return [readFileTool(cwd), listFilesTool(cwd), grepTool(cwd), globTool(cwd), webFetchTool(cwd), todoTool(cwd), lspTool(cwd)];
}

// ── P4b gated tools: write_file / edit_file / bash (scope §4) ───────────────

/**
 * Hooks fired around gated mutations. `beforeMutation` runs AFTER approval,
 * BEFORE the mutation — the shadow-git snapshot seam (Inc 05). Hook failures
 * are swallowed by the caller: undo must never block an approved mutation.
 */
export interface MutationHooks {
  beforeMutation?: (tool: string, summary: string) => Promise<void>;
}

const WriteFileParams = Type.Object({
  path: Type.String({ description: "File path relative to cwd." }),
  content: Type.String({ description: "Full file content to write." }),
});

/** write_file: full-file write behind the permission gate; preview is a diff. */
export function writeFileTool(
  cwd: string,
  gate: PermissionGate,
  hooks?: MutationHooks,
): AgentTool<typeof WriteFileParams, unknown> {
  return {
    name: "write_file",
    label: "Write File",
    description:
      "Write full content to a file (overwriting). Requires operator approval; the preview shows a diff against the current content.",
    parameters: WriteFileParams,
    async execute(_id, params): Promise<AgentToolResult<unknown>> {
      const abs = resolvePreviewPath(cwd, params.path);
      const outcome = await gate.request("write_file", _id, params, async () => {
        const before = await readForPreview(abs);
        return buildDiffPreview(abs, before, params.content);
      });
      if (outcome.decision === "reject") {
        return textResult(`Permission denied: ${outcome.reason}`, { path: params.path, denied: true });
      }
      // TOCTOU: re-canonicalise AFTER approval — the path the operator saw in
      // the preview and the path on disk may have diverged (symlink swap)
      // between the preview read and this write.
      const postGuard = guardPath(cwd, params.path);
      if (postGuard.refusal !== undefined) {
        return textResult(`Permission denied: ${postGuard.refusal}`, { path: params.path, denied: true });
      }
      const target = postGuard.target!;
      try {
        if (hooks?.beforeMutation) {
          await hooks.beforeMutation("write_file", params.path).catch(() => undefined);
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, params.content, "utf-8");
        return textResult(`Wrote ${params.path} (${params.content.length} bytes)`, {
          path: params.path,
          bytes: params.content.length,
        });
      } catch (error) {
        return textResult(`Error writing ${params.path}: ${error instanceof Error ? error.message : String(error)}`, params.path);
      }
    },
  };
}

const EditFileParams = Type.Object({
  path: Type.String({ description: "File path relative to cwd." }),
  oldString: Type.String({ description: "Exact text to replace (must match once)." }),
  newString: Type.String({ description: "Replacement text." }),
});

/** edit_file: exact-match single replace behind the gate; preview is the diff. */
export function editFileTool(
  cwd: string,
  gate: PermissionGate,
  hooks?: MutationHooks,
): AgentTool<typeof EditFileParams, unknown> {
  return {
    name: "edit_file",
    label: "Edit File",
    description:
      "Replace one exact occurrence of oldString with newString in a file. Errors if the match is absent or ambiguous. Requires operator approval.",
    parameters: EditFileParams,
    async execute(_id, params): Promise<AgentToolResult<unknown>> {
      // Boundary check BEFORE any read: reading first turns the error text into
      // a confirmed-guess oracle over floor files and outside-cwd paths — a
      // correct `oldString` guess reads back differently from a wrong one, and
      // the ambiguous branch leaks a match count (E001 findings F5/F5b). Every
      // out-of-bounds path now returns the same path-derived refusal.
      const guard = guardPath(cwd, params.path);
      if (guard.refusal !== undefined) {
        return textResult(`Permission denied: ${guard.refusal}`, { path: params.path, denied: true });
      }
      const abs = guard.target!;
      let before = "";
      try {
        before = await fs.readFile(abs, "utf-8");
      } catch (error) {
        return textResult(`Error reading ${params.path}: ${error instanceof Error ? error.message : String(error)}`, params.path);
      }
      const occurrences = countOccurrences(before, params.oldString);
      if (occurrences === 0) {
        return textResult(`Error: oldString not found in ${params.path}`, { path: params.path, matches: 0 });
      }
      if (occurrences > 1) {
        return textResult(`Error: oldString is ambiguous (${occurrences} matches) in ${params.path}`, {
          path: params.path,
          matches: occurrences,
        });
      }
      const after = before.replace(params.oldString, params.newString);
      const outcome = await gate.request("edit_file", _id, params, async () => buildDiffPreview(abs, before, after));
      if (outcome.decision === "reject") {
        return textResult(`Permission denied: ${outcome.reason}`, { path: params.path, denied: true });
      }
      try {
        if (hooks?.beforeMutation) {
          await hooks.beforeMutation("edit_file", params.path).catch(() => undefined);
        }
        await fs.writeFile(abs, after, "utf-8");
        return textResult(`Edited ${params.path} (${params.oldString.length} → ${params.newString.length} chars)`, {
          path: params.path,
          replaced: 1,
        });
      } catch (error) {
        return textResult(`Error writing ${params.path}: ${error instanceof Error ? error.message : String(error)}`, params.path);
      }
    },
  };
}

const BashParams = Type.Object({
  command: Type.String({ description: "Shell command to execute (unsandboxed)." }),
  cwd: Type.Optional(Type.String({ description: "Working directory (default: session cwd)." })),
  timeoutSeconds: Type.Optional(
    Type.Integer({ description: "Exec timeout in seconds (default 120). The child is killed on timeout or abort.", minimum: 1 }),
  ),
});

/** bash: unsandboxed shell behind the gate (ADR §5.6 honest posture). */
export function bashTool(
  cwd: string,
  gate: PermissionGate,
  hooks?: MutationHooks,
): AgentTool<typeof BashParams, unknown> {
  return {
    name: "bash",
    label: "Bash",
    description:
      "Run a shell command. Execution is NOT sandboxed (honest posture, ADR §5.6). Requires operator approval; the preview shows the command and resolved cwd.",
    parameters: BashParams,
    async execute(_id, params, signal): Promise<AgentToolResult<unknown>> {
      const runCwd = params.cwd ? resolvePreviewPath(cwd, params.cwd) : cwd;
      const outcome = await gate.request("bash", _id, params, (): PermissionPreview => ({
        kind: "command",
        command: params.command,
        cwd: runCwd,
      }));
      if (outcome.decision === "reject") {
        return textResult(`Permission denied: ${outcome.reason}`, { command: params.command, denied: true });
      }
      try {
        // A model-hallucinated cwd must not reach posix_spawn raw: report it
        // as a clean tool error instead.
        const stat = await fs.stat(runCwd).catch(() => undefined);
        if (!stat?.isDirectory()) {
          return textResult(`Error: cwd does not exist: ${runCwd}`, {
            command: params.command,
            cwd: runCwd,
            exitOk: false,
          });
        }
        if (hooks?.beforeMutation) {
          await hooks.beforeMutation("bash", params.command).catch(() => undefined);
        }
        const { stdout, stderr } = await runShell(params.command, runCwd, {
          timeoutMs: (params.timeoutSeconds ?? 120) * 1000,
          signal,
        });
        const out = (stdout + (stderr ? (stderr.endsWith("\n") ? stderr : stderr + "\n") : "")).trim();
        return textResult(out.length > 0 ? out : "(no output)", {
          command: params.command,
          cwd: runCwd,
          exitOk: true,
        });
      } catch (error) {
        return textResult(`Error: ${error instanceof Error ? error.message : String(error)}`, {
          command: params.command,
          cwd: runCwd,
          exitOk: false,
        });
      }
    },
  };
}

/** Count non-overlapping occurrences of `needle` in `hay`. */
function countOccurrences(hay: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let i = 0;
  while (true) {
    const at = hay.indexOf(needle, i);
    if (at === -1) break;
    count += 1;
    i = at + needle.length;
  }
  return count;
}

/**
 * Promise wrapper around `node:child_process` exec with a byte cap, a wall-clock
 * timeout, and abort passthrough: on timeout or signal-abort the child is
 * SIGTERM'd so a hung pipeline cannot outlive its turn.
 */
function runShell(
  command: string,
  cwd: string,
  opts: { timeoutMs: number; signal?: AbortSignal },
): Promise<{ stdout: string; stderr: string }> {
  const { promise, resolve, reject } = Promise.withResolvers<{ stdout: string; stderr: string }>();
  let settled = false;
  const child = exec(command, { cwd, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    if (err) reject(err);
    else resolve({ stdout, stderr });
  });
  const kill = (why: string): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
    child.kill("SIGTERM");
    reject(new Error(why));
  };
  const onAbort = (): void => kill("aborted");
  const timer = setTimeout(() => kill(`timed out after ${opts.timeoutMs}ms`), opts.timeoutMs);
  if (opts.signal?.aborted) kill("aborted");
  else opts.signal?.addEventListener("abort", onAbort, { once: true });
  return promise;
}

/**
 * The full tool set (E008: + glob/web_fetch/todo/hashline_edit/task,
 * E009: + lsp, E010: + mcp), bound to a cwd and a {@link PermissionGate}.
 * Used by the TUI; `openkai chat` keeps {@link readOnlyTools}.
 * `extraTools` is for dynamically discovered tools (MCP servers).
 * `castConfig` feeds the task tool's stage→model resolution (operator casts).
 */
export function gatedTools(cwd: string, gate: PermissionGate, hooks?: MutationHooks, modelId?: string, extraTools: AgentTool<any>[] = [], castConfig?: CastConfig): AgentTool<any>[] {
  // K3: the fallback child model must resolve under the transport's default
  // provider — the previous literal ('openrouter/google/…') is not a
  // catalogue id under openrouter, so a modelId-less construction was dead.
  const childModel = modelId ?? DEFAULT_MODEL_ID;
  return [readFileTool(cwd), listFilesTool(cwd), grepTool(cwd), globTool(cwd), webFetchTool(cwd), todoTool(cwd), hashlineEditTool(cwd, gate, hooks), lspTool(cwd), mcpStatusTool(), taskTool(cwd, childModel, { castConfig }), ...extraTools, writeFileTool(cwd, gate, hooks), editFileTool(cwd, gate, hooks), bashTool(cwd, gate, hooks)];
}

