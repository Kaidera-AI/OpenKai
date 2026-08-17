/**
 * Prompt history search (Ctrl+R) — omp's reverse-search: type to filter the
 * submitted-prompt history, Enter puts the match in the composer.
 */

import { SelectList, fuzzyFilter } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";

export class HistorySearch implements Component {
  private query = "";
  private list: SelectList;
  private readonly all: SelectItem[];

  constructor(
    history: readonly string[],
    private readonly onPick: (text: string) => void,
    private readonly onCancel: () => void,
  ) {
    // newest first
    this.all = [...history].reverse().map((h) => ({ value: h, label: h, description: "" }));
    this.list = this.buildList();
  }

  private buildList(): SelectList {
    const filtered = this.query ? fuzzyFilter(this.all, this.query, (r) => r.label) : this.all;
    const list = new SelectList(filtered, 10, paletteSelectTheme);
    list.onSelect = (item) => this.onPick((item as SelectItem).value);
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
