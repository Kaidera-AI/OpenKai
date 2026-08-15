/**
 * OpenKai branding (ADR OK-5 droid bar: the animated-logo moment happens
 * exactly once — the full splash renders on first run only, then a compact
 * mark ever after). Identity: OpenKai wordmark + "by Kaidera" provenance.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** The full splash — first run only. Unicode block wordmark. */
export const OPENKAI_LOGO: readonly string[] = [
  " ██████╗ ██████╗ ███████╗███╗   ██╗██╗  ██╗ █████╗ ██╗",
  "██╔═══██╗██╔══██╗██╔════╝████╗  ██║██║ ██╔╝██╔══██╗██║",
  "██║   ██║██████╔╝█████╗  ██╔██╗ ██║█████╔╝ ███████║██║",
  "██║   ██║██╔═══╝ ██╔══╝  ██║╚██╗██║██╔═██╗ ██╔══██║██║",
  "╚██████╔╝██║     ███████╗██║ ╚████║██║  ██╗██║  ██║██║",
  " ╚═════╝ ╚═╝     ╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝",
];

export const BRAND_TAGLINE = "the open agent harness · by Kaidera";

/** The compact mark — every run after the first. */
export const compactMark = (version: string): string =>
  `OpenKai ${version} · by Kaidera — /help for commands, Ctrl+K palette`;

interface SplashState {
  splashSeen?: boolean;
  [key: string]: unknown;
}

const statePath = (): string =>
  path.join(homedir(), ".openkai", "state.json");

/** Splash state is user-global (~/.openkai/state.json), never per-project. */
export function shouldShowSplash(now: () => Date = () => new Date()): boolean {
  void now;
  try {
    if (!existsSync(statePath())) return true;
    const state = JSON.parse(readFileSync(statePath(), "utf-8")) as SplashState;
    return state.splashSeen !== true;
  } catch {
    return true; // unreadable state: show the splash, it's harmless
  }
}

export function markSplashSeen(): void {
  try {
    const file = statePath();
    mkdirSync(path.dirname(file), { recursive: true });
    let state: SplashState = {};
    if (existsSync(file)) {
      try {
        state = JSON.parse(readFileSync(file, "utf-8")) as SplashState;
      } catch {
        state = {};
      }
    }
    state.splashSeen = true;
    writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  } catch {
    // branding state must never break the app
  }
}

/** The lines to render into a fresh transcript, per the once-rule. */
export function splashLines(version: string): string[] {
  if (shouldShowSplash()) {
    markSplashSeen();
    return [...OPENKAI_LOGO, "", `${BRAND_TAGLINE} · ${version}`, ""];
  }
  return [compactMark(version)];
}
