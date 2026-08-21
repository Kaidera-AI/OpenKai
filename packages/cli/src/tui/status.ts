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
 * provider, state. The bash-mode `$`, autonomy `a:`, and routed-tier `t:` chips
 * are contextual and always shown when active (they are not in the
 * configurable set). The tier chip (E017 S1, OK-9.7) shows the shift router's
 * current tier and flashes `eff▸cap` on a transition.
 *
 * Updates arrive via {@link StatusState} mutations driven by the transport
 * event stream (usage at `turn_end`, turn state from deltas/turn_end).
 */

import { Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { highlight, rolePill, surface, text as textToken, toolBorder } from "./theme.js";
import type { UsageSnapshot, Tier } from "@kaidera/openkai-core";
import {
  type StatuslineChip,
  readStatuslineChips,
} from "../config.js";
import { KAIDERA_GLYPH } from "./brand.js";
import { gradientEscape } from "./gradient.js";
import { paintShimmerLabel } from "./magic-keywords.js";
import { capabilities, glyph, renderTerminalText } from "./capabilities.js";
import { LAYOUT_ROWS, resolveLayoutMode } from "./layout.js";

/** The logo at footer scale — the hex glyph in the Kaidera brand mint. */
function brandGlyph(): string {
  const mark = glyph(KAIDERA_GLYPH, "*");
  if (capabilities().colour === "none") return mark;
  return `${gradientEscape(0.55)}${mark}\x1b[0m`;
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
  /** Cline's Plan mode active (read-only). */
  plan?: boolean;
  /**
   * The routed tier for the current stage (E017 S1, OK-9.7 trust surface).
   * Absent until the first tier-aware routing event arrives — the chip is
   * contextual (same grammar as the bash `$` / autonomy chips): no routing,
   * no chip.
   */
  tier?: Tier;
  /**
   * The previous tier while the transition flash is live — the chip renders
   * `t:eff▸cap` (attention accent) until the flash window closes, then
   * settles to the muted `t:cap`.
   */
  tierFrom?: Tier;
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

/** Short tier labels for the chip (fixed width so flips never reflow the chrome). */
const TIER_SHORT: Record<Tier, string> = { efficient: "eff", capable: "cap" };

/**
 * The routed-tier chip (E017 S1, OK-9.7: operators tolerate routing they can
 * see). At rest: muted `t:cap`. During the transition flash after a flip:
 * attention-accented `t:eff▸cap` — the same glanceable transition grammar the
 * E015 review specified (`tier:eff▸cap`).
 */
function tierChip(state: StatusState): string {
  const tier = state.tier;
  if (tier === undefined) return "";
  const from = state.tierFrom;
  if (from !== undefined && from !== tier) {
    return highlight.attention(`t:${TIER_SHORT[from]}${glyph("▸", ">")}${TIER_SHORT[tier]}`);
  }
  return textToken.muted(`t:${TIER_SHORT[tier]}`);
}

const BUSY_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const BUSY_FRAMES_ASCII = ["|", "/", "-", "\\"];

function busyFrame(index: number): string {
  const frames = capabilities().unicode ? BUSY_FRAMES : BUSY_FRAMES_ASCII;
  return capabilities().reducedMotion ? frames[0]! : (frames[index % frames.length] ?? frames[0]!);
}

/**
 * Render the spinner chip — animated while busy, and always telling the truth
 * about WHAT is happening (scope §3.3 "spinner reflects true turn state"):
 * a braille frame + the current activity + elapsed seconds. Priority:
 * awaiting > busy > attention > idle.
 */
function spinnerChip(state: StatusState): string {
  if (state.awaitingApproval) return highlight.danger(`${glyph("◐", "?")} waiting`);
  if (state.busy) {
    const frame = busyFrame(state.busyFrame);
    const elapsed = state.busySince ? Math.max(0, Math.round((Date.now() - state.busySince) / 1000)) : 0;
    const what = state.activity || "working";
    // Magic-keyword turns shimmer their activity label (E017 UK round 4);
    // every other busy state gets the brand sweep (E019 — the working state
    // is always visibly alive).
    if (what === "ultrathinking…") return `${frame} ${paintShimmerLabel(what, "ultrathink")} ${elapsed}s`;
    if (what === "ultrareviewing…") return `${frame} ${paintShimmerLabel(what, "ultrareview")} ${elapsed}s`;
    return `${highlight.base(frame)} ${paintShimmerLabel(what, "brand")} ${elapsed}s`;
  }
  if (state.attention) return highlight.attention(`${glyph("◉", "!")} attention`);
  return textToken.muted(`${glyph("○", "o")} idle`);
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

  constructor(
    state: StatusState,
    private readonly viewportRows: () => number = () => LAYOUT_ROWS.tall,
  ) {
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
    const compact = resolveLayoutMode(width, this.viewportRows()) === "compact";
    const modelCap = compact ? 12 : 24;
    const ellipsis = glyph("…", "~");
    const model = this.state.modelId.length > modelCap ? this.state.modelId.slice(0, modelCap - 1) + ellipsis : this.state.modelId;
    const session = this.state.sessionId.slice(0, 8);
    const tokens = this.state.usage ? `${this.state.usage.totalTokens}t` : glyph("—", "-");
    const sep = textToken.muted(glyph("·", "|"));

    const chipRenderers: Record<StatuslineChip, string> = {
      brand: brandGlyph(),
      agent: rolePill(this.state.agentName),
      model,
      session: textToken.muted(session),
      tokens: textToken.muted(tokens),
      persist: textToken.muted(`p:${this.state.persistMode}`),
      provider: this.state.provider ? highlight.base(this.state.provider) : "",
      state: spinnerChip(this.state),
      ctx: this.state.ctxPercent !== undefined ? textToken.muted(`${this.state.ctxPercent}%`) : "",
      plan: this.state.plan ? highlight.base("plan") : "",
      // Cap the whole git chip at 12 cols: a long branch name
      // (release/0.1.007) otherwise pushes the default chrome past 80 cols
      // and evicts the session/model chips (0.1.7 golden-frame failure).
      git: this.state.gitBranch
        ? textToken.muted(this.state.gitBranch.length > 8 ? `git:${this.state.gitBranch.slice(0, 7)}…` : `git:${this.state.gitBranch}`)
        : "",
    };

    const configured: readonly StatuslineChip[] = compact
      ? (["state", "tokens", "model"] as const)
      : this.chips;
    const active = configured
      .map((chip) => [chip, chipRenderers[chip]] as const)
      .filter(([, s]) => s.length > 0);

    // omp's split: model + tokens right, everything else left.
    const RIGHT_CHIPS: readonly StatuslineChip[] = ["tokens", "model"];
    const left = active.filter(([chip]) => !RIGHT_CHIPS.includes(chip)).map(([, s]) => s);
    const right = active.filter(([chip]) => RIGHT_CHIPS.includes(chip)).map(([, s]) => s);

    // Contextual chips (not configurable): bash mode + autonomy + routed tier.
    if (!compact && this.state.mode === "bash") left.push(highlight.base("$"));
    if (!compact && this.state.autonomy) left.push(textToken.muted(`a:${this.state.autonomy}`));
    if (this.state.tier) left.push(tierChip(this.state));

    const rightText = right.join(` ${sep} `);
    if (rightText.length === 0) return left.join(` ${sep} `);

    // The right side (tokens + model) never loses; contextual chips (tier,
    // bash, autonomy) are the newest information and also stay. When the line
    // is too wide, drop the lowest-value CONFIGURABLE chips first (git, ctx,
    // provider before the identity chips), and only then truncate — a clamp
    // that cuts a chip in half ("t:…") is worse than a dropped chip.
    const DROP_ORDER: readonly StatuslineChip[] = ["git", "ctx", "provider", "session", "persist", "agent"];
    const budget = width - visibleWidth(rightText) - 3;
    const leftParts = [...left];
    let leftText = leftParts.join(` ${sep} `);
    for (const drop of DROP_ORDER) {
      if (visibleWidth(leftText) <= budget) break;
      const index = active.findIndex(([chip]) => chip === drop);
      if (index === -1) continue;
      const rendered = chipRenderers[drop];
      const partIndex = leftParts.indexOf(rendered);
      if (partIndex === -1) continue;
      leftParts.splice(partIndex, 1);
      leftText = leftParts.join(` ${sep} `);
      void index;
    }
    const leftClamped = visibleWidth(leftText) > budget ? truncateToWidth(leftText, Math.max(8, budget)) : leftText;

    // Right-align the right side within the render width.
    const pad = Math.max(1, width - visibleWidth(leftClamped) - visibleWidth(rightText) - 2);
    return `${leftClamped}${" ".repeat(pad)}${rightText}`;
  }

  // ── Component ───────────────────────────────────────────────────────────
  render(width: number): string[] {
    this.lastWidth = width;
    this.text.setText(this.renderLine(width));
    return this.text.render(width).map(renderTerminalText);
  }
  private lastWidth = 80;
  invalidate(): void {
    this.text.invalidate();
  }
}

/** A muted divider line rendered above the chrome (visual separation). */
export function chromeDivider(): string {
  return toolBorder(glyph("─", "-").repeat(8));
}
