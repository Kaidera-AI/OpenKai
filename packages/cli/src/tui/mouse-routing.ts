/**
 * Click-to-cursor mouse routing (E019 inc 03 — Claude Code grammar): a
 * press+release inside the composer with no drag between them moves the
 * text cursor to the clicked point; a press that turns into a drag is
 * handed BACK to pi-tui's viewport handler so drag-selection still works.
 *
 * pi-tui's TuiAltScreen consumes every mouse press for selection before
 * OpenKai's input listeners run, and exposes no routing hook — so this
 * module wraps its (private) `handleViewportInput` at runtime. The wrap is
 * deliberate and narrow: only SGR button-0 press/release and drag-motion
 * are intercepted; everything else passes through untouched.
 */

import type { TUI } from "@earendil-works/pi-tui";

/** A parsed SGR mouse event (only the fields the router needs). */
interface SgrMouseEvent {
  button: number;
  x: number; // 1-based columns, as sent
  y: number; // 1-based rows, as sent
  release: boolean;
}

const SGR = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/;

export function parseSgr(data: string): SgrMouseEvent | undefined {
  const match = SGR.exec(data);
  if (!match) return undefined;
  return {
    button: Number.parseInt(match[1]!, 10),
    x: Number.parseInt(match[2]!, 10),
    y: Number.parseInt(match[3]!, 10),
    release: match[4] === "m",
  };
}

/** Where a click landed, in composer-local content coordinates. */
export interface ComposerPoint {
  /** 0-based row within the composer's CONTENT area (borders excluded). */
  row: number;
  /** 0-based column within the row (composer padding excluded). */
  col: number;
}

export interface ComposerGeometry {
  /** Terminal rows the composer occupies (including its two borders). */
  height: number;
  /** Composer left/right padding (the click's col is x - paddingX). */
  paddingX: number;
}

type ViewportResult = { consume: boolean } | undefined;
type ViewportHandler = (data: string) => ViewportResult;

/** The surface the router needs from the app: geometry + cursor placement. */
export interface ClickTarget {
  geometry(): ComposerGeometry;
  positionCursorAt(row: number, col: number): void;
}

/**
 * Install the click-to-cursor router on a TuiAltScreen. `composerRectTop`
 * computes the composer's first screen row at call time (it reflows with
 * content); `terminalRows` comes from the TUI terminal.
 */
export function installMouseRouting(
  tui: TUI,
  target: ClickTarget,
  screenRows: () => number,
): void {
  // Vendored-private wrap (E019): pi-tui's mouse routing is final and its
  // listener consumed presses before ours — the closure it registered calls
  // this method dynamically, so wrapping it reroutes exactly the events we
  // care about. Typed to the observed shape; no other member is touched.
  const routable = tui as unknown as { handleViewportInput: ViewportHandler };
  const original = routable.handleViewportInput;
  let pendingClick: { x: number; y: number } | undefined;

  const toComposerPoint = (x: number, y: number): ComposerPoint | undefined => {
    const geometry = target.geometry();
    // 1-based rows: status line = last row; the composer occupies the
    // `height` rows above it, with border rows at top and bottom.
    const top = screenRows() - geometry.height; // the composer's top border row
    if (y <= top || y >= top + geometry.height - 1) return undefined; // border or outside
    const row = y - top - 1; // 0-based content row
    const col = Math.max(0, x - 1 - geometry.paddingX); // 1-based → 0-based, minus padding
    return { row, col };
  };

  routable.handleViewportInput = (data: string): ViewportResult => {
    const event = parseSgr(data);
    if (event === undefined) return original.call(routable, data);
    // An open overlay owns the screen — clicks route to the viewport's own
    // handling (AdvMouse: the composer rect math must not fire beneath one).
    if (tui.hasOverlay()) {
      pendingClick = undefined;
      return original.call(routable, data);
    }

    // Left press inside the composer: hold as a candidate click (consumed so
    // the viewport's selection never starts).
    if (!event.release && event.button === 0) {
      const point = toComposerPoint(event.x, event.y);
      if (point !== undefined) {
        pendingClick = { x: event.x, y: event.y };
        return { consume: true };
      }
      return original.call(routable, data);
    }

    // Motion with a button held (32+button) while a click is pending: the
    // gesture became a DRAG — replay the press into the viewport handler so
    // its selection starts, then forward the motion.
    if (!event.release && (event.button & 32) !== 0 && pendingClick !== undefined) {
      const replay = `\x1b[<0;${pendingClick.x};${pendingClick.y}M`;
      pendingClick = undefined;
      original.call(routable, replay);
      return original.call(routable, data);
    }

    // Release while a click is pending: position the cursor, swallow the
    // release (no selection was started). The RELEASE's own coordinates are
    // the target — a resize between press and release makes press coords
    // stale (AdvMouse).
    if (event.release && event.button === 0 && pendingClick !== undefined) {
      pendingClick = undefined;
      const point = toComposerPoint(event.x, event.y);
      if (point !== undefined) target.positionCursorAt(point.row, point.col);
      return { consume: true };
    }

    return original.call(routable, data);
  };
}
