/**
 * Status chrome line (scope §3.4) — one line, always present.
 *
 * Renders: `agent-pill · model · session(short) · tokens · persist-mode · spinner`.
 * The agent pill (scope §1.2) replaces the static `m:chat` mode chip — the agent
 * identity is the live surface; mode is `chat` for now and stays in state for
 * the `/model` command. Fixed-width chips so state cycles never reflow the
 * composer. `persist-mode` shows `local` (standalone-local, A1) or the Cortex
 * project key (KOS-managed).
 *
 * P4b adds an `attention` state (scope §1.1): when a turn settled while the
 * terminal was unfocused, the spinner chip shows an amber `◉ attention` glyph —
 * clean-by-default, the attention state lives in the status line, not a banner.
 *
 * Updates arrive via {@link StatusState} mutations driven by the transport
 * event stream (usage at `turn_end`, turn state from deltas/turn_end).
 */

import { Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { highlight, rolePill, surface, text as textToken, toolBorder } from "./theme.js";
import type { UsageSnapshot } from "openkai-core";

/** The chrome state — mutated by the controller as events arrive. */
export interface StatusState {
  /** Interaction mode (kept in state for `/model`; not rendered — agent pill instead). */
  mode: string;
  /** Agent name for the identity pill + Cortex writes. */
  agentName: string;
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
  /** True when an unfocused turn settled / permission arrived (P4b, scope §1.1). */
  attention: boolean;
}

/** Default chrome state for a fresh session. */
export function defaultStatusState(modelId: string, sessionId: string, persistMode: string): StatusState {
  return {
    mode: "chat",
    agentName: "openkai",
    modelId,
    sessionId,
    usage: null,
    persistMode,
    busy: false,
    awaitingApproval: false,
    attention: false,
  };
}

/**
 * Render the spinner chip — reflects true turn state (scope §3.3 + §1.1).
 * Priority: awaiting > busy > attention > idle. The amber `◉ attention` glyph
 * only shows when not busy/awaiting, so a settled-but-unnoticed turn is the
 * only attention signal (clean-by-default, scope §2).
 */
function spinnerChip(busy: boolean, awaiting: boolean, attention: boolean): string {
  if (awaiting) return highlight.danger("◐ waiting");
  if (busy) return highlight.base("◌ busy");
  if (attention) return highlight.attention("◉ attention");
  return textToken.muted("○ idle");
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
   * chips (agent/model/session/tokens/persist) fit an 80-col line (scope §3.4). */
  private renderLine(): string {
    const model = this.state.modelId.length > 18 ? this.state.modelId.slice(0, 17) + "…" : this.state.modelId;
    const session = this.state.sessionId.slice(0, 8);
    const tokens = this.state.usage ? `${this.state.usage.totalTokens}t` : "—";
    const sep = textToken.muted("·");
    return [
      rolePill(this.state.agentName),
      model,
      session,
      tokens,
      `p:${this.state.persistMode}`,
      spinnerChip(this.state.busy, this.state.awaitingApproval, this.state.attention),
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
