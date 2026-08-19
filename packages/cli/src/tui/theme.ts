/**
 * OpenKai TUI design tokens — the ONLY colour source (scope §3.1).
 *
 * Every other TUI module imports from here; ad-hoc colour literals anywhere
 * else are a review defect. Tokens are exposed as ANSI styling functions
 * (`(text: string) => string`) so they compose directly with pi-tui's
 * `MarkdownTheme` / `EditorTheme` / `Box` `bgFn` surfaces, which all take
 * `(text) => styledText`.
 *
 * Palette: a fixed 256-colour subset so the look is stable across terminals
 * without querying the colour scheme. Surface tokens are backgrounds;
 * text/highlight tokens are foregrounds. `highlightDanger` is reserved for
 * risky-row highlights (errors, destructive confirmations), not plain labels.
 *
 * P4b (scope §1) adds two token families, both still sourced ONLY from here:
 *  - `attention` (amber 220) — the focus-aware chrome attention state.
 *  - `rolePill` / `roleColour` — stable per-agent identity colours.
 */

import { THEME_PACKS } from "./theme-packs.js";

// ── 256-colour palette (stable, no truecolour dependency) ──────────────────
const DARK = {
  surface1: 234, // near-black panel background
  surface2: 237, // raised block background
  surface3: 240, // card / chrome background
  text: 252, // default foreground
  textMuted: 244, // secondary text / borders
  highlight: 39, // cyan accent (selection / active)
  highlightDanger: 124, // red accent (errors / destructive)
  toolBorder: 241, // muted left border for tool cards
  attention: 220, // amber accent (focus-aware attention state)
} as const;

const LIGHT: Record<keyof typeof DARK, number> = {
  surface1: 255,
  surface2: 254,
  surface3: 250,
  text: 238,
  textMuted: 242,
  highlight: 32,
  highlightDanger: 160,
  toolBorder: 245,
  attention: 166,
};

let C: Record<keyof typeof DARK, number> = { ...DARK };

/** The active theme name (a built-in, or a pack name from THEME_PACKS). */
export let themeName = "dark";

/** All available theme names: the two built-ins + the industry pack. */
export function themeNames(): string[] {
  return ["dark", "light", ...Object.keys(THEME_PACKS)];
}

/** Switch the theme (dark | light | auto | any pack name). Unknown names no-op. */
export function setTheme(name: string): void {
  if (name === "auto") {
    C = { ...DARK };
    themeName = "auto";
    return;
  }
  if (name === "dark") {
    C = { ...DARK };
  } else if (name === "light") {
    C = { ...LIGHT };
  } else {
    const pack = THEME_PACKS[name];
    const variant = pack?.dark ?? pack?.light;
    if (!variant) return;
    C = { ...DARK, ...variant } as Record<keyof typeof DARK, number>;
  }
  themeName = name;
}

/** Sync hint from COLORFGBG (e.g. "15;0" — bg is the last field). */
export function detectThemeSync(): "dark" | "light" {
  const fgBg = process.env.COLORFGBG;
  if (fgBg) {
    const bg = parseInt(fgBg.split(";").pop() ?? "", 10);
    if (!Number.isNaN(bg)) return bg >= 7 && bg !== 8 && bg !== 0 ? "light" : "dark";
  }
  return "dark";
}

/**
 * Ask the terminal for its background via OSC 11 (kitty/ghostty/iTerm2/wezterm
 * all answer), falling back to COLORFGBG, then dark. ~150ms budget so boot
 * never stalls on a silent terminal.
 */
export function detectThemeAsync(): Promise<"dark" | "light"> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || !stdout.isTTY) {
      resolve(detectThemeSync());
      return;
    }
    // TUI-safety (E017 review, critical): this function may run WHILE a TUI
    // owns stdin (theme picker applying "auto" mid-session). Preserve and
    // restore the raw-mode state, and never pause a shared stream — the
    // previous behaviour (setRawMode(false) + pause()) killed TUI keyboard
    // input and could wedge the terminal in the alt screen.
    const wasRaw = stdin.isRaw === true;
    let settled = false;
    const finish = (value: "dark" | "light"): void => {
      if (settled) return;
      settled = true;
      stdin.off("data", onData);
      try {
        stdin.setRawMode(wasRaw);
        if (stdin.listenerCount("data") === 0) stdin.pause();
      } catch {
        // already detached
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(detectThemeSync()), 150);
    let buffer = "";
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString("utf-8");
      const match = buffer.match(/\x1b\]11;rgb:([0-9a-f]{2,4})\/([0-9a-f]{2,4})\/([0-9a-f]{2,4})/i);
      if (match) {
        clearTimeout(timer);
        const r = parseInt(match[1]!.slice(0, 2), 16);
        const g = parseInt(match[2]!.slice(0, 2), 16);
        const b = parseInt(match[3]!.slice(0, 2), 16);
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        finish(luminance > 127 ? "light" : "dark");
      }
    };
    try {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on("data", onData);
      stdout.write("\x1b]11;?\x07");
    } catch {
      clearTimeout(timer);
      finish(detectThemeSync());
    }
  });
}
/**
 * Curated, distinct 256-colour hues for per-agent visual identity (scope §1.2).
 * A role maps to one of these via a stable hash so the same agent always gets
 * the same colour, across sessions and machines, without storing a palette.
 */
const ROLE_COLOURS = [39, 204, 141, 114, 215, 176, 81, 132] as const;

/** Wrap `text` in a 256-colour foreground SGR. */
function fg256(text: string, n: number): string {
  return `\x1b[38;5;${n}m${text}\x1b[39m`;
}

/** Wrap `text` in a 256-colour background SGR (does not reset fg). */
function bg256(text: string, n: number): string {
  return `\x1b[48;5;${n}m${text}\x1b[49m`;
}

/** Bold wrapper. */
function bold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

/** Dim wrapper (used for muted text). */
function dim(text: string): string {
  return `\x1b[2m${text}\x1b[22m`;
}

// ── Design tokens (the only colour source) ─────────────────────────────────

/** Surface backgrounds — panel / block / card / chrome layers. */
export const surface = {
  /** Deepest panel background (the alt-screen base). */
  1: (text: string): string => bg256(text, C.surface1),
  /** Raised block background (message blocks). */
  2: (text: string): string => bg256(text, C.surface2),
  /** Card / chrome background (tool cards, status line). */
  3: (text: string): string => bg256(text, C.surface3),
} as const;

/** Foreground text tokens. */
export const text = {
  /** Default foreground. */
  base: (t: string): string => fg256(t, C.text),
  /** Muted / secondary foreground (timestamps, hints, borders). */
  muted: (t: string): string => fg256(t, C.textMuted),
  /** Bold emphasis (role labels, headings). */
  strong: (t: string): string => bold(fg256(t, C.text)),
  /** Dimmed (hidden-by-default thinking preview, placeholders). */
  dim: (t: string): string => dim(fg256(t, C.textMuted)),
} as const;

/** Highlight accents — selection / active rows. */
export const highlight = {
  /** Active / selected accent (cyan). */
  base: (t: string): string => fg256(t, C.highlight),
  /** Danger accent (red) — risky rows, errors, destructive confirms. */
  danger: (t: string): string => fg256(t, C.highlightDanger),
  /**
   * Attention accent (amber) — the focus-aware chrome attention state (scope
   * §1.1). Used on the spinner chip when a turn settled while the terminal
   * was unfocused, or a permission request is waiting. Never a banner.
   */
  attention: (t: string): string => fg256(t, C.attention),
} as const;

/** Muted left border for tool cards (scope §3.1 muted-left-border blocks). */
export const toolBorder = (t: string): string => fg256(t, C.toolBorder);

/**
 * Brand ramp (first-run splash animation): a graphite → mint → paper sweep
 * using the closest 256-colour matches for the Kaidera brand palette.
 * Kept here so the token rule ("theme is the only colour source") covers
 * the brand moment too.
 */
export const BRAND_RAMP = [
  235, 236, 240, 244, 115, 151, 115, 244, 240, 236, 235, 254,
] as const;

/** Tint text with the ramp colour at `step` (wraps). */
export function brandTint(text: string, step: number): string {
  return fg256(text, BRAND_RAMP[step % BRAND_RAMP.length]!);
}

/** Spinner glyph styled with the highlight accent. */
export const spinner = (t: string): string => highlight.base(t);

/** One interaction grammar footer (scope §3.2) — every overlay carries it. */
export const OVERLAY_FOOTER = "↑/↓ Navigate · Enter Select · ESC Cancel";

/** Render the footer with the muted token (the only colour source rule). */
export function renderOverlayFooter(): string {
  return text.muted(OVERLAY_FOOTER);
}

/**
 * Make an overlay opaque (droid's solid panels): pad every line to `width`
 * and lay a surface background under it so the transcript never bleeds
 * through the panel (CTO feedback 2026-08-18).
 */
export function opaquePanel(lines: string[], width: number): string[] {
  return lines.map((line) => {
    const pad = Math.max(0, width - visibleWidth(line));
    return surface["2"](line + " ".repeat(pad));
  });
}

// ── Per-agent visual identity (scope §1.2) ──────────────────────────────────

/**
 * Deterministic, stable hash of a role name to a colour index. Pure: the same
 * string always yields the same colour, so an agent's identity is stable
 * across sessions without persisting a palette. Public so tests can pin it.
 */
export function roleColour(role: string): number {
  let h = 0;
  for (let i = 0; i < role.length; i += 1) {
    h = (h * 31 + role.charCodeAt(i)) >>> 0;
  }
  return ROLE_COLOURS[h % ROLE_COLOURS.length]!;
}

/** Short pill label for a role — uppercased, truncated to 10 visible chars. */
export function roleLabel(role: string): string {
  const upper = role.toUpperCase();
  return upper.length > 10 ? upper.slice(0, 9) + "…" : upper;
}

/**
 * Render a `[LABEL]` pill in the role's stable colour (scope §1.2). The only
 * colour source is {@link roleColour}; ad-hoc literals elsewhere are a defect.
 * Used on transcript blocks (assistant speaker header) + the chrome.
 */
export function rolePill(role: string): string {
  const label = roleLabel(role);
  const body = `[${label}]`;
  return fg256(body, roleColour(role));
}

// ── pi-tui theme adapters (compose tokens into component themes) ────────────

import { visibleWidth } from "@earendil-works/pi-tui";
import type { MarkdownTheme, EditorTheme, SelectListTheme } from "@earendil-works/pi-tui";

/** Markdown theme built entirely from tokens. */
export const markdownTheme: MarkdownTheme = {
  heading: (t) => text.strong(t),
  link: (t) => highlight.base(t),
  linkUrl: (t) => text.muted(t),
  code: (t) => highlight.base(t),
  codeBlock: (t) => text.muted(t),
  codeBlockBorder: (t) => toolBorder(t),
  quote: (t) => text.muted(t),
  quoteBorder: (t) => toolBorder(t),
  hr: (t) => text.muted(t),
  listBullet: (t) => text.muted(t),
  bold: (t) => text.strong(t),
  italic: (t) => text.dim(t),
  strikethrough: (t) => text.muted(t),
  underline: (t) => highlight.base(t),
};

/** SelectList theme (shared by the permission overlay + command palette). */
const selectListTheme: SelectListTheme = {
  selectedPrefix: (t) => highlight.base(t),
  selectedText: (t) => highlight.base(t),
  description: (t) => text.muted(t),
  scrollInfo: (t) => text.muted(t),
  noMatch: (t) => text.muted(t),
};

/** Editor theme built entirely from tokens. */
export const editorTheme: EditorTheme = {
  borderColor: (t) => toolBorder(t),
  selectList: selectListTheme,
};

/** Exported so the command palette reuses the identical token styling. */
export const paletteSelectTheme: SelectListTheme = selectListTheme;
