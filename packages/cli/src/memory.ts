/**
 * Project memory (E003) — the local, agent-aware memory structure every
 * OpenKai session in a project shares. Multi-agent and multi-instance safe:
 * the learnings log is APPEND-ONLY with agent/session/timestamp-tagged
 * entries, so any number of concurrent TUI instances in the same folder
 * interleave writes without coordination (POSIX append is atomic for these
 * line-sized writes). The structure:
 *
 *   .openkai/memory/
 *     learnings.md          — shared append-only learnings log (all agents)
 *     agents/<agent>.md     — per-agent scratch memory (created lazily)
 *     README.md             — the convention, for agents that land here cold
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const README = `# Project memory

Shared memory for every agent working in this project (OpenKai).

- \`learnings.md\` — append-only learnings log. Every entry is tagged
  \`[timestamp] [agent/session]\` so concurrent sessions interleave safely.
  NEVER edit or reorder entries; only append.
- \`agents/<agent>.md\` — per-agent scratch memory. An agent may rewrite its
  own file; treat other agents' files as read-only.

Write a learning when you discover something the next session should not
have to rediscover: a command that works, a gotcha, a decision's reason.
`;

export interface MemoryStatus {
  initialized: boolean;
  learnings: number;
  agents: string[];
  recent: string[];
}

const dir = (cwd: string): string => path.join(cwd, ".openkai", "memory");
const learningsFile = (cwd: string): string => path.join(dir(cwd), "learnings.md");

/** Create the structure (idempotent). Returns true when it newly existed. */
export function initMemory(cwd: string): boolean {
  const fresh = !existsSync(learningsFile(cwd));
  mkdirSync(path.join(dir(cwd), "agents"), { recursive: true });
  if (!existsSync(learningsFile(cwd))) {
    writeFileSync(learningsFile(cwd), "# Learnings\n\nShared across every agent + session in this project. Append-only.\n\n", "utf-8");
  }
  const readme = path.join(dir(cwd), "README.md");
  if (!existsSync(readme)) writeFileSync(readme, README, "utf-8");
  return fresh;
}

/** Append one learning, tagged for multi-instance attribution. */
export function appendLearning(cwd: string, agent: string, sessionId: string, text: string): void {
  initMemory(cwd);
  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const entry = `- [${stamp}] [${agent}/${sessionId.slice(0, 8)}] ${text.replace(/\s+/g, " ").trim()}\n`;
  appendFileSync(learningsFile(cwd), entry, "utf-8");
}

/** Status for the `/memory` surface + the boot notice. */
export function memoryStatus(cwd: string): MemoryStatus {
  if (!existsSync(learningsFile(cwd))) {
    return { initialized: false, learnings: 0, agents: [], recent: [] };
  }
  const lines = readFileSync(learningsFile(cwd), "utf-8")
    .split("\n")
    .filter((l) => l.startsWith("- ["));
  let agents: string[] = [];
  try {
    agents = readdirSync(path.join(dir(cwd), "agents"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    // agents dir optional
  }
  return {
    initialized: true,
    learnings: lines.length,
    agents,
    recent: lines.slice(-5),
  };
}
