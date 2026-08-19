/**
 * Prompt history search (Ctrl+R) — omp's reverse-search: type to filter the
 * submitted-prompt history, Enter puts the match in the composer.
 *
 * E017 dossier pick 6: matched tokens are highlighted per-token (same
 * tokenisation as the query, case-insensitive, merged ranges) and each row
 * carries a compact relative-time label (`now/5m/2h/3d/2w/6mo/1y`) when the
 * caller knows when the prompt was submitted.
 */

import { SelectList, fuzzyFilter } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";

/** One history entry: the prompt text plus an optional submission time (epoch ms). */
export interface HistoryEntry {
  text: string;
  timestamp?: number;
}

/** Split a query into lowercase letter/number tokens (omp's tokeniser). */
export function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

/**
 * Highlight every occurrence of each token in `text` (omp port): ranges are
 * collected case-insensitively, sorted, merged (later ranges covered by an
 * earlier one are skipped), and wrapped in the accent token. Plain text
 * between matches passes through untouched.
 */
export function highlightTokens(text: string, tokens: string[]): string {
  if (tokens.length === 0) return text;
  const lower = text.toLowerCase();
  const ranges: Array<[number, number]> = [];
  for (const tok of tokens) {
    let from = lower.indexOf(tok);
    while (from !== -1) {
      ranges.push([from, from + tok.length]);
      from = lower.indexOf(tok, from + 1);
    }
  }
  if (ranges.length === 0) return text;
  ranges.sort((a, b) => a[0] - b[0]);
  let out = "";
  let pos = 0;
  for (const [start, end] of ranges) {
    if (end <= pos) continue; // covered by a merged range
    const from = Math.max(start, pos);
    if (from > pos) out += text.slice(pos, from);
    out += highlight.base(text.slice(from, end));
    pos = end;
  }
  if (pos < text.length) out += text.slice(pos);
  return out;
}

/**
 * Compact age label (omp's ladder, epoch-ms flavour): now / Nm / Nh / Nd /
 * Nw / Nmo / Ny. Exported for the other pickers (session search, fork).
 */
export function relativeTime(epochMs: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - epochMs) / 1000));
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

export class HistorySearch implements Component {
  private query = "";
  private list: SelectList;
  private readonly all: HistoryEntry[];

  constructor(
    history: readonly (string | HistoryEntry)[],
    private readonly onPick: (text: string) => void,
    private readonly onCancel: () => void,
  ) {
    // newest first; bare strings are entries without a known timestamp
    this.all = [...history]
      .map((h) => (typeof h === "string" ? { text: h } : h))
      .reverse();
    this.list = this.buildList();
  }

  private buildList(): SelectList {
    const tokens = queryTokens(this.query);
    const filtered = this.query
      ? fuzzyFilter(this.all, this.query, (r) => r.text)
      : this.all;
    const items: SelectItem[] = filtered.map((entry) => ({
      value: entry.text,
      label: highlightTokens(entry.text, tokens),
      description: entry.timestamp !== undefined ? relativeTime(entry.timestamp) : "",
    }));
    const list = new SelectList(items, 10, paletteSelectTheme);
    list.onSelect = (item) => this.onPick(item.value);
    list.onCancel = () => this.onCancel();
    return list;
  }

  handleInput(data: string): void {
    if (data === "\x7f") {
      this.query = this.query.slice(0, -1);
      this.list = this.buildList();
      return;
    }
    if (data.length === 1 && data >= " ") {
      this.query += data;
      this.list = this.buildList();
      return;
    }
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    return opaquePanel(
      [
        ` ${highlight.base("history")} ${textToken.dim(`— ${this.query ? `search: ${this.query}` : "type to search"}; Enter to reuse; Esc back`)}`,
        "",
        ...this.list.render(width - 4),
        "",
        ` ${textToken.dim(renderOverlayFooter())}`,
      ],
      width,
    );
  }

  invalidate(): void {
    this.list.invalidate();
  }
}
