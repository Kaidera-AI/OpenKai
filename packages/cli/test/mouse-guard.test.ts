/**
 * Mouse guard (E019 inc 02): every mouse encoding a terminal can send is
 * recognised and swallowed; nothing mouse-shaped ever reaches a component
 * as literal digits.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { isMouseShapedSequence } from "../dist/tui/mouse-guard.js";

test("SGR 1006 mouse reports are caught (press, release, motion, wheel)", () => {
  assert.ok(isMouseShapedSequence("\x1b[<0;30;5M"), "left press");
  assert.ok(isMouseShapedSequence("\x1b[<0;30;5m"), "release");
  assert.ok(isMouseShapedSequence("\x1b[<35;64;23M"), "all-motion move");
  assert.ok(isMouseShapedSequence("\x1b[<32;80;16M"), "drag motion");
  assert.ok(isMouseShapedSequence("\x1b[<64;40;10M"), "wheel up");
  assert.ok(isMouseShapedSequence("\x1b[<65;40;10M"), "wheel down");
});

test("URXVT 1015 and X10 encodings are caught", () => {
  assert.ok(isMouseShapedSequence("\x1b[35;44;8M"), "1015 motion");
  assert.ok(isMouseShapedSequence("\x1b[0;30;5M"), "1015 press");
  assert.ok(isMouseShapedSequence("\x1b[M" + String.fromCharCode(32, 77, 40)), "X10 6-byte");
});

test("keystrokes, arrow keys, and editing input are NOT mouse-shaped", () => {
  assert.ok(!isMouseShapedSequence("a"), "printable");
  assert.ok(!isMouseShapedSequence("\x1b[A"), "arrow up");
  assert.ok(!isMouseShapedSequence("\x1b[B"), "arrow down");
  assert.ok(!isMouseShapedSequence("\x1b[3~"), "delete");
  assert.ok(!isMouseShapedSequence("\x7f"), "backspace");
  assert.ok(!isMouseShapedSequence("\x1b[2;5M"), "two-param CSI-M (delete-lines shape), not mouse");
  assert.ok(!isMouseShapedSequence("\x1b[200~pasted\x1b[201~"), "bracketed paste");
  assert.ok(!isMouseShapedSequence(""), "empty");
});
