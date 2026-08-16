/**
 * In-product changelog (Ctrl+J, droid's "what just changed"). Reads the repo
 * CHANGELOG.md head when present; falls back to the current version line.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** The first ~24 meaningful lines of CHANGELOG.md (headings + entries). */
export function changelogHead(cwd: string = process.cwd(), maxLines = 24): string[] {
  const file = path.join(cwd, "CHANGELOG.md");
  if (!existsSync(file)) return ["no CHANGELOG.md in this checkout"];
  const lines = readFileSync(file, "utf-8").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    out.push(trimmed);
    if (out.length >= maxLines) break;
  }
  return out.length > 0 ? out : ["changelog is empty"];
}
