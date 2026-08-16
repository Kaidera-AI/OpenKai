/**
 * Feature toggles (E002) — everything OpenKai does is on by default and
 * one flag away from off. Config: ~/.openkai/config.json, "features" map.
 * Unknown/absent keys resolve ENABLED (default-on is the product posture).
 */

import { readConfig } from "./welcome.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
}

export const FEATURES: readonly FeatureDef[] = [
  { key: "fusion", label: "Fusion panel", description: "/fuse multi-model runs + casts" },
  { key: "tips", label: "Tips", description: "daily tip in fresh sessions + contextual hints" },
  { key: "attention", label: "Attention notifications", description: "bell/OSC when a turn settles unfocused" },
  { key: "splash", label: "Brand animation", description: "the once-ever boot shimmer" },
  { key: "autoUpdate", label: "Auto-update", description: "standalone channel self-upgrade (rollback stays)" },
  { key: "telemetry", label: "Fusion telemetry", description: "run records to .openkai/fusion + Cortex artifacts" },
];

const configFile = (): string => path.join(homedir(), ".openkai", "config.json");

/** Is a feature on? Absent means ON — default-on is the posture. */
export function featureEnabled(key: string): boolean {
  const features = readConfig()["features"];
  if (features && typeof features === "object" && key in (features as Record<string, unknown>)) {
    return (features as Record<string, unknown>)[key] === true;
  }
  return true;
}

/** Flip a feature; returns the new state. */
export function setFeature(key: string, enabled: boolean): void {
  const file = configFile();
  let config: Record<string, unknown> = {};
  try {
    if (existsSync(file)) config = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
  } catch {
    config = {};
  }
  const features = { ...((config["features"] as Record<string, unknown>) ?? {}) };
  features[key] = enabled;
  config["features"] = features;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
}
