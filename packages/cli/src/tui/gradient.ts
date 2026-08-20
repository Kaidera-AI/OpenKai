/**
 * Gradient + shine splash engine — lifted from oh-my-pi
 * (`packages/coding-agent/src/modes/components/welcome.ts` and
 * `modes/setup-wizard/scenes/splash.ts`, MIT © can1357/oh-my-pi). Art swapped
 * for the Kaidera mark + OpenKai wordmark; the gradient/shine machinery and
 * the starfield/water scene semantics are theirs.
 */

import { brandTint, BRAND_RAMP } from "./theme.js";


/** Multi-stop truecolour palette — Kaidera brand: graphite → steel → mint → mint-hover → paper. */
const GRADIENT_STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [48, 50, 52],     // graphite  #303234
  [133, 138, 136],  // steel     #858A88
  [176, 225, 205],  // mint      #B0E1CD
  [147, 217, 187],  // mint hover #93D9BB
  [241, 241, 237],  // paper     #F1F1ED
];

const SHINE_HALF_WIDTH = 0.18;

export interface ShineConfig {
  strength: number;
  pos: number;
}

export const supportsTrueColor = (): boolean =>
  (process.env.COLORTERM ?? "").toLowerCase().includes("truecolor") ||
  (process.env.COLORTERM ?? "").toLowerCase().includes("24bit");

/** Gradient SGR for position t along the diagonal, compositing the shine band. */
export function gradientEscape(t: number, shine?: ShineConfig): string {
  const shineStrength = shine && shine.strength > 0 ? shine.strength : 0;
  const shinePos = shine ? shine.pos : 0;
  if (supportsTrueColor()) {
    const seg = t * (GRADIENT_STOPS.length - 1);
    const i = Math.min(GRADIENT_STOPS.length - 2, Math.floor(seg));
    const f = seg - i;
    const a = GRADIENT_STOPS[i]!;
    const b = GRADIENT_STOPS[i + 1]!;
    let r = a[0] + (b[0] - a[0]) * f;
    let g = a[1] + (b[1] - a[1]) * f;
    let bl = a[2] + (b[2] - a[2]) * f;
    if (shineStrength > 0) {
      const dist = Math.abs(t - shinePos);
      const intensity = Math.max(0, 1 - dist / SHINE_HALF_WIDTH) * shineStrength;
      if (intensity > 0) {
        r += (255 - r) * intensity;
        g += (255 - g) * intensity;
        bl += (255 - bl) * intensity;
      }
    }
    return `\x1b[38;2;${Math.round(r)};${Math.round(g)};${Math.round(bl)}m`;
  }
  const idx = Math.min(
    BRAND_RAMP.length - 1,
    Math.max(0, Math.floor(t * (BRAND_RAMP.length - 1) + 0.5)),
  );
  // Keep the SGR prefix, drop the trailing reset. fg256's reset is `\x1b[39m`
  // (5 chars) — a fixed-width slice left a bare ESC on every glyph, and ESC+`\`
  // is ANSI ST, so compositing swallowed the brand mark's backslashes on
  // non-truecolor terminals (E019 inc 04 F3, ported from a23368c).
  return brandTint("", idx).replace(/\x1b\[(?:0|39)m$/, "");
}

/** Diagonal gradient + optional sliding shine band over multi-line art. */
export function gradientLogo(lines: readonly string[], phase = 0, shine?: ShineConfig): string[] {
  const reset = "\x1b[0m";
  const rows = lines.length;
  const cols = Math.max(...lines.map((l) => l.length));
  const span = Math.max(1, cols + rows - 1);
  return lines.map((line, y) => {
    let result = "";
    for (let x = 0; x < line.length; x += 1) {
      const char = line[x]!;
      if (char === " ") {
        result += char;
        continue;
      }
      const base = (x + (rows - 1 - y)) / span;
      const t = (((base + phase) % 1) + 1) % 1;
      result += gradientEscape(t, shine) + char + reset;
    }
    return result;
  });
}

const INTRO_SWEEPS = 2.5;
const INTRO_SHINE_TRAVERSALS = 3;

/** One intro frame: ease-out spin-down with shine traversals (omp's choreography). */
export function introLogoFrame(lines: readonly string[], progress: number): string[] {
  const eased = 1 - (1 - progress) ** 3;
  const phase = ((((1 - eased) * INTRO_SWEEPS) % 1) + 1) % 1;
  const shinePos = (((progress * INTRO_SHINE_TRAVERSALS) % 1) + 1) % 1;
  const shineStrength = (1 - eased) ** 1.5;
  return gradientLogo(lines, phase, { strength: shineStrength, pos: shinePos });
}
