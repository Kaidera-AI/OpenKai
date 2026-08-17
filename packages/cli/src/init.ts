/**
 * `/init` — generate a starter AGENTS.md for the current project (omp's
 * /init, deterministic edition): scans the workspace shape (package.json,
 * workspaces, scripts, test runner) and writes a concise onboarding doc.
 * NEVER overwrites an existing AGENTS.md — the operator owns that file.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface InitResult {
  created: boolean;
  path: string;
  message: string;
}

export function initAgentsMd(cwd: string): InitResult {
  const target = path.join(cwd, "AGENTS.md");
  if (existsSync(target)) {
    return { created: false, path: target, message: "AGENTS.md already exists — left untouched" };
  }

  let name = path.basename(cwd);
  const scripts: string[] = [];
  let workspaces: string[] = [];
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf-8")) as {
      name?: string;
      scripts?: Record<string, string>;
      workspaces?: string[] | { packages?: string[] };
    };
    if (pkg.name) name = pkg.name;
    for (const key of Object.keys(pkg.scripts ?? {})) scripts.push(`npm run ${key}`);
    const ws = pkg.workspaces;
    workspaces = Array.isArray(ws) ? ws : (ws?.packages ?? []);
  } catch {
    // not an npm project — the template still applies
  }

  const layout = workspaces.length > 0
    ? workspaces.map((w) => `- \`${w}\` — workspace package`).join("\n")
    : "- (fill in the project layout)";

  const commands = scripts.length > 0
    ? scripts.map((s) => `- \`${s}\``).join("\n")
    : "- (fill in build/test commands)";

  const body = `# AGENTS.md — ${name}

## What this is

(describe the project in one paragraph)

## Layout

${layout}

## Commands

${commands}

## Conventions

- (coding standards, review gates, anything an agent MUST know)

## Memory

Shared agent memory lives in \`.openkai/memory/\` (run \`/memory\` in an
OpenKai session). Read \`learnings.md\` before starting work; append what you
learn so the next session doesn't rediscover it.
`;

  writeFileSync(target, body, "utf-8");
  return { created: true, path: target, message: `AGENTS.md created for ${name} — fill in the bracketed sections` };
}
