/**
 * .env autoload — dependency-free, CLI-bootstrap only.
 *
 * Loads `<cwd>/.env` first, then `~/.openkai/.env` as a user-global
 * fallback (so provider keys work outside the project checkout). Real
 * environment variables always win over file values; the cwd file wins
 * over the global one. Supports comments (#), blank lines, optional
 * `export ` prefix, and single/double-quoted values.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function loadFile(file: string): void {
  if (!existsSync(file)) return;

  let text: string;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    return; // unreadable .env must not kill the CLI
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice(7).trimStart() : line;
    const equals = body.indexOf("=");
    if (equals <= 0) continue;
    const key = body.slice(0, equals).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (value.includes(" ")) {
      // Unquoted values: strip trailing ` # comment` text and pasted labels
      // (keys never contain spaces; the first token is the value).
      value = value.split(/\s+/)[0] ?? "";
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadDotEnv(cwd: string = process.cwd()): void {
  loadFile(path.join(homedir(), ".openkai", ".env"));
  loadFile(path.join(cwd, ".env")); // project-local wins: loaded last, env wins
}
