/**
 * Hashline structured edits (E008, lifted from omp's `packages/hashline`
 * format): read a file as numbered `LINE:TEXT` rows under a content-derived
 * `[path#TAG]` header; edit by naming line ranges (`PUT N.=M:` replaces,
 * `CUT N.=M` deletes) with the TAG validated against the live file. Numbers
 * are the ORIGINAL lines, so a stale read is refused instead of silently
 * mis-applying. This is omp's core DX win — no fuzzy old_string matching.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";

/** Content-derived 4-hex tag binding a read to the exact file state. */
export function fileTag(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 4);
}

/** Render a file as numbered rows under its `[path#TAG]` header. */
export function formatHashline(relPath: string, content: string): string {
  const tag = fileTag(content);
  const lines = content.split("\n");
  const numbered = lines.map((line, i) => `${i + 1}:${line}`);
  return `[${relPath}#${tag}]\n${numbered.join("\n")}`;
}

export interface Hunk {
  /** "PUT" replaces the inclusive range with `body`; "CUT" deletes it. */
  op: "PUT" | "CUT";
  /** 1-based inclusive start line (original numbering). */
  start: number;
  /** 1-based inclusive end line (original numbering). */
  end: number;
  /** Replacement rows (PUT only). */
  body?: string[];
}

/**
 * Apply hunks to `content`, validating `tag` first. Returns the new content
 * or an error string. Hunks must be disjoint and in ascending order.
 */
export function applyHashline(content: string, tag: string, hunks: Hunk[]): { content?: string; error?: string } {
  if (fileTag(content) !== tag) {
    return { error: `stale tag #${tag} — the file changed since it was read; re-read and retry` };
  }
  const lines = content.split("\n");
  const sorted = [...hunks].sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.start <= sorted[i - 1]!.end) {
      return { error: `overlapping hunks at line ${sorted[i]!.start}` };
    }
  }
  const out: string[] = [];
  let cursor = 0; // 0-based index into lines
  for (const hunk of sorted) {
    if (hunk.start < 1 || hunk.end > lines.length || hunk.start > hunk.end) {
      return { error: `hunk out of range: ${hunk.start}.=${hunk.end} (file has ${lines.length} lines)` };
    }
    out.push(...lines.slice(cursor, hunk.start - 1));
    if (hunk.op === "PUT") out.push(...(hunk.body ?? []));
    cursor = hunk.end; // CUT skips [start..end]; PUT replaces it
  }
  out.push(...lines.slice(cursor));
  return { content: out.join("\n") };
}

const HashlineParams = Type.Object({
  op: Type.Union([Type.Literal("read"), Type.Literal("edit")], { description: "read | edit" }),
  path: Type.String({ description: "File path relative to cwd." }),
  tag: Type.Optional(Type.String({ description: "The #TAG from a prior read (required for edit)." })),
  hunks: Type.Optional(
    Type.Array(
      Type.Object({
        op: Type.Union([Type.Literal("PUT"), Type.Literal("CUT")]),
        start: Type.Integer({ minimum: 1 }),
        end: Type.Integer({ minimum: 1 }),
        body: Type.Optional(Type.Array(Type.String())),
      }),
      { description: "Edit hunks over ORIGINAL line numbers (edit op)." },
    ),
  ),
});

/** hashline_edit: line-anchored structured edits with staleness validation. */
export function hashlineEditTool(cwd: string): AgentTool<typeof HashlineParams, unknown> {
  const textResult = (text: string, details?: unknown) => ({
    content: [{ type: "text", text } as TextContent],
    details,
  });
  return {
    name: "hashline_edit",
    label: "Hashline Edit",
    description:
      "Structured line-anchored edits. op=read returns numbered LINE:TEXT rows under [path#TAG]. op=edit applies PUT/CUT hunks over the ORIGINAL line numbers, refusing a stale #TAG. No fuzzy matching — exact and safe.",
    parameters: HashlineParams,
    async execute(_toolCallId, params: Static<typeof HashlineParams>) {
      const target = path.resolve(cwd, params.path);
      if (!target.startsWith(path.resolve(cwd))) {
        return textResult(`Error: path escapes cwd: ${params.path}`, { denied: true });
      }
      let content: string;
      try {
        content = await fs.readFile(target, "utf-8");
      } catch {
        return textResult(`Error: cannot read ${params.path}`, params.path);
      }
      if (params.op === "read") {
        return textResult(formatHashline(params.path, content), { path: params.path, tag: fileTag(content) });
      }
      if (!params.tag) return textResult("Error: edit needs the #TAG from a prior read", params.op);
      const result = applyHashline(content, params.tag, (params.hunks ?? []) as Hunk[]);
      if (result.error) return textResult(`Error: ${result.error}`, { path: params.path });
      await fs.writeFile(target, result.content!, "utf-8");
      const changed = (params.hunks ?? []).reduce((n, h) => n + (h.end - h.start + 1), 0);
      return textResult(`edited ${params.path} (${changed} line(s) touched) — new tag #${fileTag(result.content!)}`, {
        path: params.path,
        tag: fileTag(result.content!),
      });
    },
  };
}
