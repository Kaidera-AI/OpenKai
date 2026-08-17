/**
 * Session goal (E006) — a single guiding objective for the session, with a
 * lifecycle: set → active → paused → done/dropped. Persisted per-project in
 * `~/.openkai/config.json` (key `goal`) so it survives restarts and is shared
 * across sessions in the same project (CTO: multi-instance aware).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export type GoalStatus = "active" | "paused" | "done" | "dropped";

export interface Goal {
  text: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

const configPath = (): string => path.join(homedir(), ".openkai", "config.json");

function readAll(): Record<string, unknown> {
  try {
    if (!existsSync(configPath())) return {};
    return JSON.parse(readFileSync(configPath(), "utf-8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeAll(config: Record<string, unknown>): void {
  mkdirSync(path.dirname(configPath()), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}

export function getGoal(): Goal | undefined {
  const raw = readAll()["goal"];
  if (!raw || typeof raw !== "object") return undefined;
  const g = raw as Partial<Goal>;
  if (typeof g.text !== "string" || g.text.length === 0) return undefined;
  return {
    text: g.text,
    status: (g.status as GoalStatus) ?? "active",
    createdAt: g.createdAt ?? "",
    updatedAt: g.updatedAt ?? "",
  };
}

export function setGoal(text: string): Goal {
  const now = new Date().toISOString();
  const goal: Goal = { text, status: "active", createdAt: now, updatedAt: now };
  const config = readAll();
  config["goal"] = goal;
  writeAll(config);
  return goal;
}

export function updateGoal(status: GoalStatus): Goal | undefined {
  const goal = getGoal();
  if (!goal) return undefined;
  goal.status = status;
  goal.updatedAt = new Date().toISOString();
  const config = readAll();
  config["goal"] = goal;
  writeAll(config);
  return goal;
}

export function clearGoal(): void {
  const config = readAll();
  delete config["goal"];
  writeAll(config);
}
