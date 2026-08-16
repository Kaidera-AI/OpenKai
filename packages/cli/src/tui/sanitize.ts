/**
 * Terminal-output sanitiser (E001 security §2, cole's re-review finding).
 *
 * Model- and tool-sourced text is hostile input to a terminal: raw escape
 * sequences survive pi-tui's Markdown/Text render — OSC 52 clipboard writes,
 * OSC 0 title spoofs, CSI screen clears. Any string crossing from the model
 * or a tool into a rendered component passes through here first.
 *
 * Policy: strip C0/C1 controls EXCEPT \n \t (layout); ESC sequences and BEL
 * are removed whole. Printable content is never altered — this is lossy only
 * for terminal control, which model output has no legitimate need for.
 */

// eslint-disable-next-line no-control-regex
const CONTROL_PATTERN = /[\x00-\x08\x0b-\x1f\x7f-\x9f]/g;
// eslint-disable-next-line no-control-regex
const ESC_SEQUENCE = /\x1b(?:\[[0-9;?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[()][0-9A-B]|[=>@-~])/g;
// eslint-disable-next-line no-control-regex
const BEL = /\x07/g;

export function sanitizeTerminalText(input: string): string {
  return input.replace(ESC_SEQUENCE, "").replace(BEL, "").replace(CONTROL_PATTERN, "");
}
