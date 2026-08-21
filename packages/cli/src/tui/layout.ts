/**
 * Central width-and-height layout resolver (OK-10 Wave 0).
 * Breakpoints are defined once here and consumed as presentation policy.
 */

export type LayoutMode = "compact" | "narrow" | "standard" | "workspace" | "wide";
export type HeightMode = "short" | "medium" | "tall";

export const LAYOUT_COLUMNS = {
  narrow: 60,
  standard: 80,
  workspace: 120,
  wide: 160,
} as const;

export const LAYOUT_ROWS = {
  medium: 16,
  tall: 24,
} as const;

export const MIN_COLUMNS = 20;
export const MIN_ROWS = 4;
export const COMPACT_COMPOSER_ROWS = 4;
export const DEFAULT_COMPOSER_ROWS = 12;

export function clampColumns(columns: number | undefined): number {
  return Number.isFinite(columns) ? Math.max(MIN_COLUMNS, Math.floor(columns!)) : MIN_COLUMNS;
}

export function clampRows(rows: number | undefined): number {
  return Number.isFinite(rows) ? Math.max(MIN_ROWS, Math.floor(rows!)) : MIN_ROWS;
}

/** The single geometry-to-mode decision point. */
export function resolveLayoutMode(columns: number, rows: number): LayoutMode {
  const width = clampColumns(columns);
  if (clampRows(rows) < LAYOUT_ROWS.medium || width < LAYOUT_COLUMNS.narrow) return "compact";
  if (width < LAYOUT_COLUMNS.standard) return "narrow";
  if (width < LAYOUT_COLUMNS.workspace) return "standard";
  if (width < LAYOUT_COLUMNS.wide) return "workspace";
  return "wide";
}

export interface Layout {
  mode: LayoutMode;
  height: HeightMode;
  columns: number;
  rows: number;
  composerMaxRows: number;
  overlaysFullScreen: boolean;
  showBootExtras: boolean;
  decorativeRows: boolean;
  multiPane: boolean;
}

export function resolveLayout(columns: number, rows: number): Layout {
  const safeRows = clampRows(rows);
  const height: HeightMode = safeRows < LAYOUT_ROWS.medium ? "short" : safeRows < LAYOUT_ROWS.tall ? "medium" : "tall";
  const mode = resolveLayoutMode(columns, safeRows);
  return {
    mode,
    height,
    columns: clampColumns(columns),
    rows: safeRows,
    composerMaxRows: height === "short" ? COMPACT_COMPOSER_ROWS : DEFAULT_COMPOSER_ROWS,
    overlaysFullScreen: mode === "compact",
    showBootExtras: mode !== "compact",
    decorativeRows: height === "tall",
    multiPane: mode !== "compact" && mode !== "narrow",
  };
}

export interface OverlaySpec {
  anchor: "center";
  width: `${number}%`;
  maxHeight: `${number}%`;
}

/** Responsive geometry shared by every overlay call site. */
export function overlaySpec(
  layout: Layout,
  width: `${number}%`,
  maxHeight: `${number}%` = "80%",
): OverlaySpec {
  return layout.overlaysFullScreen
    ? { anchor: "center", width: "100%", maxHeight: "100%" }
    : { anchor: "center", width, maxHeight };
}
