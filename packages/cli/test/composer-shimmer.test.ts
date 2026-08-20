/**
 * Composer shimmer render test (E017 UK round 4): the ComposerEditor render
 * override paints standalone magic keywords with the gradient SGR and leaves
 * everything else untouched.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { TUI } from "@earendil-works/pi-tui";

import { Composer } from "../dist/tui/composer.js";

function headlessTui(): TUI {
  const noop = (): void => {};
  return {
    terminal: { rows: 24, columns: 80 } as TUI["terminal"],
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

test("composer render paints ultrathink with gradient SGR; plain text stays plain", () => {
  const tui = headlessTui();
  const composer = new Composer(tui, { onSubmit: () => undefined });
  const countSgr = (text: string): number => (text.match(/\x1b\[38;(2|5);/g) ?? []).length;
  try {
    // Baseline: the editor theme itself may emit truecolor SGR (borders,
    // prompt) — the keyword's gradient must ADD escapes around the word.
    composer.editor.setText("just an ordinary prompt");
    const baseline = countSgr(composer.editor.render(80).join("\n"));

    composer.editor.setText("ultrathink about the cache");
    const painted = composer.editor.render(80).join("\n");
    const stripped = painted.replace(/\x1b\[[0-9;]*m/g, "");
    assert.ok(stripped.includes("ultrathink"), "the word itself renders (SGR stripped)");
    assert.ok(countSgr(painted) > baseline, "the keyword gradient adds SGR over the theme baseline");

    composer.editor.setText("`ultrathink` inside a code span");
    const codeSpan = composer.editor.render(80).join("\n");
    assert.equal(countSgr(codeSpan), baseline, "code-span keywords never paint");
  } finally {
    clearInterval((composer as unknown as { shimmerTimer: NodeJS.Timeout }).shimmerTimer);
  }
});

test("the shimmer phase moves between renders", () => {
  const tui = headlessTui();
  const composer = new Composer(tui, { onSubmit: () => undefined });
  try {
    composer.editor.setText("ultrareview");
    const first = composer.editor.render(80).join("\n");
    // Force a later phase by waiting past the 900ms cycle boundary.
    const start = Date.now();
    while (Date.now() - start < 950) {
      // busy-wait one shimmer cycle (test-scale, sub-second)
    }
    const second = composer.editor.render(80).join("\n");
    assert.notEqual(first, second, "the gradient phase rotates — the shimmer moves");
  } finally {
    clearInterval((composer as unknown as { shimmerTimer: NodeJS.Timeout }).shimmerTimer);
  }
});
