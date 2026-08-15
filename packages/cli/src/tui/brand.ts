/**
 * OpenKai branding (ADR OK-5 droid bar: the animated-logo moment happens
 * exactly once — the full splash renders on first run only, then a compact
 * mark ever after). Identity: OpenKai wordmark + "by Kaidera" provenance.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { brandTint, BRAND_RAMP } from "./theme.js";

/** The Kaidera hex-node mark (from the Kaidera logo: hexagon + node graph). */
export const KAIDERA_MARK: readonly string[] = [
  "     ╭───────╮     ",
  "   ╭─╯   ●   ╰─╮   ",
  "  ╱  ●     ╲   ╲  ",
  "  │   ╲     ╲  │  ",
  "  │    ●───●   │  ",
  "  ╲           ╱   ",
  "   ╰─╮     ╭─╯    ",
  "     ╰──────╯     ",
];

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

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The first-run brand moment (droid bar: animated logo exactly once): the
 * Kaidera mark + OpenKai wordmark, hue-cycling through the brand ramp for
 * ~700ms, then cleared for the app. Plays only on a real TTY on the very
 * first run; every later run goes straight to the compact transcript mark.
 * Returns true when it played (so the transcript stays compact).
 */
export async function playBrandAnimation(
  version: string,
  write: (text: string) => void = (t) => process.stdout.write(t),
): Promise<boolean> {
  if (!process.stdout.isTTY || !shouldShowSplash()) return false;

  const frame = [...KAIDERA_MARK, "", ...OPENKAI_LOGO, "", `  ${BRAND_TAGLINE} · ${version}`];
  const frames = BRAND_RAMP.length;
  const frameMs = 60;
  try {
    write("\x1b[?25l"); // hide cursor
    for (let step = 0; step < frames; step += 1) {
      write("\x1b[2J\x1b[H"); // clear + home
      write(frame.map((line) => brandTint(line, step)).join("\n"));
      await sleep(frameMs);
    }
    write("\x1b[2J\x1b[H\x1b[?25h"); // clear + restore cursor
  } catch {
    // animation is decorative — never block boot
  }
  markSplashSeen();
  return true;
}
