/**
 * Magic keywords ("ultrathink" / "ultrareview") — cherry-picked from OMP
 * (can1357/oh-my-pi: modes/ultrathink.ts, magic-keyword-boundary.ts,
 * markdown-prose.ts, gradient-highlight.ts) and upgraded for OpenKai:
 *
 * - Detection is prose-delimited, lowercase, and never fires inside code
 *   spans, fenced blocks, or XML/HTML sections ({@link maskNonProse}).
 * - The composer paints standalone keywords with an animated rainbow
 *   shimmer ({@link paintMagicKeywords}); sent messages get the static
 *   gradient. Painting adds zero-width SGR only — visible width is stable.
 * - Behaviour on submit lives in app.ts: `ultrathink` routes the prompt to
 *   the multi-model fusion think run (single-model notice fallback),
 *   `ultrareview` runs the multi-model review over the shadow diff.
 * - Toggles: config `magicKeywords.{enabled,ultrathink,ultrareview}` —
 *   default-on, matching the project's feature posture.
 */

import { readConfigFile } from "../config.js";
import { supportsTrueColor } from "./gradient.js";

// ── Boundary regex (OMP magic-keyword-boundary.ts, verbatim semantics) ──────

/** Characters that bind a magic keyword into an identifier or path segment. */
const LEFT_BOUNDARY = String.raw`(?<![\p{L}\p{N}_./\\-])(?<!::)`;

/** Characters that cannot immediately follow a standalone magic keyword. */
const RIGHT_BOUNDARY = String.raw`(?![\p{L}\p{N}_/\\-])(?!\.[\p{L}\p{N}_-])(?!\()`;

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/**
 * Case-sensitive magic-keyword matcher with prose punctuation boundaries:
 * sentence punctuation and quotes may touch the keyword; letters, digits,
 * underscores, slashes, backslashes, hyphens, file-extension dots, symbol
 * references (`foo::keyword`), and immediate call parentheses never match.
 */
export function magicKeywordRegex(keyword: string, flags = ""): RegExp {
  const normalizedFlags = flags.includes("u") ? flags : `${flags}u`;
  return new RegExp(`${LEFT_BOUNDARY}${escapeRegExp(keyword)}${RIGHT_BOUNDARY}`, normalizedFlags);
}

// ── Non-prose masking (OMP markdown-prose.ts, verbatim port) ───────────────

const TAG_NAME = /[A-Za-z][A-Za-z0-9-]*/y;
const FENCE = /^( {0,3})([`~]{3,})/;

function backtickRunEnd(text: string, i: number, n: number): number {
  let j = i;
  while (j < n && text[j] === "`") j += 1;
  return j;
}

function findBacktickClose(text: string, from: number, n: number, runLen: number, masked: Uint8Array): number {
  let k = from;
  while (k < n) {
    if (masked[k]) {
      k += 1;
      continue;
    }
    if (text[k] === "`") {
      const e = backtickRunEnd(text, k, n);
      if (e - k === runLen) return e;
      k = e;
      continue;
    }
    k += 1;
  }
  return -1;
}

function findTagEnd(text: string, j: number, n: number): number {
  let quote = "";
  for (let k = j; k < n; k += 1) {
    const ch = text[k];
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === ">") return k;
    if (ch === "<") return -1;
  }
  return -1;
}

function findMatchingClose(text: string, start: number, n: number, name: string, masked: Uint8Array): number {
  const lname = name.toLowerCase();
  let depth = 1;
  let k = start;
  while (k < n) {
    if (masked[k] || text[k] !== "<") {
      k += 1;
      continue;
    }
    let m = k + 1;
    let isClose = false;
    if (text[m] === "/") {
      isClose = true;
      m += 1;
    }
    TAG_NAME.lastIndex = m;
    const nm = TAG_NAME.exec(text);
    if (!nm) {
      k += 1;
      continue;
    }
    const gt = findTagEnd(text, TAG_NAME.lastIndex, n);
    if (gt < 0) {
      k += 1;
      continue;
    }
    if (nm[0].toLowerCase() === lname) {
      if (isClose) {
        depth -= 1;
        if (depth === 0) return gt + 1;
      } else if (text[gt - 1] !== "/") {
        depth += 1;
      }
    }
    k = gt + 1;
  }
  return -1;
}

function maskTagAt(text: string, i: number, n: number, masked: Uint8Array): number {
  if (text.startsWith("<!--", i)) {
    const end = text.indexOf("-->", i + 4);
    const stop = end < 0 ? n : end + 3;
    for (let p = i; p < stop; p += 1) masked[p] = 1;
    return stop;
  }
  let j = i + 1;
  let closing = false;
  if (text[j] === "/") {
    closing = true;
    j += 1;
  }
  TAG_NAME.lastIndex = j;
  const nm = TAG_NAME.exec(text);
  if (!nm) return i;
  const gt = findTagEnd(text, TAG_NAME.lastIndex, n);
  if (gt < 0) return i;
  const tagEnd = gt + 1;
  const selfClosing = text[gt - 1] === "/";
  for (let p = i; p < tagEnd; p += 1) masked[p] = 1;
  if (closing || selfClosing) return tagEnd;
  const close = findMatchingClose(text, tagEnd, n, nm[0], masked);
  if (close < 0) return tagEnd;
  for (let p = tagEnd; p < close; p += 1) masked[p] = 1;
  return close;
}

/**
 * Length-preserving copy of `text` with every non-prose region (fenced code
 * blocks, inline code spans, HTML/XML tags and their contents) blanked to
 * spaces. Indices map 1:1 onto the original, so a boundary match against the
 * mask still addresses `text` for painting.
 */
export function maskNonProse(text: string): string {
  if (!text.includes("`") && !text.includes("<")) return text;
  const n = text.length;
  const masked = new Uint8Array(n);

  // Phase 1: fenced code blocks, line by line.
  let fenceChar = "";
  let fenceLen = 0;
  let lineStart = 0;
  while (lineStart <= n) {
    let nl = text.indexOf("\n", lineStart);
    if (nl < 0) nl = n;
    const line = text.slice(lineStart, nl);
    const open = FENCE.exec(line);
    if (fenceChar) {
      for (let p = lineStart; p < nl; p += 1) masked[p] = 1;
      if (
        open &&
        open[2]![0] === fenceChar &&
        open[2]!.length >= fenceLen &&
        line.slice(open[1]!.length + open[2]!.length).trim() === ""
      ) {
        fenceChar = "";
        fenceLen = 0;
      }
    } else if (open) {
      const marker = open[2]!;
      const ch = marker[0]!;
      if (!(ch === "`" && line.slice(open[1]!.length + marker.length).includes("`"))) {
        fenceChar = ch;
        fenceLen = marker.length;
        for (let p = lineStart; p < nl; p += 1) masked[p] = 1;
      }
    }
    lineStart = nl + 1;
  }

  // Phase 2: inline code spans + HTML/XML constructs.
  let i = 0;
  while (i < n) {
    const ch = text[i]!;
    if (ch === "`" && !masked[i]) {
      const runEnd = backtickRunEnd(text, i, n);
      const runLen = runEnd - i;
      const close = findBacktickClose(text, runEnd, n, runLen, masked);
      if (close >= 0) {
        for (let p = i; p < close; p += 1) masked[p] = 1;
        i = close;
        continue;
      }
      i = runEnd;
      continue;
    }
    if (ch === "<" && !masked[i]) {
      const end = maskTagAt(text, i, n, masked);
      if (end > i) {
        i = end;
        continue;
      }
    }
    i += 1;
  }

  let out = "";
  for (let p = 0; p < n; p += 1) out += masked[p] ? (text[p] === "\n" ? "\n" : " ") : text[p];
  return out;
}

/** Whether `text` contains the standalone keyword in prose (never in code/markup). */
export function keywordInProse(text: string, word: RegExp): boolean {
  return word.test(maskNonProse(text));
}

// ── Gradient painting (OMP gradient-highlight.ts; Bun.color → local HSL) ────

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = ln - c / 2;
  return [
    Math.round((rgb[0] + m) * 255),
    Math.round((rgb[1] + m) * 255),
    Math.round((rgb[2] + m) * 255),
  ];
}

function colorEscape(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  if (supportsTrueColor()) return `\x1b[38;2;${r};${g};${b}m`;
  // 256-colour cube approximation.
  const q = (v: number): number => (v < 48 ? 0 : v < 115 ? 1 : Math.min(5, Math.round((v - 35) / 40)));
  return `\x1b[38;5;${16 + 36 * q(r) + 6 * q(g) + q(b)}m`;
}

const FG_RESET = "\x1b[39m";

/** Grapheme segmenter for shimmer painting — never split a surrogate pair. */
const SHIMMER_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export type KeywordHighlighter = (text: string, resetTo?: string, phase?: number) => string;

export interface GradientHighlightSpec {
  /** Cheap stateless presence probe (non-global). */
  probe: RegExp;
  /** Global, word-bounded match regex. */
  highlight: RegExp;
  /** Number of colour stops swept across the gradient. */
  stops: number;
  /** Normalized position t ∈ [0,1) → HSL hue in degrees. */
  hue: (t: number) => number;
  saturation?: number;
  lightness?: number;
}

/**
 * Build a stateless highlighter painting each standalone match with a smooth
 * HSL gradient. `phase` ∈ [0,1) cyclically rotates the stops — monotonically
 * increasing phases across repaints produce the moving shimmer. Zero-width:
 * only SGR escapes are added.
 */
export function createGradientHighlighter(spec: GradientHighlightSpec): KeywordHighlighter {
  const { probe, highlight, stops, hue, saturation = 90, lightness = 62 } = spec;

  let cachedPalette: readonly string[] | undefined;
  const palette = (): readonly string[] => {
    if (cachedPalette) return cachedPalette;
    const next: string[] = [];
    for (let i = 0; i < stops; i += 1) {
      next.push(colorEscape(hue(i / stops), saturation, lightness));
    }
    cachedPalette = next;
    return next;
  };

  const paint = (word: string, resetTo: string, phase: number): string => {
    const stopsArr = palette();
    const m = stopsArr.length;
    const n = word.length;
    let out = "";
    let prev = "";
    for (let i = 0; i < n; i += 1) {
      const t = (i / n + phase) % 1;
      const color = stopsArr[Math.floor(t * m) % m] ?? stopsArr[0] ?? "";
      if (color !== prev) {
        out += color;
        prev = color;
      }
      out += word[i];
    }
    return `${out}${resetTo}`;
  };

  return (text: string, resetTo: string = FG_RESET, phase: number = 0): string => {
    if (!probe.test(text)) return text;
    const wrappedPhase = ((phase % 1) + 1) % 1;
    const masked = maskNonProse(text);
    let out = "";
    let last = 0;
    for (const m of masked.matchAll(highlight)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      out += text.slice(last, start) + paint(text.slice(start, end), resetTo, wrappedPhase);
      last = end;
    }
    return out + text.slice(last);
  };
}

// ── The OpenKai keyword registry ────────────────────────────────────────────

export type MagicKeyword = "ultrathink" | "ultrareview";
/** The brand shimmer sweep (status-line activity) — Kaidera mint. */
export type ShimmerPalette = MagicKeyword | "brand";

interface KeywordSpec {
  gradient: GradientHighlightSpec;
}

const KEYWORD_SPECS: Record<MagicKeyword, KeywordSpec> = {
  // Rainbow sweep red→violet (OMP's ultrathink palette).
  ultrathink: {
    gradient: {
      probe: /ultrathink/,
      highlight: magicKeywordRegex("ultrathink", "g"),
      stops: 14,
      hue: (t) => t * 330,
    },
  },
  // Cool cyan→violet sweep so the two keywords read differently at a glance.
  ultrareview: {
    gradient: {
      probe: /ultrareview/,
      highlight: magicKeywordRegex("ultrareview", "g"),
      stops: 14,
      hue: (t) => 180 + t * 150,
    },
  },
};

const HIGHLIGHTERS: Record<MagicKeyword, KeywordHighlighter> = {
  ultrathink: createGradientHighlighter(KEYWORD_SPECS.ultrathink.gradient),
  ultrareview: createGradientHighlighter(KEYWORD_SPECS.ultrareview.gradient),
};

/** Hidden notice appended to the model payload for an ultrathink turn (OMP's). */
export const ULTRATHINK_NOTICE =
  "<system-notice>\nMulti-step reasoning: think carefully through the problem before responding.\n</system-notice>";

/** Hidden notice for an ultrareview turn (multi-model adversarial review). */
export const ULTRAREVIEW_NOTICE =
  "<system-notice>\nAdversarial review: attack the change set for bugs, logic errors, security issues, and regressions before summarising.\n</system-notice>";

/** Config slice for the magic keywords (default-on posture). */
export function magicKeywordEnabled(keyword: MagicKeyword): boolean {
  const config = readConfigFile();
  const slice = config["magicKeywords"];
  if (typeof slice !== "object" || slice === null) return true;
  const record = slice as Record<string, unknown>;
  if (record["enabled"] === false) return false;
  return record[keyword] !== false;
}

/** The keywords present (as standalone prose) in `text`, honouring toggles. */
export function detectMagicKeywords(text: string): MagicKeyword[] {
  const out: MagicKeyword[] = [];
  for (const keyword of ["ultrathink", "ultrareview"] as const) {
    if (!magicKeywordEnabled(keyword)) continue;
    if (keywordInProse(text, magicKeywordRegex(keyword))) out.push(keyword);
  }
  return out;
}

/** Fast presence probe for the composer shimmer clock (no masking, no config). */
export function mightContainMagicKeyword(text: string): boolean {
  return text.includes("ultrathink") || text.includes("ultrareview");
}

/**
 * Paint every enabled standalone keyword in `text` with its gradient.
 * `phase` animates the shimmer (composer live view); `0` is the static
 * palette (sent messages). Painting honours the same prose masking as
 * detection — keywords inside code/markup never paint.
 */
export function paintMagicKeywords(text: string, phase = 0, resetTo?: string): string {
  let out = text;
  for (const keyword of ["ultrathink", "ultrareview"] as const) {
    if (!magicKeywordEnabled(keyword)) continue;
    out = HIGHLIGHTERS[keyword](out, resetTo ?? FG_RESET, phase);
  }
  return out;
}

/** The animated phase for a shimmer frame — call per repaint tick. */
export function shimmerPhase(now = Date.now()): number {
  return (now / 900) % 1;
}

/**
 * Paint an arbitrary label with a keyword's gradient palette (no boundary
 * matching — for the status line's "ultrathinking…" / "ultrareviewing…"
 * activity chips, where the label itself IS the keyword's surface).
 * `brand` is the generic busy sweep (E019: every working state shimmers).
 */
export function paintShimmerLabel(label: string, keyword: ShimmerPalette, phase = shimmerPhase()): string {
  const spec =
    keyword === "brand"
      ? { stops: 14, hue: (t: number) => 140 + t * 60, saturation: 55, lightness: 68 }
      : { ...KEYWORD_SPECS[keyword].gradient };
  // Iterate GRAPHEMES, not UTF-16 code units: a per-unit loop inserts the SGR
  // between the halves of an astral surrogate pair (emoji) or before a
  // combining mark, corrupting the glyph into U+FFFD. The status-line brand
  // sweep paints `state.activity`, which carries a model/MCP-chosen tool name
  // (`tool: <name>`) — so an emoji-named tool is a model-reachable corruption
  // (E019 area 4/F5). Same Segmenter idiom as composer.ts positionCursorAt.
  const graphemes = [...SHIMMER_SEGMENTER.segment(label)];
  const n = graphemes.length;
  if (n === 0) return label;
  const wrappedPhase = ((phase % 1) + 1) % 1;
  let out = "";
  let prev = "";
  for (let i = 0; i < n; i += 1) {
    const t = (i / n + wrappedPhase) % 1;
    const escape = colorEscape(spec.hue(t), spec.saturation ?? 90, spec.lightness ?? 62);
    if (escape !== prev) {
      out += escape;
      prev = escape;
    }
    out += graphemes[i]!.segment;
  }
  return `${out}${FG_RESET}`;
}
