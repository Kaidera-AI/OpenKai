/**
 * openkai info — self-check (ADR OK-8 / Inc 08): version, run mode, Cortex
 * reachability, model catalogue, local state. Always exits 0; problems are
 * reported in the output, not as exit codes (this is a diagnostic).
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { CortexClient, defaultFusionLogPath, readFusionRuns } from "@openkai/core";
import {
  BUILD_CHANNEL,
  KILL_SWITCH_ENV,
  detectTarget,
  resolveAutoUpdateEnabled,
  resolveChannel,
} from "./upgrade.js";
import { CLI_VERSION } from "./version.js";
import { PROVIDERS, providerKeyStatus, resolveProvider } from "./providers.js";

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

  // Provider catalogue (offline, bundled) + configuration matrix.
  try {
    const catalogue = builtinModels();
    const openrouterCount = catalogue.getModels("openrouter").length;
    lines.push(`model catalogue: ${openrouterCount} OpenRouter models bundled`);
  } catch {
    lines.push("model catalogue: unavailable");
  }
  lines.push("");
  lines.push("providers:");
  const activeProvider = resolveProvider();
  for (const [id, info] of Object.entries(PROVIDERS)) {
    const status = providerKeyStatus(id);
    const mark = status.configured ? "✓" : "·";
    const active = id === activeProvider ? " (active)" : "";
    const detail = status.oauth === true
      ? "OAuth lane — no env key needed (login flow at first use)"
      : status.configured
        ? `via ${status.via}`
        : `set ${status.needsKey}`;
    lines.push(`  ${mark} ${id}${active} — ${detail}`);
  }

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

  // Upgrade channel (ADR OK-8 dual-channel, Inc 08) — offline, no manifest
  // fetch: channel + kill-switch + current version. `openkai upgrade --check`
  // is the live availability probe.
  const channel = resolveChannel({
    buildChannel: BUILD_CHANNEL,
    envChannel: process.env.OPENKAI_CHANNEL,
  });
  const autoUpdate = resolveAutoUpdateEnabled(process.env[KILL_SWITCH_ENV]);
  lines.push("");
  lines.push("upgrade:");
  if (channel === "npm") {
    lines.push("  channel: npm (pinned at build time, never self-mutates)");
  } else {
    lines.push("  channel: standalone");
    lines.push(`  auto-update: ${autoUpdate ? "enabled" : `disabled (${KILL_SWITCH_ENV}=false)`}`);
    lines.push(`  target: ${detectTarget()}`);
  }
  lines.push(`  current: ${version}`);
  lines.push("  check availability: openkai upgrade --check");

  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}
