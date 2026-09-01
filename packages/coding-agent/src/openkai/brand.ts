/**
 * openkai/brand — the Kaidera identity for the fork's TUI surfaces (E022 Inc 01).
 *
 * The formula: functionality from omp, look and feel from Droid/Kaidera.
 * Canonical mark: the sharp hexagon (no curves) holding the node triangle,
 * hand-authored with box-drawing strokes; mint `#B0E1CD` is the brand accent
 * (carried by the kaidera theme JSONs, not here).
 *
 * Upstream surfaces import these through the sanctioned touch-list:
 * welcome.ts's brand-mark constant (the splash hero, welcome box, wizard
 * overlay and outro all derive from it) and the splash wordmark line.
 */

/**
 * The Kaidera hex-node mark, sized for the brand-mark slot (10×5 cells — the
 * same row count as the π mark it replaces, so the wizard-overlay header and
 * every render budget derived from logo height stays byte-identical).
 */
export const KAIDERA_MARK: readonly string[] = [
	"    /\\    ",
	"   /  \\   ",
	"  | ●● |  ",
	"   \\  /   ",
	"    \\/    ",
];

/** The status-line glyph — a filled sharp hexagon. */
export const KAIDERA_GLYPH = "⬣";

/** The spaced wordmark for the splash's compact fallback row. */
export const OPENKAI_WORDMARK = "O p e n K a i";

/** Provenance line shown under the wordmark where space allows. */
export const BRAND_TAGLINE = "by Kaidera";
