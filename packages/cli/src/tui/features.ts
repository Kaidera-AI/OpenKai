/**
 * Feature toggles (E002) — everything OpenKai does is on by default and
 * one flag away from off. Config: ~/.openkai/config.json, "features" map.
 * Unknown/absent keys resolve ENABLED (default-on is the product posture).
 */

import { readConfig } from "./welcome.js";
import { readConfigFile, writeConfigFile } from "../config.js";

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
  { key: "autoCompact", label: "Auto-compact", description: "elide the middle when context crosses 80% (OpenCode)" },
  { key: "mouse", label: "Mouse support", description: "wheel scroll, drag-select copy, scrollbar, clickable URLs (Claude Code)" },
  { key: "shift", label: "Shift tier routing", description: "in-session tier decisions from tool signals (Switchyard pattern); posture in /settings routing" },
];

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
  // Canonical write path (config.ts): single path + mode bits. The earlier
  // bespoke write here bypassed OPENKAI_HOME and dropped the 0o600 posture.
  const config = readConfigFile();
  const features = { ...((config["features"] as Record<string, unknown>) ?? {}) };
  features[key] = enabled;
  config["features"] = features;
  writeConfigFile(config);
}
