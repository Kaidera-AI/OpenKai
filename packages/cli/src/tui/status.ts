/**
 * Status chrome line (scope §3.4) — one line, always present.
 *
 * Renders: `mode · model · session(short) · tokens · persist-mode`. Fixed-width
 * chips so state cycles never reflow the composer. `persist-mode` shows
 * `local` (standalone-local, A1) or the Cortex project key (KOS-managed).
 * Updates arrive via {@link StatusState} mutations driven by the transport
 * event stream (usage at `turn_end`, turn state from deltas/turn_end).
 */

import { Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { highlight, surface, text as textToken, toolBorder } from "./theme.js";
import type { UsageSnapshot } from "@openkai/core";

/** The chrome state — mutated by the controller as events arrive. */
export interface StatusState {
  /** Interaction mode (P4a shows `chat`; cycling is P4b). */
  mode: string;
  /** Model id (full string, truncated for display). */
  modelId: string;
  /** Session id (short 8-char prefix for display). */
  sessionId: string;
  /** Token usage snapshot (updated at `turn_end`). */
  usage: UsageSnapshot | null;
  /** Persist mode label: `local` or the Cortex project key. */
  persistMode: string;
  /** True while an assistant turn is streaming. */
  busy: boolean;
  /** True while a gated tool is awaiting operator approval (P4b). */
  awaitingApproval: boolean;
}

/** Default chrome state for a fresh session. */
export function defaultStatusState(modelId: string, sessionId: string, persistMode: string): StatusState {
  return {
    mode: "chat",
    modelId,
    sessionId,
    usage: null,
    persistMode,
    busy: false,
    awaitingApproval: false,
  };
}

/** Pad/ truncate a value to a fixed visible width so chips never reflow. */
function chip(label: string, value: string, width: number): string {
  const slot = value.length > width ? value.slice(0, width - 1) + "…" : value.padEnd(width);
  return `${textToken.muted(label)} ${textToken.base(slot)}`;
}

/**
 * Render the spinner chip — reflects true turn state (scope §3.3). P4b adds an
 * `awaiting` state: a gated tool is paused for approval, so the chip shows
 * "waiting on you", not "model thinking" (scope §5).
 */
function spinnerChip(busy: boolean, awaiting: boolean): string {
  if (awaiting) return highlight.danger("◐ waiting");
  return busy ? highlight.base("◌ busy") : textToken.muted("○ idle");
}

/**
 * Status chrome component. A thin {@link Text} wrapper whose `setText` is
 * called by the controller on every state change. Always rendered as the
 * bottom line of the layout root.
 */
export class StatusLine implements Component {
  private readonly text: Text;
  private state: StatusState;

  constructor(state: StatusState) {
    this.state = state;
    this.text = new Text(this.renderLine(), 1, 0, (line) => surface["3"](line));
  }

  /** Update state and re-render the line. */
  update(state: StatusState): void {
    this.state = state;
    this.text.setText(this.renderLine());
  }

  /** Current state (read for tests / controller bookkeeping). */
  get currentState(): StatusState {
    return this.state;
  }

  /** Compose the chrome line from tokens (the only colour source). Compact so all
   * five chips (mode/model/session/tokens/persist) fit an 80-col line (scope §3.4). */
  private renderLine(): string {
    const model = this.state.modelId.length > 18
      ? this.state.modelId.slice(0, 17) + "…"
      : this.state.modelId;
    const session = this.state.sessionId.slice(0, 8);
    const tokens = this.state.usage ? `${this.state.usage.totalTokens}t` : "—";
    const sep = textToken.muted("·");
    // Compact chips: tiny labels so all five fit within 80 columns.
    return [
      `m:${this.state.mode}`,
      model,
      session,
      tokens,
      `p:${this.state.persistMode}`,
      spinnerChip(this.state.busy, this.state.awaitingApproval),
    ].join(` ${sep} `);
  }

  // ── Component ───────────────────────────────────────────────────────────
  render(width: number): string[] {
    return this.text.render(width);
  }
  invalidate(): void {
    this.text.invalidate();
  }
}

/** A muted divider line rendered above the chrome (visual separation). */
export function chromeDivider(): string {
  return toolBorder("─".repeat(8));
}