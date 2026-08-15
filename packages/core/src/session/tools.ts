/**
 * OpenKai tool set (P2 read trio + P4b gated mutation, scope §3 + §4).
 *
 * Read trio (`read_file`, `list_files`, `grep`) — unchanged since P2; enough for
 * the loop to exercise tool-calling end-to-end without mutation.
 *
 * Gated trio (`write_file`, `edit_file`, `bash`) — added in P4b, each behind the
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
 */
function guardPath(cwd: string, input: string): { target?: string; refusal?: string } {
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
 *  symlink escapes, and deny-floor files (.env, keys, …) at every step. */
async function walkGrep(
  target: string,
  regex: RegExp,
  max: number,
  out: string[],
  cwd: string,
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
      // Re-guard every child: a symlinked directory mid-walk must not lead
      // outside cwd, and floor files are never read.
      const child = path.join(target, entry.name);
      const guard = guardPath(cwd, child);
      if (guard.refusal !== undefined) continue;
      await walkGrep(child, regex, max, out, cwd);
    }
  }
}

/** The P2 read-only tool set, bound to a cwd (v1-compat path for `openkai chat`). */
export function readOnlyTools(cwd: string): AgentTool<any>[] {
  return [readFileTool(cwd), listFilesTool(cwd), grepTool(cwd)];
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
      try {
        if (hooks?.beforeMutation) {
          await hooks.beforeMutation("write_file", params.path).catch(() => undefined);
        }
        await fs.mkdir(path.dirname(abs), { recursive: true });
        await fs.writeFile(abs, params.content, "utf-8");
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
      const abs = resolvePreviewPath(cwd, params.path);
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
    async execute(_id, params): Promise<AgentToolResult<unknown>> {
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
        if (hooks?.beforeMutation) {
          await hooks.beforeMutation("bash", params.command).catch(() => undefined);
        }
        const { stdout, stderr } = await runShell(params.command, runCwd);
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

/** Promise wrapper around `node:child_process` exec with a byte cap. */
function runShell(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(command, { cwd, maxBuffer: 1 << 20 }, (err, stdout, stderr) => {
      if (err) reject(err);
      else resolve({ stdout, stderr });
    });
  });
}

/**
 * The full P4b tool set: read trio + gated write/edit/bash, bound to a cwd and
 * a {@link PermissionGate}. Used by the TUI; `openkai chat` keeps
 * {@link readOnlyTools} (v1-compat — no approval channel in print mode).
 */
export function gatedTools(cwd: string, gate: PermissionGate, hooks?: MutationHooks): AgentTool<any>[] {
  return [readFileTool(cwd), listFilesTool(cwd), grepTool(cwd), writeFileTool(cwd, gate, hooks), editFileTool(cwd, gate, hooks), bashTool(cwd, gate, hooks)];
}