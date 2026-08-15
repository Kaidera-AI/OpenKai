/**
 * Transcript renderer (scope §4 `transcript.ts`).
 *
 * Holds an ordered list of blocks — user messages, assistant messages,
 * thinking sections, and tool cards — and renders them to lines. Text deltas
 * append to the current assistant message's Markdown block (re-render block,
 * not screen); thinking deltas buffer into a collapsed-by-default section
 * revealed by the density toggle (Ctrl+O); `tool_call` opens a card,
 * `tool_result` settles it (args summary + result preview, truncated).
 *
 * Block model is addressed by {@link SessionEvent} fields: a `delta` carries
 * `field` (`text`|`thinking`) + `partId`; the renderer routes it to the
 * matching part of the live assistant turn. `turn_end` settles the message
 * block; `usage` is handled by the status line, not here.
 */

import { Markdown, Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { markdownTheme, surface, text as textToken, toolBorder, highlight } from "./theme.js";

/** One rendered line's max length for previews (kept short for cards). */
const PREVIEW_LEN = 120;

/** Truncate a value to a single-line preview. */
function preview(value: unknown): string {
  const str = typeof value === "string" ? value : safeStringify(value);
  const oneLine = str.replace(/\n/g, " ");
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

/** Block kinds the transcript renders. */
type Block =
  | { kind: "user"; text: string; comp: Markdown }
  | { kind: "assistant"; text: string; comp: Markdown }
  | { kind: "thinking"; text: string; revealed: boolean; comp: Text }
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
  /** Index of the live assistant block (the one receiving deltas). */
  private liveAssistant: number | null = null;
  /** Index of the live thinking block (paired with the live assistant). */
  private liveThinking: number | null = null;
  /** Open tool cards by toolCallId → block index. */
  private openTools = new Map<string, number>();
  /** Thinking density: false = collapsed (default, scope §3.3), true = shown. */
  private thinkingRevealed = false;

  /** Add a user message block at the top of a turn. */
  addUserMessage(text: string): void {
    const comp = new Markdown(`**You**\n\n${text}`, 1, 0, markdownTheme);
    this.blocks.push({ kind: "user", text, comp });
  }

  /** Replay a settled assistant message (session resume — no live streaming). */
  replayAssistant(text: string): void {
    const comp = new Markdown(`**Assistant**\n\n${text}`, 1, 0, markdownTheme);
    this.blocks.push({ kind: "assistant", text, comp });
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
  }): void {
    switch (event.kind) {
      case "connected":
        // A new turn is starting — ensure a live assistant block exists.
        this.beginAssistantTurn();
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
        break;
      case "session_end":
        this.liveAssistant = null;
        this.liveThinking = null;
        break;
      default:
        break;
    }
  }

  /** Begin a new assistant turn block (called on `connected`). */
  private beginAssistantTurn(): void {
    // A paired thinking block, collapsed by default.
    const thinkComp = new Text(this.thinkingLine(""), 1, 0);
    const thinkBlock: Block = {
      kind: "thinking",
      text: "",
      revealed: this.thinkingRevealed,
      comp: thinkComp,
    };
    this.blocks.push(thinkBlock);
    this.liveThinking = this.blocks.length - 1;
    // The assistant markdown block.
    const comp = new Markdown("", 1, 0, markdownTheme);
    const block: Block = { kind: "assistant", text: "", comp };
    this.blocks.push(block);
    this.liveAssistant = this.blocks.length - 1;
  }

  /** Append a text delta to the live assistant block (re-render block only). */
  private appendText(delta: string): void {
    if (this.liveAssistant === null) this.beginAssistantTurn();
    const block = this.blocks[this.liveAssistant!]!;
    if (block.kind !== "assistant") return;
    block.text += delta;
    block.comp.setText(block.text.length > 0 ? `**Assistant**\n\n${block.text}` : "");
  }

  /** Append a thinking delta to the live thinking block. */
  private appendThinking(delta: string): void {
    if (this.liveThinking === null) this.beginAssistantTurn();
    const block = this.blocks[this.liveThinking!]!;
    if (block.kind !== "thinking") return;
    block.text += delta;
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
    const block: Block = {
      kind: "tool",
      toolCallId,
      toolName,
      args,
      result: null,
      isError: false,
      settled: false,
      comp,
    };
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

  /** Render a tool card line — muted left-border, args summary + result preview. */
  private renderToolCard(toolName: string, args: unknown, result: unknown | null, isError: boolean): string {
    const head = `${toolPrefix()}${textToken.strong("tool")} ${highlight.base(toolName)}`;
    const argsLine = `${toolPrefix()}  ${textToken.muted("args:")} ${preview(args)}`;
    if (result === null) {
      return `${head}\n${argsLine}\n${toolPrefix()}  ${highlight.base("◌ running…")}`;
    }
    const status = isError ? highlight.danger("✗ error") : highlight.base("✓ ok");
    const resultLine = `${toolPrefix()}  ${textToken.muted("result:")} ${status} ${preview(result)}`;
    return `${head}\n${argsLine}\n${resultLine}`;
  }

  // ── Component ───────────────────────────────────────────────────────────
  render(width: number): string[] {
    const lines: string[] = [];
    for (const block of this.blocks) {
      const rendered = block.comp.render(width);
      // Assistant blocks get a surface-2 background so they read as raised
      // blocks; tool cards are borderless (the left border is the visual
      // signal). User + thinking blocks are unadorned.
      if (block.kind === "assistant") {
        for (const line of rendered) lines.push(surface["2"](line));
      } else {
        for (const line of rendered) lines.push(line);
      }
      lines.push(""); // blank line between blocks
    }
    return lines;
  }

  invalidate(): void {
    for (const block of this.blocks) block.comp.invalidate();
  }

  /** Test accessor: block kinds in order (for event-mapping assertions). */
  blockKinds(): string[] {
    return this.blocks.map((b) => b.kind);
  }
}