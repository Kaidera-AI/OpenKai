/**
 * Mouse-sequence guard (E019 inc 02): the last line of defence against
 * mouse-shaped input reaching a component. pi-tui's viewport listener
 * consumes SGR (1006) traffic it recognises; anything it misses — URXVT
 * 1015 (`\x1b[b;x;yM`), X10 (`\x1b[M` + 3 bytes), or a malformed SGR burst —
 * would otherwise land in the focused editor as literal digits (the CTO's
 * "numbers change with moving mouse" report). OpenKai's input listener is
 * registered after pi-tui's, so consuming here can never shadow the
 * viewport's own scrollbar/selection/wheel handling.
 */

/** SGR mouse (1006): ESC [ < button ; x ; y (M press | m release). */
const SGR_MOUSE = /^\x1b\[<\d+;\d+;\d+[Mm]$/;
/** URXVT mouse (1015): same shape without the `<`. */
const URXVT_MOUSE = /^\x1b\[\d+;\d+;\d+M$/;
/** X10 mouse: ESC [ M + exactly 3 bytes. */
const X10_MOUSE = /^\x1b\[M...$/s;

/**
 * Whether `data` is a mouse report in ANY encoding a terminal might send.
 * Shape-only — never inspects button semantics, so partial/unknown button
 * codes are still swallowed.
 */
export function isMouseShapedSequence(data: string): boolean {
  return SGR_MOUSE.test(data) || URXVT_MOUSE.test(data) || X10_MOUSE.test(data);
}
