/**
 * First-run config helpers (`~/.openkai/config.json`): read/write the
 * onboarding state and provider/model/memory choices. The interactive
 * first-run wizard was REMOVED (CTO directive 2026-08-19): the TUI launches
 * regardless of credential state and everything is configured inside it —
 * /setup, the settings panel, and the keyless-boot sign-in overlay carry
 * first-run setup. `/welcome` was already retired as a duplicate of /setup.
 *
 * The file IO itself is the canonical config.ts layer (single path, single
 * shape); this module keeps only the typed onboarding view.
 */

import { readConfigFile } from "../config.js";

export interface OpenKaiConfig {
  onboarded?: boolean;
  provider?: string;
  model?: string;
  memory?: "local" | "cortex";
  cortexProject?: string;
  [key: string]: unknown;
}

export function readConfig(): OpenKaiConfig {
  return readConfigFile() as OpenKaiConfig;
}
