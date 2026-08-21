/**
 * Central terminal-capability resolver (OK-10 Wave 0).
 *
 * Environment and TTY facts become rendering policy here, once. Components
 * consume {@link capabilities}; they do not probe TERM/COLORTERM/NO_COLOR on
 * their own. The pure {@link resolveCapabilities} entry point keeps the full
 * ladder fixtureable without mutating process state.
 */

/** Colour rungs supported by the terminal renderer. */
export type ColourDepth = "none" | "ansi16" | "ansi256" | "truecolour";

/** The rendering/control features OpenKai may use for one terminal. */
export interface TerminalCapabilities {
  /** Plain output is required (non-TTY or TERM=dumb). */
  plain: boolean;
  /** Colour depth; `none` emits no colour-selecting SGR. */
  colour: ColourDepth;
  /** Unicode UI glyphs are safe. */
  unicode: boolean;
  /** The alternate screen may be entered. */
  altScreen: boolean;
  /** Mouse/focus tracking may be enabled. */
  mouse: boolean;
  /** OSC queries, links, titles, and notifications may be emitted. */
  osc: boolean;
  /** Motion is static/deterministic. */
  reducedMotion: boolean;
}

/** Operator settings. Plain mode remains a hard safety floor. */
export interface CapabilityOverrides {
  colour?: ColourDepth;
  unicode?: boolean;
  reducedMotion?: boolean;
}

export type CapabilityEnvironment = Record<string, string | undefined>;

const TERM_16 = /(^|-)(ansi|linux|vt\d{2,3}|xterm-color|color)$|16color/;

function flag(value: string | undefined): boolean {
  if (value === undefined) return false;
  const normalised = value.trim().toLowerCase();
  return normalised !== "" && normalised !== "0" && normalised !== "false" && normalised !== "no";
}

function noColorRequested(env: CapabilityEnvironment): boolean {
  const value = env["NO_COLOR"];
  return value !== undefined && value.trim() !== "";
}

function explicitColour(env: CapabilityEnvironment): ColourDepth | undefined {
  switch ((env["OPENKAI_COLOR"] ?? "").trim().toLowerCase()) {
    case "none":
    case "0":
      return "none";
    case "16":
    case "ansi16":
      return "ansi16";
    case "256":
    case "ansi256":
      return "ansi256";
    case "truecolor":
    case "truecolour":
    case "24bit":
      return "truecolour";
    default:
      return undefined;
  }
}

function inferredColour(env: CapabilityEnvironment): ColourDepth {
  const colorterm = (env["COLORTERM"] ?? "").toLowerCase();
  if (colorterm.includes("truecolor") || colorterm.includes("24bit")) return "truecolour";
  const term = (env["TERM"] ?? "").toLowerCase();
  if (term.includes("256")) return "ansi256";
  if (TERM_16.test(term)) return "ansi16";
  // Preserve OpenKai's shipped compatibility floor for otherwise unknown TTYs.
  return "ansi256";
}

function unicodeSafe(env: CapabilityEnvironment): boolean {
  const locale = env["LC_ALL"] ?? env["LC_CTYPE"] ?? env["LANG"];
  if (locale === undefined || locale.trim() === "") return true;
  return /utf-?8/i.test(locale);
}

/** Resolve the complete capability ladder from explicit inputs. */
export function resolveCapabilities(
  env: CapabilityEnvironment = process.env,
  isTty: boolean = process.stdout.isTTY === true,
  overrides: CapabilityOverrides = {},
): TerminalCapabilities {
  const plain = !isTty || (env["TERM"] ?? "").trim().toLowerCase() === "dumb";
  if (plain) {
    return {
      plain: true,
      colour: "none",
      unicode: false,
      altScreen: false,
      mouse: false,
      osc: false,
      reducedMotion: true,
    };
  }

  const colour = overrides.colour ?? (noColorRequested(env) ? "none" : explicitColour(env) ?? inferredColour(env));
  const unicode = overrides.unicode ?? (!flag(env["OPENKAI_ASCII"]) && unicodeSafe(env));
  const reducedMotion =
    overrides.reducedMotion ?? (flag(env["NO_MOTION"]) || flag(env["OPENKAI_REDUCED_MOTION"]));

  return {
    plain: false,
    colour,
    unicode,
    altScreen: true,
    mouse: true,
    osc: true,
    reducedMotion,
  };
}

// Headless/component rendering is an ANSI-256 virtual terminal unless an
// entry point explicitly configures a real terminal. This keeps fixtures
// deterministic while runTui still resolves the actual process environment.
const VIRTUAL_ENV: CapabilityEnvironment = { TERM: "xterm-256color", LANG: "C.UTF-8" };
let activeEnv: CapabilityEnvironment = VIRTUAL_ENV;
let activeIsTty = true;
let activeOverrides: CapabilityOverrides = {};
let active = resolveCapabilities(activeEnv, activeIsTty, activeOverrides);

/** Current rendering capabilities. */
export function capabilities(): TerminalCapabilities {
  return active;
}

/** Configure the process render context at an entry-point boundary. */
export function configureCapabilities(
  env: CapabilityEnvironment,
  isTty: boolean,
  overrides: CapabilityOverrides = {},
): TerminalCapabilities {
  activeEnv = env;
  activeIsTty = isTty;
  activeOverrides = { ...overrides };
  active = resolveCapabilities(activeEnv, activeIsTty, activeOverrides);
  return active;
}

/** Apply operator settings; overrides win over non-plain environment hints. */
export function setCapabilityOverrides(next: CapabilityOverrides): TerminalCapabilities {
  activeOverrides = { ...activeOverrides, ...next };
  active = resolveCapabilities(activeEnv, activeIsTty, activeOverrides);
  return active;
}

/** Restore the deterministic virtual-terminal context (test/headless teardown). */
export function resetCapabilities(): TerminalCapabilities {
  activeEnv = VIRTUAL_ENV;
  activeIsTty = true;
  activeOverrides = {};
  active = resolveCapabilities(activeEnv, activeIsTty, activeOverrides);
  return active;
}

/** Convert an xterm-256 index to RGB. */
export function xterm256Rgb(index: number): readonly [number, number, number] {
  const n = Math.max(0, Math.min(255, Math.floor(index)));
  const base: readonly (readonly [number, number, number])[] = [
    [0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0],
    [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192],
    [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0],
    [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
  ];
  if (n < 16) return base[n]!;
  if (n < 232) {
    const cube = n - 16;
    const level = (value: number): number => (value === 0 ? 0 : 55 + value * 40);
    return [level(Math.floor(cube / 36) % 6), level(Math.floor(cube / 6) % 6), level(cube % 6)];
  }
  const grey = (n - 232) * 10 + 8;
  return [grey, grey, grey];
}

/** Deterministically map an xterm colour to the nearest ANSI-16 entry. */
export function ansi16From256(index: number): number {
  // Mint is a semantic focus colour; bright cyan preserves that role better
  // than the numerically-nearest white on a 16-colour terminal.
  if (index === 152) return 14;
  const [r, g, b] = xterm256Rgb(index);
  const palette = Array.from({ length: 16 }, (_, i) => xterm256Rgb(i));
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const [pr, pg, pb] = palette[i]!;
    const next = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (next < distance) {
      distance = next;
      best = i;
    }
  }
  return best;
}

export function ansi16Fg(index: number): number {
  return index < 8 ? 30 + index : 90 + (index - 8);
}

export function ansi16Bg(index: number): number {
  return index < 8 ? 40 + index : 100 + (index - 8);
}

/** Choose a UI glyph without re-probing locale/environment. */
export function glyph(unicode: string, ascii: string): string {
  return capabilities().unicode ? unicode : ascii;
}

const ASCII_GLYPHS: Readonly<Record<string, string>> = {
  "─": "-", "━": "-", "═": "-", "│": "|", "┃": "|", "║": "|",
  "┌": "+", "┐": "+", "└": "+", "┘": "+", "╭": "+", "╮": "+",
  "╰": "+", "╯": "+", "├": "+", "┤": "+", "┬": "+", "┴": "+",
  "┼": "+", "╋": "+", "▶": ">", "▸": ">", "→": ">", "←": "<",
  "↑": "^", "↓": "v", "●": "*", "○": "o", "◉": "!", "◐": "?",
  "✓": "+", "✗": "x", "•": "*", "·": "|", "…": "~", "—": "-",
  "–": "-", "↻": "~", "⇄": "~", "⤷": ">", "⬡": "*",
};

/** Deterministic, one-cell ASCII fallback for a rendered terminal string. */
export function asciiFallback(value: string): string {
  let out = "";
  for (const char of value.normalize("NFKD")) {
    const mapped = ASCII_GLYPHS[char];
    if (mapped !== undefined) out += mapped;
    else if (/\p{M}/u.test(char)) continue;
    else out += char.codePointAt(0)! <= 0x7f ? char : "?";
  }
  return out;
}

/** Apply the active glyph policy to already-rendered text. */
export function renderTerminalText(value: string): string {
  return capabilities().unicode ? value : asciiFallback(value);
}

/** Remove OSC/APC/DCS/CSI and other ESC sequences for true plain output. */
export function stripTerminalSequences(value: string): string {
  return value
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[_P^X][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b./g, "");
}

/** Final sink transform used by TERM=dumb/non-TTY runtime output. */
export function plainTerminalText(value: string): string {
  return asciiFallback(stripTerminalSequences(value));
}
