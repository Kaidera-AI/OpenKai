/**
 * First-run config helpers (`~/.openkai/config.json`): read/write the
 * onboarding state and provider/model/memory choices. The interactive
 * first-run wizard was REMOVED (CTO directive 2026-08-19): the TUI launches
 * regardless of credential state and everything is configured inside it —
 * /setup, the settings panel, and the keyless-boot sign-in overlay carry
 * first-run setup. `/welcome` was already retired as a duplicate of /setup.
 */


import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openkaiHome } from "@kaidera/openkai-core";

export interface OpenKaiConfig {
  onboarded?: boolean;
  provider?: string;
  model?: string;
  memory?: "local" | "cortex";
  cortexProject?: string;
  [key: string]: unknown;
}

// openkaiHome honours OPENKAI_HOME (embedded/container deployments) — the
// consult Q3 answer depends on every path going through it.
const configPath = (): string => path.join(openkaiHome(), "config.json");
const envPath = (): string => path.join(openkaiHome(), ".env");

export function readConfig(): OpenKaiConfig {
  try {
    if (!existsSync(configPath())) return {};
    return JSON.parse(readFileSync(configPath(), "utf-8")) as OpenKaiConfig;
  } catch {
    return {};
  }
}

function writeConfig(config: OpenKaiConfig): void {
  // Same posture as config.ts writeConfigFile: operator-only dir + file, and
  // the chmod repairs pre-existing loose files.
  mkdirSync(path.dirname(configPath()), { recursive: true, mode: 0o700 });
  writeFileSync(configPath(), `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 });
  chmodSync(configPath(), 0o600);
}
