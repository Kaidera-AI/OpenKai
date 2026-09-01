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

/**
 * The OpenKai product version (fork line). THIS IS THE LOCKSTEP STAMP for the
 * fork: bump it here, in the OpenKai programme repo's CHANGELOG ([x.y.z]
 * heading), and in the release tag (v0.1.0NN) together at cut time. omp's own
 * `VERSION` (18.x) is the engine version underneath; surfaces that name the
 * product (welcome title, `--version`, the witnessed upgrade's currentVersion,
 * the splash) read THIS constant, so the 0.1.x manifest namespace and the
 * engine namespace never mix in a comparison.
 */
export const PRODUCT_VERSION = "0.1.10";

/** The product's command name for user-facing help/version surfaces. The
 * process name and the user-data dir (~/.omp) stay omp — renaming those is a
 * data-migration decision, not a display one. */
export const PRODUCT_BIN = "openkai";
