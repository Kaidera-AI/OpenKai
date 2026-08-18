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
 * Inc 05: the chip order and visibility are configurable via
 * `~/.openkai/config.json` (key `statusline.chips`). The StatusLine reads the
 * config at construction and on each update so changes take effect on the next
 * render. The configurable chips are: agent, model, session, tokens, persist,
 * provider, state. The bash-mode `$` and autonomy `a:` chips are contextual
 * and always shown when active (they are not in the configurable set).
 *
 * Updates arrive via {@link StatusState} mutations driven by the transport
 * event stream (usage at `turn_end`, turn state from deltas/turn_end).
 */

import { Text, visibleWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { highlight, rolePill, surface, text as textToken, toolBorder } from "./theme.js";
import type { UsageSnapshot } from "@kaidera/openkai-core";
import {
  type StatuslineChip,
  readStatuslineChips,
} from "../config.js";
import { KAIDERA_GLYPH } from "./brand.js";
import { gradientEscape } from "./gradient.js";

/** The logo at footer scale — the hex glyph in the Kaidera brand mint. */
function brandGlyph(): string {
  return `${gradientEscape(0.55)}${KAIDERA_GLYPH}\x1b[0m`;
}

/** The chrome state — mutated by the controller as events arrive. */
export interface StatusState {
  /** Interaction mode (kept in state for `/model`; not rendered — agent pill instead). */
  mode: string;
  /** Agent name for the identity pill + Cortex writes. */
  agentName: string;
  /** Model id (full string, truncated for display). */
  modelId: string;
  /** Active provider id (nvidia, openrouter, …). */
  provider: string;
  /** Session id (short 8-char prefix for display). */
  sessionId: string;
  /** Token usage snapshot (updated at `turn_end`). */
  usage: UsageSnapshot | null;
  /** Persist mode label: `local` or the Cortex project key. */
  persistMode: string;
  /** True while an assistant turn is streaming. */
  busy: boolean;
  /** Current activity label while busy (thinking / writing / tool name). */
  activity: string;
  /** Busy-animation frame index (rotated by the controller's busy tick). */
  busyFrame: number;
  /** Epoch ms when the current busy stretch started (for elapsed seconds). */
  busySince: number | null;
  /** True while a gated tool is awaiting operator approval (P4b). */
  awaitingApproval: boolean;
  /** True when an unfocused turn settled / permission arrived (P4b, scope §1.1). */
  attention: boolean;
  /** The autonomy axis (off/low/med/high); rendered as a fixed-width chip. */
  autonomy?: string;
  /** Current git branch (empty when not a repo) — omp's footer segment. */
  gitBranch?: string;
  /** Context window usage percent (0-100), when known. */
  ctxPercent?: number;
}

/** Default chrome state for a fresh session. */
export function defaultStatusState(modelId: string, sessionId: string, persistMode: string): StatusState {
  return {
    mode: "chat",
    agentName: "openkai",
    modelId,
    provider: "",
    sessionId,
    usage: null,
    persistMode,
    busy: false,
    activity: "",
    busyFrame: 0,
    busySince: null,
    awaitingApproval: false,
    attention: false,
  };
}

const BUSY_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Render the spinner chip — animated while busy, and always telling the truth
 * about WHAT is happening (scope §3.3 "spinner reflects true turn state"):
 * a braille frame + the current activity + elapsed seconds. Priority:
 * awaiting > busy > attention > idle.
 */
function spinnerChip(state: StatusState): string {
  if (state.awaitingApproval) return highlight.danger("◐ waiting");
  if (state.busy) {
    const frame = BUSY_FRAMES[state.busyFrame % BUSY_FRAMES.length];
    const elapsed = state.busySince ? Math.max(0, Math.round((Date.now() - state.busySince) / 1000)) : 0;
    const what = state.activity || "working";
    return highlight.base(`${frame} ${what} ${elapsed}s`);
  }
  if (state.attention) return highlight.attention("◉ attention");
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
  private chips: StatuslineChip[];

  constructor(state: StatusState) {
    this.state = state;
    this.chips = readStatuslineChips();
    this.text = new Text("", 1, 0, (line) => surface["3"](line));
  }

  /** Update state and re-render the line. */
  update(state: StatusState): void {
    this.state = state;
    this.chips = readStatuslineChips();
    this.text.setText(this.renderLine(this.lastWidth));
  }

  /** Current state (read for tests / controller bookkeeping). */
  get currentState(): StatusState {
    return this.state;
  }

  /** Compose the chrome line (omp's two-sided footer layout, droid colours):
   * LEFT: brand glyph + agent + provider + persist + session + state;
   * RIGHT: tokens + model. Chips listed in config decide what renders; model
   * and tokens always sit on the right when present. */
  private renderLine(width: number): string {
    const model = this.state.modelId.length > 24 ? this.state.modelId.slice(0, 23) + "…" : this.state.modelId;
    const session = this.state.sessionId.slice(0, 8);
    const tokens = this.state.usage ? `${this.state.usage.totalTokens}t` : "—";
    const sep = textToken.muted("·");

    const chipRenderers: Record<StatuslineChip, string> = {
      brand: brandGlyph(),
      agent: rolePill(this.state.agentName),
      model,
      session: textToken.muted(session),
      tokens: textToken.muted(tokens),
      persist: textToken.muted(`p:${this.state.persistMode}`),
      provider: this.state.provider ? highlight.base(this.state.provider) : "",
      state: spinnerChip(this.state),
      git: this.state.gitBranch ? textToken.muted(`git:${this.state.gitBranch}`) : "",
      ctx: this.state.ctxPercent !== undefined ? textToken.muted(`${this.state.ctxPercent}%`) : "",
    };

    const active = this.chips
      .map((chip) => [chip, chipRenderers[chip]] as const)
      .filter(([, s]) => s.length > 0);

    // omp's split: model + tokens right, everything else left.
    const RIGHT_CHIPS: readonly StatuslineChip[] = ["tokens", "model"];
    const left = active.filter(([chip]) => !RIGHT_CHIPS.includes(chip)).map(([, s]) => s);
    const right = active.filter(([chip]) => RIGHT_CHIPS.includes(chip)).map(([, s]) => s);

    // Contextual chips (not configurable): bash mode + autonomy.
    if (this.state.mode === "bash") left.push(highlight.base("$"));
    if (this.state.autonomy) left.push(textToken.muted(`a:${this.state.autonomy}`));

    const leftText = left.join(` ${sep} `);
    const rightText = right.join(` ${sep} `);
    if (rightText.length === 0) return leftText;

    // Right-align the right side within the render width.
    const pad = Math.max(1, width - visibleWidth(leftText) - visibleWidth(rightText) - 2);
    return `${leftText}${" ".repeat(pad)}${rightText}`;
  }

  // ── Component ───────────────────────────────────────────────────────────
  render(width: number): string[] {
    this.lastWidth = width;
    this.text.setText(this.renderLine(width));
    return this.text.render(width);
  }
  private lastWidth = 80;
  invalidate(): void {
    this.text.invalidate();
  }
}

/** A muted divider line rendered above the chrome (visual separation). */
export function chromeDivider(): string {
  return toolBorder("─".repeat(8));
}