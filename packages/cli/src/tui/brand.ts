/**
 * OpenKai branding (ADR OK-5 droid bar: the animated-logo moment happens
 * exactly once — the full splash renders on first run only, then a compact
 * mark ever after). Identity: OpenKai wordmark + "by Kaidera" provenance.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openkaiHome } from "@kaidera/openkai-core";

import { gradientLogo, introLogoFrame } from "./gradient.js";


/**
 * The Kaidera hex-node mark — the logo's knowledge-graph motif: an outer
 * hexagon holding a triangle of connected nodes. Double-line weight on the
 * rim, the node triangle inside. Used by the splash, the boot card, and the
 * status line glyph.
 *
 * Designed to match the Kaidera brand mark (hex/network motif) with
 * Unicode box-drawing characters. The outer hexagon uses double-line
 * weight, internal connections use single-line, and nodes are filled
 * circles. Mint green (#B0E1CD) is the canonical brand accent colour.
 */
export const KAIDERA_MARK: readonly string[] = [
  "              ╭────────────╮",
  "             ╱              ╲",
  "            ╱                ╲",
  "           ╱     ●    ●       ╲",
  "          ╱       ╲    ╲       ╲",
  "         ╱    ●    ╲    ╲       ╲",
  "        ╱      ╲    ╲    ●       ╲",
  "       ╱       ●╲    ●    ╲       ╲",
  "       ╲       ╱ ╲        ╱       ╱",
  "       ╲     ╱   ●      ╱       ╱",
  "        ╲   ╱    ╱     ╱       ╱",
  "         ╲ ●    ╱      ╲      ╱",
  "          ╲    ╱        ╲    ╱",
  "           ╲  ●          ●  ╱",
  "            ╰──────────────╯",
];

/** Compact boot-mark variant (ren's note): same triangle motif, sharp, 8 lines. */
export const KAIDERA_MARK_COMPACT: readonly string[] = [
  "   ┌────────┐   ",
  "  /  ●    ●  \\  ",
  " /  ●  \\ /  ●  \\ ",
  "/    \\   ●   /    \\",
  "\\    /   ●   \\    /",
  " \\  ●  / \\  ●  / ",
  "  \\  ●    ●  /  ",
  "   └────────┘   ",
];

export const KAIDERA_GLYPH = "⬣";

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

/**
 * The boot capability row (droid's `Skills (60) ✓ MCPs (0) ✗` pattern):
 * what this machine/session actually has, with ✓/✗ — computed live.
 */
export function capabilityRow(options: {
  configuredProviders: number;
  skills: number;
  mcpServers: number;
  agentsMdPresent: boolean;
}): string {
  const mark = (ok: boolean) => (ok ? "✓" : "✗");
  return [
    `providers (${options.configuredProviders}) ${mark(options.configuredProviders > 0)}`,
    `skills (${options.skills}) ${mark(options.skills > 0)}`,
    `mcp (${options.mcpServers}) ${mark(options.mcpServers > 0)}`,
    `AGENTS.md ${mark(options.agentsMdPresent)}`,
  ].join(" · ");
}

interface SplashState {
  splashSeen?: boolean;
  splashSeenVersion?: string;
  [key: string]: unknown;
}

const statePath = (): string =>
  path.join(openkaiHome(), "state.json");

/** The splash plays once per VERSION — every upgrade earns the brand moment. */
export function shouldShowSplash(version: string): boolean {
  try {
    if (!existsSync(statePath())) return true;
    const state = JSON.parse(readFileSync(statePath(), "utf-8")) as SplashState;
    if (state.splashSeenVersion !== undefined) return state.splashSeenVersion !== version;
    // Legacy state (pre-version-keyed splash): no version recorded means it
    // has not played for THIS version — replay once, then record it.
    return true;
  } catch {
    return true; // unreadable state: show the splash, it's harmless
  }
}

export function markSplashSeen(version: string): void {
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
    state.splashSeenVersion = version;
    writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  } catch {
    // branding state must never break the app
  }
}

/** The lines to render into a fresh transcript, per the once-rule. */
export function splashLines(version: string): string[] {
  if (shouldShowSplash(version)) {
    markSplashSeen(version);
    return [...OPENKAI_LOGO, "", `${BRAND_TAGLINE} · ${version}`, ""];
  }
  return [compactMark(version)];
}

/**
 * The persistent boot logo (droid's boot-card pattern): the Kaidera hex mark
 * under the resting gradient, with the wordmark info beside it. Rendered at
 * the top of every fresh transcript — the splash animation is the moment,
 * this is the fixture.
 */
export function bootMark(version: string): string[] {
  const tinted = gradientLogo([...KAIDERA_MARK_COMPACT], 0);
  const info = ["", ` OpenKai ${version}`, ` by Kaidera`, ` /help · Ctrl+K palette`];
  return tinted.map((row, index) => row.replace(/\s+$/, "") + (info[index] ?? "")).concat([""]);
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
/**
 * The brand moment on every launch (omp's choreography, droid's restraint):
 * the Kaidera mark + OpenKai wordmark under a 5-stop diagonal gradient with
 * the shine traversing three times, easing to rest in ~2.6s. Truecolour when
 * available, 256-ramp otherwise. Any key skips. TTY only.
 */
export async function playBrandAnimation(
  version: string,
  write: (text: string) => void = (t) => process.stdout.write(t),
  options: { force?: boolean } = {},
): Promise<boolean> {
  void options;
  if (!process.stdout.isTTY) return false;

  const frame = [...KAIDERA_MARK, "", ...OPENKAI_LOGO, "", `  ${BRAND_TAGLINE} · ${version}`, "", `  press any key to skip`];
  const totalMs = 2600;
  const tickMs = 33;
  const steps = Math.ceil(totalMs / tickMs);

  // Any key skips (omp's setup splash pattern).
  let skipped = false;
  const stdin = process.stdin;
  const onKey = (): void => { skipped = true; };
  const hadRaw = stdin.isRaw;
  try {
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onKey);
    write("\x1b[?25l"); // hide cursor
    for (let step = 0; step <= steps && !skipped; step += 1) {
      const progress = Math.min(1, step / steps);
      write("\x1b[2J\x1b[H"); // clear + home
      write(introLogoFrame(frame, progress).join("\n"));
      if (progress < 1) await sleep(tickMs);
    }
    // settle: one clean gradient frame, then hand off
    write("\x1b[2J\x1b[H\x1b[?25h");
  } catch {
    // animation is decorative — never block boot
  } finally {
    stdin.off("data", onKey);
    stdin.setRawMode(hadRaw ?? false);
    stdin.pause();
  }
  markSplashSeen(version);
  return true;
}
