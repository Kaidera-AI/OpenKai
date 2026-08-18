/**
 * Focus-aware attention notifications (scope §1.1).
 *
 * When the terminal is **not focused** and a turn ends (or a permission
 * request lands), emit a terminal bell + OSC 9 / OSC 777 notification where the
 * terminal supports it. **Quiet when focused** — the operator is already
 * watching, so a bell is noise. The notification surface is I/O only; the
 * chrome attention *state* is owned by the status line (scope §2:
 * clean-by-default — attention lives in the status line, not a banner).
 *
 * All colour decisions are in {@link theme.ts}; this module only emits
 * non-colour control sequences (bell + OSC) and tracks a boolean focus flag.
 * No new runtime deps; the writer is whatever the runtime passes (the real
 * terminal's `write`, or a capturing writer in tests).
 */

import { sanitizeTerminalText } from "./sanitize.js";

/** A minimal write sink (the terminal's `write`, or a test capturer). */
export interface AttentionWriter {
  write(data: string): void;
}

/**
 * Focus-aware notifier. Default state is **focused** (scope §1.1: "quiet when
 * focused"). DEC 1004 reports focus only on *change*, so a terminal focused at
 * launch never emits a focus-in — defaulting to focused=true means the first
 * turn_end does NOT ring the bell while the operator is watching (the exact
 * noise scope §1.1 forbids). A terminal without focus reporting stays quiet
 * forever (the safe degradation); a real focus-out event flips this to false
 * and enables notifications.
 */
export class AttentionNotifier {
  private focused = true;
  private readonly writer: AttentionWriter;

  constructor(writer: AttentionWriter) {
    this.writer = writer;
  }

  /** Mark the terminal focused/unfocused (from DEC 1004 focus-in/out). */
  setFocused(focused: boolean): void {
    this.focused = focused;
  }

  /** Current focus state. */
  get isFocused(): boolean {
    return this.focused;
  }

  /**
   * Emit a notification when unfocused (scope §1.1): a bell, an OSC 9 growl
   * (iTerm-style), and an OSC 777 notify (urxvt-style). Terminals that don't
   * understand the OSC sequences ignore them; the bell still fires. When
   * focused, this is a no-op (quiet).
   */
  notify(title: string, body?: string): void {
    if (this.focused) return;
    const message = body ? `${title}: ${body}` : title;
    this.writer.write("\x07"); // BEL
    this.writer.write(`\x1b]9;${escapeOsc(message)}\x07`); // OSC 9 (iTerm growl)
    this.writer.write(`\x1b]777;notify;${escapeOsc(title)};${escapeOsc(body ?? "")}\x07`); // OSC 777
  }
}

/**
 * Escape an OSC string payload. The full C0/C1 range must not survive — BEL/ST
 * terminate the sequence early, and other controls (or a smuggled ESC) let
 * notification text forge terminal state (E001 §2). Reuses the terminal
 * sanitiser; newlines flattened since an OSC payload is single-line.
 */
function escapeOsc(s: string): string {
  return sanitizeTerminalText(s).replace(/\n/g, " ");
}

/** DEC 1004 focus-report sequences the runtime writes to enable/disable them. */
export const FOCUS_REPORT_ENABLE = "\x1b[?1004h";
export const FOCUS_REPORT_DISABLE = "\x1b[?1004l";

/** Raw focus-event payloads emitted by a DEC 1004 terminal. */
export const FOCUS_IN = "\x1b[I";
export const FOCUS_OUT = "\x1b[O";

/** True if `data` is a focus-in report. */
export function isFocusIn(data: string): boolean {
  return data === FOCUS_IN;
}

/** True if `data` is a focus-out report. */
export function isFocusOut(data: string): boolean {
  return data === FOCUS_OUT;
}
