/**
 * Transcript renderer (scope §4 `transcript.ts`).
 *
 * Holds an ordered list of blocks — user messages, assistant messages,
 * thinking sections, tool cards, btw side-channel blocks, and notices — and
 * renders them to lines. Text deltas append to the current assistant message's
 * Markdown block (re-render block, not screen); thinking deltas buffer into a
 * collapsed-by-default section revealed by the density toggle (Ctrl+O);
 * `tool_call` opens a card, `tool_result` settles it (args summary + result
 * preview, truncated).
 *
 * P4b (scope §1.2 + §1.5) adds:
 *  - **per-agent identity**: the assistant header is a coloured `[AGENT]` pill
 *    ({@link rolePill}) instead of `**Assistant**`, so each persona reads as a
 *    distinct block. The operator stays `**You**`.
 *  - **`/btw` side channel**: a `btw` block renders the side question header +
 *    streams the answer as a **system-marked block** (not a user turn, scope
 *    §1.5). The block kind is `btw`, never `assistant`/`user`.
 *
 * Block model is addressed by {@link SessionEvent} fields: a `delta` carries
 * `field` (`text`|`thinking`) + `partId`; the renderer routes it to the
 * matching part of the live assistant turn. `turn_end` settles the message
 * block; `usage` is handled by the status line, not here.
 */

import { Markdown, Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { TaskProgress } from "@kaidera/openkai-core";
import { highlight, markdownTheme, rolePill, text as textToken, toolBorder } from "./theme.js";
import { sanitizeTerminalText } from "./sanitize.js";
import { paintMagicKeywords } from "./magic-keywords.js";
import { renderMermaidBlocks, type MermaidTheme } from "./mermaid.js";
import { capabilities, renderTerminalText } from "./capabilities.js";
import { LAYOUT_ROWS, resolveLayout } from "./layout.js";

/**
 * Narrow a `tool_update` partial to the task tool's progress payload
 * (E017 contract #3): `partial.details` carries the {@link TaskProgress}.
 * Returns undefined for any other shape — other tools' partials are ignored.
 */
export function extractTaskProgress(partial: unknown): TaskProgress | undefined {
  if (typeof partial !== "object" || partial === null || !("details" in partial)) return undefined;
  const details = partial.details;
  if (typeof details !== "object" || details === null) return undefined;
  if (!("status" in details) || typeof details.status !== "string") return undefined;
  if (!("toolCount" in details) || typeof details.toolCount !== "number") return undefined;
  if (!("turnDepth" in details) || typeof details.turnDepth !== "number") return undefined;
  if (!("elapsedMs" in details) || typeof details.elapsedMs !== "number") return undefined;
  // All discriminating fields validated above; the rest are optional strings.
  const progress: TaskProgress = details as TaskProgress;
  return progress;
}

const mermaidTheme: MermaidTheme = {
  borderMuted: (t) => textToken.muted(t),
  text: (t) => t,
  accent: (t) => highlight.base(t),
  muted: (t) => textToken.muted(t),
  bold: (t) => textToken.strong(t),
  warning: (t) => highlight.attention(t),
};

/** One rendered line's max length for previews (kept short for cards). */
const PREVIEW_LEN = 120;

/** Truncate a value to a single-line preview. */
function preview(value: unknown): string {
  const str = typeof value === "string" ? value : safeStringify(value);
  // Tool args/results are model-chosen — sanitise before the card (E001 §2).
  const oneLine = sanitizeTerminalText(str).replace(/\n/g, " ");
  return oneLine.length > PREVIEW_LEN ? oneLine.slice(0, PREVIEW_LEN - 1) + "…" : oneLine;
}

/** Safe JSON stringify with a cap. */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Render tool args as short `key: value` lines (max 4 keys; long values
 * truncated at PREVIEW_LEN). Objects/arrays show as compact JSON; scalars
 * bare. Empty args render as nothing.
 */
function formatArgs(args: unknown): string[] {
  if (args === null || args === undefined) return [];
  if (typeof args !== "object") return [preview(args)];
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return [];
  return entries.slice(0, 4).map(([key, value]) => {
    const rendered = typeof value === "string" ? value : safeStringify(value);
    // Both the key and the value are model-chosen, so both are hostile input
    // to the terminal — the F6 channel reopens on every tool call otherwise
    // (E001 finding F6c).
    const oneLine = sanitizeTerminalText(rendered).replace(/\n/g, " ");
    const text = oneLine.length > PREVIEW_LEN ? oneLine.slice(0, PREVIEW_LEN - 1) + "…" : oneLine;
    return `${sanitizeTerminalText(key).replace(/\n/g, " ")}: ${text}`;
  });
}

const MAX_RESULT_LINES = 5;

/**
 * Unwrap a tool result to its human content: pi tool results carry
 * `{content: [{type:"text", text}]}`; show THAT text (first lines), never
 * the envelope. Falls back to compact JSON for non-standard shapes.
 */
function extractResultText(result: unknown, isError: boolean): string[] {
  let text: string | undefined;
  if (typeof result === "string") {
    text = result;
  } else if (result && typeof result === "object" && "content" in result) {
    const content = (result as { content: unknown }).content;
    if (Array.isArray(content)) {
      text = content
        .filter((p): p is { type: string; text: string } =>
          typeof p === "object" && p !== null && "type" in p && (p as { type: string }).type === "text",
        )
        .map((p) => p.text)
        .join("\n");
    }
  }
  text ??= safeStringify(result);

  const lines = sanitizeTerminalText(text)
    .split("\n")
    .filter((l) => l.trim().length > 0 || !isError);
  const head = lines.slice(0, MAX_RESULT_LINES);
  const more = lines.length - head.length;
  const out = head.map((l) => (l.length > PREVIEW_LEN ? l.slice(0, PREVIEW_LEN - 1) + "…" : l));
  if (more > 0) out.push(`… ${more} more line${more === 1 ? "" : "s"}`);
  return out.length > 0 ? out : ["(no output)"];
}

/** Block kinds the transcript renders. */
type Block =
  | { kind: "user"; text: string; comp: Markdown | Text }
  | { kind: "assistant"; text: string; comp: Markdown }
  | { kind: "thinking"; text: string; revealed: boolean; comp: Text }
  | { kind: "notice"; text: string; boot?: boolean; compactComp?: Text; comp: Text }
  | { kind: "btw"; question: string; text: string; comp: Markdown }
  | { kind: "tool"; toolCallId: string; toolName: string; args: unknown; result: unknown | null; isError: boolean; settled: boolean; progress?: TaskProgress; comp: Text };

/** A muted left-border prefix for tool cards (scope §3.1). */
function toolPrefix(): string {
  return toolBorder("▎ ");
}

/**
 * The transcript. A stateful {@link Component} whose block list is driven by
 * the controller calling {@link Transcript.applyEvent} /
 * {@link Transcript.addUserMessage} / {@link Transcript.replayAssistant}.
 * Wrapped in a ScrollView by the layout root.
 */
export class Transcript implements Component {
  private blocks: Block[] = [];
  private liveAssistant: number | null = null;
  private liveThinking: number | null = null;
  /** Index of the live btw block (the `/btw` side channel, scope §1.5). */
  private liveBtw: number | null = null;
  private openTools = new Map<string, number>();

  /** Rebuild every block index after a mid-list splice (lazy thinking insert). */
  private reindexOpenTools(): void {
    this.openTools.clear();
    for (let i = 0; i < this.blocks.length; i += 1) {
      const block = this.blocks[i]!;
      if (block.kind === "tool" && !block.settled) this.openTools.set(block.toolCallId, i);
    }
  }
  private thinkingRevealed = false;
  /** Agent name for the assistant identity pill (scope §1.2). */
  private readonly agentName: string;

  constructor(
    agentName = "openkai",
    private readonly viewportRows: () => number = () => LAYOUT_ROWS.tall,
  ) {
    this.agentName = agentName;
  }

  /** Render width hint for mermaid fitting (updated on render). */
  private width = 80;

  /** Add a user message block at the top of a turn. */
  addUserMessage(text: string, suffix?: string): void {
    // Dim marker, not a shouty bold label — the operator's own text needs no
    // emphasis, the model's output does. Sanitised: pastes can carry escapes.
    // Magic keywords paint with the static gradient (phase 0 — the composer
    // has the live shimmer; the transcript keeps the sent palette, OMP-style).
    const clean = paintMagicKeywords(sanitizeTerminalText(text), 0);
    // Steer-while-busy (E017 pick 2): a mid-turn message carries a dim
    // `→ steering` suffix so the operator sees it landed on the running turn.
    const tag = suffix !== undefined ? `  ${textToken.dim(suffix)}` : "";
    const comp = new Text(`${textToken.dim("You")}${tag}\n\n${clean}`, 1, 0);
    this.blocks.push({ kind: "user", text: clean, comp });
  }

  /**
   * Add a local notice block — slash-command output (`/help`, `/sessions`, …).
   * Never sent to the model and never persisted; it is operator-local chrome.
   * Sanitised here (single choke point): notice bodies routinely embed
   * model/tool text — error messages, paths, session ids (E001 §2).
   */
  addNotice(lines: string | string[], options?: { boot?: boolean; compact?: string }): void {
    const body = Array.isArray(lines) ? lines.join("\n") : lines;
    const clean = sanitizeTerminalText(body);
    const noticeComponent = (text: string): Text =>
      new Text(
        text.split("\n").map((line) => `${toolBorder("▎ ")}${textToken.muted(line)}`).join("\n"),
        1,
        0,
      );
    const compact = options?.compact !== undefined ? sanitizeTerminalText(options.compact) : undefined;
    this.blocks.push({
      kind: "notice",
      text: clean,
      ...(options?.boot === true ? { boot: true } : {}),
      ...(compact !== undefined ? { compactComp: noticeComponent(compact) } : {}),
      comp: noticeComponent(clean),
    });
  }

  /**
   * Collapse the boot chrome (brand card + capability row + tips) into one
   * compact line once the operator starts working (E019 inc 04): the card's
   * moment is the boot animation; during the session it was spending ~13
   * rows of the viewport forever. Called on the first prompt submit.
   */
  collapseBoot(compactLine: string): void {
    const bootCount = this.blocks.filter((b) => b.kind === "notice" && b.boot === true).length;
    if (bootCount === 0) return;
    this.blocks = this.blocks.filter((b) => !(b.kind === "notice" && b.boot === true));
    this.addNotice(compactLine);
  }

  /**
   * Add a failure notice — danger-tinted so a failed turn / persist error
   * reads differently from routine chrome. Same choke point as
   * {@link addNotice}: the message can carry model-sourced text.
   */
  addError(lines: string | string[]): void {
    const body = Array.isArray(lines) ? lines.join("\n") : lines;
    const clean = sanitizeTerminalText(body);
    const comp = new Text(
      clean.split("\n").map((line) => `${toolBorder("▎ ")}${highlight.danger(line)}`).join("\n"),
      1,
      0,
    );
    this.blocks.push({ kind: "notice", text: clean, comp });
  }

  /**
   * Open a `/btw` side-channel block (scope §1.5): the question header
   * (amber `⤷ btw:` + muted question) + a streaming answer region. The answer
   * streams here — no `user`/`assistant` block is created, so it never reads
   * as a user turn. Returns immediately; the controller then prompts the model.
   */
  beginBtwTurn(question: string): void {
    const comp = new Markdown(this.btwBody(question, ""), 1, 0, markdownTheme);
    this.blocks.push({ kind: "btw", question, text: "", comp });
    this.liveBtw = this.blocks.length - 1;
  }

  /** Render a btw block's markdown (header + streaming answer). */
  private btwBody(question: string, text: string): string {
    // Operator-supplied, but a paste carries escapes just like model text —
    // parity with addUserMessage (E001 finding F6c).
    const header = `${highlight.attention("⤷ btw:")} ${textToken.muted(sanitizeTerminalText(question))}`;
    return text.length > 0 ? `${header}\n\n${text}` : header;
  }

  /** Replay a settled assistant message (session resume — no live streaming). */
  replayAssistant(text: string): void {
    const clean = sanitizeTerminalText(text);
    const comp = new Markdown(`${rolePill(this.agentName)}\n\n${clean}`, 1, 0, markdownTheme);
    this.blocks.push({ kind: "assistant", text: clean, comp });
  }

  /**
   * Render a fusion result (OK-7: fusion stops being invisible). Each role
   * output gets its identity pill; the synthesis renders as an attributed
   * merge block — consensus, kept divergences, discards, blind spots.
   * A failed role (panel.ts allSettled) keeps its pill and shows the
   * attributed error instead of an empty block (E017 S1: a broken panel must
   * be SEEABLE, not silently absent).
   */
  addFusionResult(
    outputs: { role: string; modelId: string; text: string; latencyMs: number; error?: string }[],
    synthesis: {
      consensus: string[];
      divergences: { topic: string; architect: string; builder: string; kept: string }[];
      discarded: { item: string; reason: string; by: string }[];
      blindSpots: string[];
      /** Set when the merge could not be parsed (OK-9 W4) — both role outputs stand verbatim. */
      synthesisError?: string;
    },
  ): void {
    for (const output of outputs) {
      const header = `${rolePill(output.role)} ${textToken.dim(`· ${output.modelId} · ${output.latencyMs}ms`)}`;
      const clean = sanitizeTerminalText(output.text);
      const body =
        output.error !== undefined
          ? `${header}\n\n${highlight.danger(`✗ role failed: ${sanitizeTerminalText(output.error)}`)}`
          : `${header}\n\n${clean}`;
      const comp = new Markdown(body, 1, 0, markdownTheme);
      this.blocks.push({ kind: "assistant", text: clean, comp });
    }

    const clean = (s: string): string => sanitizeTerminalText(s);
    // Parse failure (OK-9 W4): both role outputs already rendered above with
    // their pills — flag the broken merge, never silently degrade.
    if (synthesis.synthesisError !== undefined) {
      const plain = `synthesis failed to parse — both role outputs stand verbatim (${clean(synthesis.synthesisError).slice(0, 80)})`;
      const flagged = `${highlight.attention("synthesis failed to parse")} ${textToken.muted(`— both role outputs stand verbatim (${clean(synthesis.synthesisError).slice(0, 80)})`)}`;
      const comp = new Text(`${toolBorder("▎ ")}${flagged}`, 1, 0);
      this.blocks.push({ kind: "notice", text: plain, comp });
      return;
    }
    // A run that never reached synthesis (refused gate, broken panel) carries
    // an empty artifact — rendering an empty "synthesis" block is noise.
    const hasSynthesis =
      synthesis.consensus.length > 0 ||
      synthesis.divergences.length > 0 ||
      synthesis.discarded.length > 0 ||
      synthesis.blindSpots.length > 0;
    if (!hasSynthesis) return;
    const lines: string[] = [highlight.base("synthesis")];
    if (synthesis.consensus.length > 0) {
      lines.push(textToken.strong("consensus"));
      for (const item of synthesis.consensus) lines.push(`  • ${clean(item)}`);
    }
    for (const d of synthesis.divergences) {
      lines.push(`${textToken.strong("divergence")} ${clean(d.topic)} ${textToken.dim(`(kept: ${d.kept})`)}`);
      lines.push(`  ${rolePill("architect")} ${clean(d.architect)}`);
      lines.push(`  ${rolePill("builder")} ${clean(d.builder)}`);
    }
    for (const d of synthesis.discarded) {
      lines.push(`${textToken.dim("discarded")} ${clean(d.item)} ${textToken.dim(`— ${clean(d.reason)} [${d.by}]`)}`);
    }
    if (synthesis.blindSpots.length > 0) {
      lines.push(textToken.strong("blind spots"));
      for (const b of synthesis.blindSpots) lines.push(`  • ${clean(b)}`);
    }
    const comp = new Text(
      lines.map((line) => `${toolBorder("▎ ")}${line}`).join("\n"),
      1,
      0,
    );
    this.blocks.push({ kind: "notice", text: lines.join("\n"), comp });
  }

  /** The last assistant block's accumulated text (for persistence at turn_end). */
  lastAssistantText(): string {
    for (let i = this.blocks.length - 1; i >= 0; i -= 1) {
      const block = this.blocks[i]!;
      if (block.kind === "assistant") return block.text;
    }
    return "";
  }

  /** Toggle thinking density (Ctrl+O). Returns the new revealed state. */
  toggleThinking(): boolean {
    this.thinkingRevealed = !this.thinkingRevealed;
    for (let i = 0; i < this.blocks.length; i += 1) {
      const block = this.blocks[i]!;
      if (block.kind === "thinking") {
        block.revealed = this.thinkingRevealed;
        this.renderThinking(block);
      }
    }
    return this.thinkingRevealed;
  }

  /** Apply one {@link SessionEvent} to the block list. */
  applyEvent(event: {
    kind: string;
    field?: string;
    partId?: number;
    delta?: string;
    toolCallId?: string;
    toolName?: string;
    args?: unknown;
    result?: unknown;
    isError?: boolean;
    message?: string;
    partial?: unknown;
  }): void {
    switch (event.kind) {
      case "connected":
        // A new turn is starting — but in btw mode the btw block already
        // exists and is the streaming target, so do not open an assistant turn.
        if (this.liveBtw === null) this.beginAssistantTurn();
        break;
      case "delta": {
        if (event.field === "text") this.appendText(event.delta ?? "");
        else if (event.field === "thinking") this.appendThinking(event.delta ?? "");
        break;
      }
      case "tool_call":
        this.openTool(event.toolCallId ?? "?", event.toolName ?? "?", event.args);
        break;
      case "tool_update":
        this.updateTool(event.toolCallId ?? "?", event.partial);
        break;
      case "tool_result":
        this.settleTool(event.toolCallId ?? "?", event.result, event.isError ?? false);
        break;
      case "turn_end":
        // Settle the thinking row to its static summary — the live pulse
        // stops here (E019 inc 04: the operator can tell finished from
        // in-flight at a glance).
        if (this.liveThinking !== null) {
          const settled = this.blocks[this.liveThinking]!;
          if (settled.kind === "thinking" && !settled.revealed) settled.comp.setText(this.thinkingLine(settled.text));
        }
        this.liveAssistant = null;
        this.liveThinking = null;
        this.liveBtw = null;
        break;
      case "error":
        // Core emits this at turn settlement when the assistant message has
        // stopReason "error" — render danger-tinted, settle the live turn.
        this.addError(event.message ?? "turn failed");
        this.liveAssistant = null;
        this.liveThinking = null;
        this.liveBtw = null;
        break;
      case "session_end":
        this.liveAssistant = null;
        this.liveThinking = null;
        this.liveBtw = null;
        break;
      default:
        break;
    }
  }

  /** Begin a new assistant turn block (called on `connected`, unless btw). */
  private beginAssistantTurn(): void {
    // The thinking block is LAZY (E019 inc 04): created by the first thinking
    // delta, never on turn begin — a model that emits no thinking leaves no
    // dead "⤷ thinking…" row in the transcript.
    const comp = new Markdown("", 1, 0, markdownTheme);
    const block: Block = { kind: "assistant", text: "", comp };
    this.blocks.push(block);
    this.liveAssistant = this.blocks.length - 1;
  }

  /** Append a text delta to the live block (btw side channel or assistant). */
  private appendText(delta: string): void {
    // Model output is hostile to the terminal: strip control sequences at the
    // boundary (E001 §2 — cole's OSC/CSI finding). Safe across split deltas:
    // a lone ESC is a stripped control char.
    const clean = sanitizeTerminalText(delta);
    if (this.liveBtw !== null) {
      const block = this.blocks[this.liveBtw]!;
      if (block.kind !== "btw") return;
      block.text += clean;
      block.comp.setText(this.btwBody(block.question, block.text));
      return;
    }
    if (this.liveAssistant === null) this.beginAssistantTurn();
    const block = this.blocks[this.liveAssistant!]!;
    if (block.kind !== "assistant") return;
    block.text += clean;
    block.comp.setText(
      block.text.length > 0
        ? `${rolePill(this.agentName)}\n\n${renderMermaidBlocks(block.text, this.width, mermaidTheme)}`
        : "",
    );
  }

  /** Append a thinking delta to the live thinking block (suppressed in btw mode). */
  private appendThinking(delta: string): void {
    if (this.liveBtw !== null) return; // keep the btw block clean (no thinking)
    if (this.liveThinking === null) {
      // First thinking delta of the turn — create the block now, positioned
      // BEFORE the assistant block when one exists (thinking precedes text).
      const thinkComp = new Text(this.thinkingLine(""), 1, 0);
      const thinkBlock: Block = { kind: "thinking", text: "", revealed: this.thinkingRevealed, comp: thinkComp };
      const insertAt = this.liveAssistant ?? this.blocks.length;
      this.blocks.splice(insertAt, 0, thinkBlock);
      if (this.liveAssistant !== null) this.liveAssistant += 1;
      this.liveThinking = insertAt;
      this.reindexOpenTools();
    }
    const block = this.blocks[this.liveThinking!]!;
    if (block.kind !== "thinking") return;
    block.text += sanitizeTerminalText(delta);
    this.renderThinking(block);
  }

  /** Render a thinking block — collapsed preview or full revealed text. */
  private renderThinking(block: Block & { kind: "thinking" }): void {
    if (block.revealed) {
      block.comp.setText(`${textToken.muted("thinking")}\n${block.text}`);
    } else {
      block.comp.setText(this.thinkingLine(block.text));
    }
  }

  /** The collapsed thinking preview line (hidden by default, scope §3.3). */
  private thinkingLine(text: string): string {
    if (text.length === 0) return textToken.dim("⤷ thinking…");
    return textToken.dim(`⤷ thinking… ${text.length} chars (Ctrl+O to reveal)`);
  }

  /**
   * The live thinking pulse (E019 inc 04): while a turn streams, the open
   * thinking row shows the eased starburst frame + live char count, so the
   * reasoning is SEEN breathing instead of a dead static row. Driven by the
   * controller's busy tick; settles to the static line at turn_end.
   */
  tickThinking(frame?: number): void {
    if (this.liveThinking === null) return;
    const block = this.blocks[this.liveThinking]!;
    if (block.kind !== "thinking" || block.revealed) return;
    const index = capabilities().reducedMotion ? 0 : (frame ?? Math.floor(Date.now() / 120));
    const glyph = THINKING_PULSE_FRAMES[index % THINKING_PULSE_FRAMES.length] ?? "✻";
    const count = block.text.length > 0 ? ` ${block.text.length} chars` : "";
    block.comp.setText(`${highlight.base(glyph)} ${textToken.dim(`thinking…${count} (Ctrl+O to reveal)`)}`);
  }

  /** Open a tool card (muted left-border). */
  private openTool(toolCallId: string, toolName: string, args: unknown): void {
    const comp = new Text(this.renderToolCard(toolName, args, null, false), 1, 0);
    const block: Block = { kind: "tool", toolCallId, toolName, args, result: null, isError: false, settled: false, comp };
    this.blocks.push(block);
    this.openTools.set(toolCallId, this.blocks.length - 1);
  }

  /**
   * Apply a `tool_update` partial (E017 contract #3): the task tool streams
   * live progress (`status · toolCount · currentTool · elapsedMs`) through
   * the onUpdate channel — the open card re-renders as a live row instead of
   * a silent wait. Non-task partials are ignored.
   */
  private updateTool(toolCallId: string, partial: unknown): void {
    const progress = extractTaskProgress(partial);
    if (progress === undefined) return;
    const index = this.openTools.get(toolCallId);
    if (index === undefined) return;
    const block = this.blocks[index]!;
    if (block.kind !== "tool") return;
    block.progress = progress;
    block.comp.setText(this.renderToolCard(block.toolName, block.args, block.result, block.isError, progress));
  }

  /** Settle a tool card with its result. */
  private settleTool(toolCallId: string, result: unknown, isError: boolean): void {
    const index = this.openTools.get(toolCallId);
    if (index === undefined) return;
    const block = this.blocks[index]!;
    if (block.kind !== "tool") return;
    block.result = result;
    block.isError = isError;
    block.settled = true;
    block.comp.setText(this.renderToolCard(block.toolName, block.args, result, isError, block.progress));
    this.openTools.delete(toolCallId);
  }

  /**
   * Render a tool card — muted left-border, status in the header, args as
   * key:value pairs, results unwrapped to their text content (never the raw
   * envelope JSON). World-class means the operator reads WHAT HAPPENED, not
   * the wire shape.
   *
   * The task tool renders omp's live subagent row (E017 dossier pick 6):
   * `● task: <prompt preview> · N tools · <current tool>` while running —
   * the dot settles accent→plain on completion ("completion reads as a
   * colour change, not a new glyph") and the settled card keeps the stats
   * line (tools · elapsed).
   */
  private renderToolCard(toolName: string, args: unknown, result: unknown | null, isError: boolean, progress?: TaskProgress): string {
    const status = result === null
      ? highlight.base("● running…")
      : isError
        ? highlight.danger("✗ failed")
        : highlight.base("✓ done");
    // The tool name is model-chosen too (E001 finding F6c).
    const safeName = sanitizeTerminalText(toolName).replace(/\n/g, " ");

    if (toolName === "task") {
      return this.renderTaskCard(args, result, isError, progress);
    }

    const head = `${toolPrefix()}${highlight.base(safeName)} ${textToken.dim("·")} ${status}`;

    const argLines = formatArgs(args).map(
      (line) => `${toolPrefix()}  ${textToken.dim(line)}`,
    );

    if (result === null) {
      return [head, ...argLines].join("\n");
    }

    const resultLines = extractResultText(result, isError);
    const rendered = resultLines.map((line) =>
      `${toolPrefix()}  ${isError ? highlight.danger(line) : textToken.muted(line)}`,
    );
    return [head, ...argLines, ...rendered].join("\n");
  }

  /** The task tool's card: a live subagent row while running, stats when settled. */
  private renderTaskCard(args: unknown, result: unknown | null, isError: boolean, progress?: TaskProgress): string {
    let promptPreview = "";
    if (typeof args === "object" && args !== null && "prompt" in args && typeof args.prompt === "string") {
      promptPreview = sanitizeTerminalText(args.prompt).replace(/\s+/g, " ").trim();
    }
    if (promptPreview.length > 40) promptPreview = `${promptPreview.slice(0, 39)}…`;

    const stats: string[] = [];
    if (progress !== undefined) {
      stats.push(`${progress.toolCount} tool${progress.toolCount === 1 ? "" : "s"}`);
      if (progress.status !== "running") stats.push(progress.status);
      stats.push(`${(progress.elapsedMs / 1000).toFixed(1)}s`);
    }
    const running = result === null;
    // Running: the dot is accent-bright and the current tool trails the
    // stats; settled: plain dot ("completion reads as a colour change").
    const dot = running ? highlight.base("●") : isError ? highlight.danger("✗") : textToken.base("●");
    const current = running && progress?.currentTool !== undefined ? ` ${textToken.dim("·")} ${textToken.muted(sanitizeTerminalText(progress.currentTool))}` : "";
    const head = `${toolPrefix()}${dot} ${highlight.base("task")}${promptPreview ? `: ${textToken.base(promptPreview)}` : ""}${stats.length > 0 ? ` ${textToken.dim("·")} ${textToken.dim(stats.join(" · "))}` : ""}${current}`;

    if (result === null) return head;

    const resultLines = extractResultText(result, isError);
    const rendered = resultLines.map((line) =>
      `${toolPrefix()}  ${isError ? highlight.danger(line) : textToken.muted(line)}`,
    );
    return [head, ...rendered].join("\n");
  }

  // ── Component ───────────────────────────────────────────────────────────
  render(width: number): string[] {
    this.width = width;
    const layout = resolveLayout(width, this.viewportRows());
    const lines: string[] = [];
    for (const block of this.blocks) {
      if (block.kind === "notice" && block.boot === true && !layout.showBootExtras) {
        if (block.compactComp !== undefined) {
          lines.push(...block.compactComp.render(width));
          lines.push("");
        }
        continue;
      }
      const rendered = block.comp.render(width);
      // Assistant/btw blocks render clean — the role pill carries identity;
      // a full-width background strip per line reads as a selection, not a
      // message (world-class pass 2026-08-16).
      for (const line of rendered) lines.push(line);
      lines.push("");
    }
    return lines.map(renderTerminalText);
  }

  invalidate(): void {
    for (const block of this.blocks) {
      block.comp.invalidate();
      if (block.kind === "notice") block.compactComp?.invalidate();
    }
  }

  /** The last user block's text (for `/fuse` to reuse the last prompt). */
  lastUserText(): string {
    for (let i = this.blocks.length - 1; i >= 0; i -= 1) {
      const block = this.blocks[i]!;
      if (block.kind === "user") return block.text;
    }
    return "";
  }

  clear(): void {
    this.blocks = [];
    this.liveAssistant = null;
    this.liveThinking = null;
    this.liveBtw = null;
    this.openTools.clear();
  }

  /** Count of blocks by kind (for `/stats`). */
  blockCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const b of this.blocks) counts[b.kind] = (counts[b.kind] ?? 0) + 1;
    return counts;
  }

  /** Test accessor: block kinds in order (for event-mapping assertions). */
  blockKinds(): string[] {
    return this.blocks.map((b) => b.kind);
  }

  /** Test-facing text snapshot (mirrors {@link blockKinds}). */
  blockTexts(): string[] {
    return this.blocks.map((b) => ("text" in b ? String(b.text) : ""));
  }
}/** Starburst frames for the live thinking pulse (OMP's eased glyph set). */
const THINKING_PULSE_FRAMES = ["✻", "✼", "❉", "❊", "✺", "✹", "✸", "✶"];

