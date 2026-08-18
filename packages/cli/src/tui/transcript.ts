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
import { highlight, markdownTheme, rolePill, text as textToken, toolBorder } from "./theme.js";
import { sanitizeTerminalText } from "./sanitize.js";
import { renderMermaidBlocks, type MermaidTheme } from "./mermaid.js";

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
  | { kind: "notice"; text: string; comp: Text }
  | { kind: "btw"; question: string; text: string; comp: Markdown }
  | { kind: "tool"; toolCallId: string; toolName: string; args: unknown; result: unknown | null; isError: boolean; settled: boolean; comp: Text };

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
  private thinkingRevealed = false;
  /** Agent name for the assistant identity pill (scope §1.2). */
  private readonly agentName: string;

  constructor(agentName = "openkai") {
    this.agentName = agentName;
  }

  /** Render width hint for mermaid fitting (updated on render). */
  private width = 80;

  /** Add a user message block at the top of a turn. */
  addUserMessage(text: string): void {
    // Dim marker, not a shouty bold label — the operator's own text needs no
    // emphasis, the model's output does. Sanitised: pastes can carry escapes.
    const clean = sanitizeTerminalText(text);
    const comp = new Text(`${textToken.dim("You")}\n\n${clean}`, 1, 0);
    this.blocks.push({ kind: "user", text: clean, comp });
  }

  /**
   * Add a local notice block — slash-command output (`/help`, `/sessions`, …).
   * Never sent to the model and never persisted; it is operator-local chrome.
   * Sanitised here (single choke point): notice bodies routinely embed
   * model/tool text — error messages, paths, session ids (E001 §2).
   */
  addNotice(lines: string | string[]): void {
    const body = Array.isArray(lines) ? lines.join("\n") : lines;
    const clean = sanitizeTerminalText(body);
    const comp = new Text(
      clean.split("\n").map((line) => `${toolBorder("▎ ")}${textToken.muted(line)}`).join("\n"),
      1,
      0,
    );
    this.blocks.push({ kind: "notice", text: clean, comp });
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
   */
  addFusionResult(
    outputs: { role: string; modelId: string; text: string; latencyMs: number }[],
    synthesis: {
      consensus: string[];
      divergences: { topic: string; architect: string; builder: string; kept: string }[];
      discarded: { item: string; reason: string; by: string }[];
      blindSpots: string[];
    },
  ): void {
    for (const output of outputs) {
      const header = `${rolePill(output.role)} ${textToken.dim(`· ${output.modelId} · ${output.latencyMs}ms`)}`;
      const clean = sanitizeTerminalText(output.text);
      const comp = new Markdown(`${header}\n\n${clean}`, 1, 0, markdownTheme);
      this.blocks.push({ kind: "assistant", text: clean, comp });
    }

    const clean = (s: string): string => sanitizeTerminalText(s);
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
      case "tool_result":
        this.settleTool(event.toolCallId ?? "?", event.result, event.isError ?? false);
        break;
      case "turn_end":
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
    const thinkComp = new Text(this.thinkingLine(""), 1, 0);
    const thinkBlock: Block = { kind: "thinking", text: "", revealed: this.thinkingRevealed, comp: thinkComp };
    this.blocks.push(thinkBlock);
    this.liveThinking = this.blocks.length - 1;
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
    if (this.liveThinking === null) this.beginAssistantTurn();
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

  /** Open a tool card (muted left-border). */
  private openTool(toolCallId: string, toolName: string, args: unknown): void {
    const comp = new Text(this.renderToolCard(toolName, args, null, false), 1, 0);
    const block: Block = { kind: "tool", toolCallId, toolName, args, result: null, isError: false, settled: false, comp };
    this.blocks.push(block);
    this.openTools.set(toolCallId, this.blocks.length - 1);
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
    block.comp.setText(this.renderToolCard(block.toolName, block.args, result, isError));
    this.openTools.delete(toolCallId);
  }

  /**
   * Render a tool card — muted left-border, status in the header, args as
   * key:value pairs, results unwrapped to their text content (never the raw
   * envelope JSON). World-class means the operator reads WHAT HAPPENED, not
   * the wire shape.
   */
  private renderToolCard(toolName: string, args: unknown, result: unknown | null, isError: boolean): string {
    const status = result === null
      ? highlight.base("● running…")
      : isError
        ? highlight.danger("✗ failed")
        : highlight.base("✓ done");
    // The tool name is model-chosen too (E001 finding F6c).
    const safeName = sanitizeTerminalText(toolName).replace(/\n/g, " ");
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

  // ── Component ───────────────────────────────────────────────────────────
  render(width: number): string[] {
    this.width = width;
    const lines: string[] = [];
    for (const block of this.blocks) {
      const rendered = block.comp.render(width);
      // Assistant/btw blocks render clean — the role pill carries identity;
      // a full-width background strip per line reads as a selection, not a
      // message (world-class pass 2026-08-16).
      for (const line of rendered) lines.push(line);
      lines.push("");
    }
    return lines;
  }

  invalidate(): void {
    for (const block of this.blocks) block.comp.invalidate();
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
}
