/**
 * Click-to-cursor (E019 inc 03): the routing grammar and the position map.
 *
 *  1. Press inside the composer is held (not passed to pi-tui's selection).
 *  2. Press→release with no drag positions the cursor (Claude Code grammar).
 *  3. Press→drag replays the press to pi-tui so drag-selection still works.
 *  4. Presses outside the composer pass through untouched.
 *  5. positionCursorAt maps visual points to logical cursor positions.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { TUI } from "@earendil-works/pi-tui";

import { installMouseRouting, parseSgr } from "../dist/tui/mouse-routing.js";
import { Composer } from "../dist/tui/composer.js";

function headlessTui(columns = 80, rows = 24): TUI {
  const noop = (): void => {};
  return {
    terminal: { rows, columns } as TUI["terminal"],
    mode: "fullscreen" as const,
    children: [] as unknown as TUI["children"],
    addChild: noop as unknown as TUI["addChild"],
    getShowHardwareCursor: () => false,
    setFocus: noop as unknown as TUI["setFocus"],
    showOverlay: noop as unknown as TUI["showOverlay"],
    hideOverlay: noop as unknown as TUI["hideOverlay"],
    hasOverlay: () => false,
    start: noop,
    stop: noop as unknown as TUI["stop"],
    requestRender: noop,
    addInputListener: (() => () => {}) as unknown as TUI["addInputListener"],
    invalidate: noop,
    render: () => [],
  } as unknown as TUI;
}

/** A routable TUI stub: captures what the "viewport" (pi-tui) would receive. */
function routableTui(columns = 80, rows = 24): { tui: TUI; received: string[] } {
  const received: string[] = [];
  const tui = headlessTui(columns, rows) as unknown as TUI & {
    handleViewportInput: (data: string) => { consume: boolean } | undefined;
  };
  tui.handleViewportInput = (data: string) => {
    received.push(data);
    return { consume: true };
  };
  return { tui, received };
}

test("parseSgr reads press/release/motion shapes", () => {
  assert.deepEqual(parseSgr("\x1b[<0;10;20M"), { button: 0, x: 10, y: 20, release: false });
  assert.deepEqual(parseSgr("\x1b[<0;10;20m"), { button: 0, x: 10, y: 20, release: true });
  assert.equal(parseSgr("a"), undefined);
});

test("click inside the composer positions the cursor; drag replays to the viewport", () => {
  const { tui, received } = routableTui(80, 24);
  const positions: Array<{ row: number; col: number }> = [];
  installMouseRouting(
    tui,
    {
      geometry: () => ({ height: 4, paddingX: 1 }),
      positionCursorAt: (row, col) => positions.push({ row, col }),
    },
    () => 24,
  );
  const route = (tui as unknown as { handleViewportInput: (d: string) => unknown }).handleViewportInput;

  // Composer occupies rows 20-23 (24 - 4); content rows are 21-22.
  // Click at (x=10, y=21) → content row 0, col 8.
  route("\x1b[<0;10;21M");
  assert.equal(received.length, 0, "the press is held — pi-tui's selection never starts");
  route("\x1b[<0;10;21m");
  assert.deepEqual(positions, [{ row: 0, col: 8 }], "release positions the cursor");
  assert.equal(received.length, 0, "the release is swallowed too");

  // Press then drag: the press is replayed so selection works.
  route("\x1b[<0;10;21M");
  route("\x1b[<32;10;19M");
  assert.deepEqual(received, ["\x1b[<0;10;21M", "\x1b[<32;10;19M"], "drag replays press + motion");
  assert.equal(positions.length, 1, "drag does not position the cursor");

  // Press outside the composer passes straight through.
  route("\x1b[<0;10;5M");
  assert.equal(received.length, 3, "outside press untouched");
});

test("positionCursorAt maps visual points to logical cursor positions", () => {
  const tui = headlessTui(40, 24);
  const composer = new Composer(tui, { onSubmit: () => undefined });
  try {
    composer.editor.setText("alpha beta gamma");
    composer.positionCursorAt(0, 5);
    assert.deepEqual(composer.editor.getCursor(), { line: 0, col: 5 }, "single-line click");

    composer.editor.setText("one\ntwo three\nfour");
    composer.positionCursorAt(1, 4);
    assert.deepEqual(composer.editor.getCursor(), { line: 1, col: 4 }, "second logical line");

    composer.positionCursorAt(2, 99);
    assert.deepEqual(composer.editor.getCursor(), { line: 2, col: 4 }, "past line end clamps to line length");

    // Click below the text: document end.
    composer.positionCursorAt(9, 0);
    assert.deepEqual(composer.editor.getCursor(), { line: 2, col: 4 }, "below text lands at document end");
  } finally {
    clearInterval((composer as unknown as { shimmerTimer: NodeJS.Timeout }).shimmerTimer);
  }
});

test("positionCursorAt handles wrapped lines via the rendered layout", () => {
  const tui = headlessTui(20, 24); // narrow: forces wraps
  const composer = new Composer(tui, { onSubmit: () => undefined });
  try {
    // Content width 18 (paddingX 1 both sides): this line wraps mid-word-flow.
    composer.editor.setText("aaaa bbbb cccc dddd eeee");
    // Second visual row, first column → somewhere into the wrapped tail.
    composer.positionCursorAt(1, 0);
    const { line, col } = composer.editor.getCursor();
    assert.equal(line, 0, "wrapped line is still one logical line");
    assert.ok(col > 0 && col < 24, `wrapped click lands inside the line (got col ${col})`);
  } finally {
    clearInterval((composer as unknown as { shimmerTimer: NodeJS.Timeout }).shimmerTimer);
  }
});
