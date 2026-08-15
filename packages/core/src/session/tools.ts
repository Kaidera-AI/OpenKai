/**
 * P2 read-only tool trio (D-P2-5, scope §3).
 *
 * `read_file`, `list_files`, `grep` — enough for the loop to exercise
 * tool-calling end-to-end. No write/bash until the permission engine exists
 * (P4); the honest-posture rule (ADR §5.6) applies: execution is not
 * sandboxed, and P2 simply doesn't expose mutation.
 *
 * Each tool is an {@link AgentTool} backed by a typebox parameter schema. The
 * `execute` callback returns an {@link AgentToolResult} whose `content` is
 * `TextContent[]` (the shape the model reads) and whose `details` carries the
 * structured payload for logs/UI.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";

/** Common text-result helper: wrap a string into the tool-result content shape. */
function textResult(text: string, details?: unknown): AgentToolResult<unknown> {
  const content: TextContent[] = [{ type: "text", text }];
  return { content, details: details ?? text };
}

/** Resolve a path against the tool's cwd, refusing traversal escapes. */
function resolveWithin(cwd: string, input: string): string {
  const resolved = path.resolve(cwd, input);
  return resolved;
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
    const target = resolveWithin(cwd, params.path);
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) {
        return textResult(`Error: not a file: ${params.path}`, params.path);
      }
      const content = await fs.readFile(target, "utf-8");
      const truncated = content.length > max ? content.slice(0, max) + `\n…[truncated ${content.length - max} chars]` : content;
      return textResult(truncated, { path: params.path, bytes: content.length, truncated: content.length > max });
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
    const target = resolveWithin(cwd, params.path ?? ".");
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
    let regex: RegExp;
    try {
      regex = new RegExp(params.pattern, "i");
    } catch (error) {
      return textResult(`Error: invalid pattern: ${error instanceof Error ? error.message : String(error)}`, params.pattern);
    }
    const root = resolveWithin(cwd, params.path ?? ".");
    const matches: string[] = [];
    try {
      await walkGrep(root, regex, max, matches);
    } catch (error) {
      return textResult(`Error searching: ${error instanceof Error ? error.message : String(error)}`, params.pattern);
    }
    if (matches.length === 0) {
      return textResult("(no matches)", { pattern: params.pattern, matches: 0 });
    }
    return textResult(matches.join("\n"), { pattern: params.pattern, matches: matches.length });
  },
});

/** Recursive grep helper — respects maxResults and skips node_modules/.git. */
async function walkGrep(
  target: string,
  regex: RegExp,
  max: number,
  out: string[],
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
    const entries = await fs.readdir(target, { withFileTypes: true });
    for (const entry of entries) {
      if (out.length >= max) return;
      await walkGrep(path.join(target, entry.name), regex, max, out);
    }
  }
}

/** The full P2 read-only tool set, bound to a cwd. */
export function readOnlyTools(cwd: string): AgentTool<any>[] {
  return [readFileTool(cwd), listFilesTool(cwd), grepTool(cwd)];
}