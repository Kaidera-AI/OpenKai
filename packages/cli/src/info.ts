/**
 * openkai info — self-check (ADR OK-8 / Inc 08): version, run mode, Cortex
 * reachability, model catalogue, local state. Always exits 0; problems are
 * reported in the output, not as exit codes (this is a diagnostic).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { CortexClient, defaultFusionLogPath, readFusionRuns } from "@openkai/core";
import { CLI_VERSION } from "./version.js";

export interface InfoOptions {
  project?: string;
  api?: string;
}

const countDirs = async (dir: string): Promise<number> => {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).filter((e) =>
      e.isDirectory(),
    ).length;
  } catch {
    return 0;
  }
};

const readVersion = async (): Promise<string> => {
  try {
    const pkg = JSON.parse(
      await fs.readFile(new URL("../package.json", import.meta.url), "utf-8"),
    ) as { version?: string };
    return pkg.version ?? CLI_VERSION;
  } catch {
    // Standalone binary: package.json is not inside bun's virtual fs.
    return CLI_VERSION;
  }
};

export async function runInfo(options: InfoOptions): Promise<number> {
  const version = await readVersion();

  const project = options.project ?? process.env.CORTEX_PROJECT;
  const lines: string[] = [];

  lines.push(`openkai ${version}`);
  lines.push(`node ${process.version} · ${process.platform}/${process.arch}`);
  lines.push("");

  // Run mode (ren A1): standalone-local vs KOS-managed.
  if (!project) {
    lines.push("mode: standalone-local (no CORTEX_PROJECT — local persistence only)");
  } else {
    const client = new CortexClient({ baseUrl: options.api, project });
    try {
      const health = await client.health();
      lines.push(
        `mode: KOS-managed (project ${project}) — cortex-api ${health.version ?? "?"} healthy, event backend ${health.event_backend ?? "?"}`,
      );
    } catch (error) {
      lines.push(
        `mode: degraded — CORTEX_PROJECT=${project} but API unreachable (${error instanceof Error ? error.message : String(error)}); local persistence only`,
      );
    }
  }

  // Provider catalogue (offline, bundled).
  try {
    const catalogue = builtinModels();
    const openrouterCount = catalogue.getModels("openrouter").length;
    lines.push(`model catalogue: ${openrouterCount} OpenRouter models bundled`);
  } catch {
    lines.push("model catalogue: unavailable");
  }
  lines.push(
    `openrouter key: ${process.env.OPENROUTER_API_KEY ? "set" : "MISSING (chat/fuse need it)"}`,
  );

  // Local state.
  const sessions = await countDirs(path.join(process.cwd(), ".openkai", "sessions"));
  const runs = await readFusionRuns(defaultFusionLogPath());
  const shadow = await fs
    .stat(path.join(process.cwd(), ".openkai", "shadow.git", "HEAD"))
    .then(() => "present")
    .catch(() => "none");
  lines.push("");
  lines.push(`local state (${process.cwd()}):`);
  lines.push(`  sessions: ${sessions}`);
  lines.push(`  fusion runs: ${runs.length}`);
  lines.push(`  shadow-git: ${shadow}`);

  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}
