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

// ── 256-colour palette (stable, no truecolour dependency) ──────────────────
const C = {
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

/** Spinner glyph styled with the highlight accent. */
export const spinner = (t: string): string => highlight.base(t);

/** One interaction grammar footer (scope §3.2) — every overlay carries it. */
export const OVERLAY_FOOTER = "↑/↓ Navigate · Enter Select · ESC Cancel";

/** Render the footer with the muted token (the only colour source rule). */
export function renderOverlayFooter(): string {
  return text.muted(OVERLAY_FOOTER);
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
