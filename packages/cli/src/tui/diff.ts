/**
 * `/diff` overlay (E017 S1 — ren's TUI research: the missing diff viewer).
 *
 * A scrollable, read-only view of the unified diff between the latest
 * shadow-git snapshot and the work tree (the seam is
 * {@link ShadowGit.diff} — the TUI never shells out itself). Every line is
 * sanitised at construction: diff content is file content, which is
 * tool/model-sourced and hostile to the terminal (E001 §2 — the same
 * boundary every render path holds).
 *
 * Interaction grammar is the canonical one (scope §3.2): ↑/↓ scroll,
 * PageUp/PageDown page, Home/End jump, Esc/q close — the footer says so.
 * All colour comes from theme tokens; ad-hoc literals are a defect.
 */

import { matchesKey } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { highlight, opaquePanel, renderOverlayFooter, text as textToken } from "./theme.js";
import { sanitizeTerminalText } from "./sanitize.js";

/**
 * Tint one diff line with the theme tokens (pure — exported for tests).
 * Deletions read in the danger accent, additions in the base highlight,
 * hunk headers in the attention accent, file headers strong; everything
 * else is plain text. No literals — the tokens are the only colour source.
 */
export function tintDiffLine(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return textToken.strong(line);
  if (line.startsWith("+")) return highlight.base(line);
  if (line.startsWith("-")) return highlight.danger(line);
  if (line.startsWith("@@")) return highlight.attention(line);
  if (line.startsWith("diff ") || line.startsWith("index ")) return textToken.muted(line);
  return textToken.base(line);
}

export class DiffOverlay implements Component {
  /** Sanitised diff lines (control sequences stripped at construction). */
  private readonly lines: string[];
  private offset = 0;
  /** Body rows shown per render — sized by the controller from the terminal. */
  private readonly viewHeight: number;

  constructor(
    private readonly title: string,
    lines: string[],
    private readonly onClose: () => void,
    viewHeight = 12,
  ) {
    this.lines = lines.map((line) => sanitizeTerminalText(line));
    this.viewHeight = Math.max(3, viewHeight);
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || data === "q") {
      this.onClose();
      return;
    }
    if (matchesKey(data, "up")) this.scrollBy(-1);
    else if (matchesKey(data, "down")) this.scrollBy(1);
    else if (matchesKey(data, "pageUp")) this.scrollBy(-this.viewHeight);
    else if (matchesKey(data, "pageDown")) this.scrollBy(this.viewHeight);
    else if (matchesKey(data, "home")) this.offset = 0;
    else if (matchesKey(data, "end")) this.offset = Math.max(0, this.lines.length - this.viewHeight);
  }

  /** Current scroll offset (test accessor). */
  get scrollOffset(): number {
    return this.offset;
  }

  /** Total line count (test accessor). */
  get lineCount(): number {
    return this.lines.length;
  }

  private scrollBy(delta: number): void {
    const maxOffset = Math.max(0, this.lines.length - this.viewHeight);
    this.offset = Math.min(maxOffset, Math.max(0, this.offset + delta));
  }

  render(width: number): string[] {
    const visible = this.lines.slice(this.offset, this.offset + this.viewHeight);
    const position =
      this.lines.length > this.viewHeight
        ? ` ${textToken.dim(`lines ${this.offset + 1}–${Math.min(this.offset + this.viewHeight, this.lines.length)} of ${this.lines.length}`)}`
        : ` ${textToken.dim(`${this.lines.length} line${this.lines.length === 1 ? "" : "s"}`)}`;
    return opaquePanel(
      [
        ` ${highlight.base(this.title)} ${textToken.dim("— read-only")}`,
        "",
        ...visible.map((line) => ` ${tintDiffLine(line)}`),
        "",
        position,
        ` ${textToken.dim(renderOverlayFooter())}`,
      ],
      width,
    );
  }

  invalidate(): void {
    // Stateless render — nothing cached to invalidate.
  }
}
