/**
 * Leader-key command palette (scope §1.3).
 *
 * A {@link Component} overlay opened by a leader key (Ctrl+K): a filter line +
 * a fuzzy-filtered {@link SelectList} of every command + the **canonical
 * overlay footer** (scope §3.2 — identical footer grammar to every overlay).
 * Fuzzy filtering uses pi-tui's {@link fuzzyFilter}; the {@link SelectList}
 * owns navigation/confirm/cancel. Typing appends to the query and rebuilds the
 * list from the fuzzy-ordered matches, so the palette doubles as a which-key
 * hint surface — each row shows the command's key.
 *
 * Renderable headlessly (the golden-frame test calls `render(width)` and
 * asserts the footer grammar). All colour comes from {@link theme.ts}.
 */

import { SelectList, fuzzyFilter, getKeybindings, matchesKey } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { paletteSelectTheme, renderOverlayFooter, text as textToken, highlight } from "./theme.js";

/** One selectable command/action surfaced in the palette. */
export interface PaletteItem {
  /** Stable id (also part of the fuzzy match text), e.g. `help`. */
  value: string;
  /** Human label, e.g. `Help`. */
  label: string;
  /** One-line description. */
  description: string;
  /** Which-key hint, e.g. `Ctrl+O`. Shown as the row's secondary column. */
  keys?: string;
  /** Optional action bound by the controller (invoked on select). */
  action?: () => void;
}

/** Options for {@link CommandPalette}. */
export interface CommandPaletteOptions {
  /** The full command set (filtered by the query). */
  items: PaletteItem[];
  /** Called when the operator confirms a selection. */
  onSelect: (item: PaletteItem) => void;
  /** Called when the operator cancels (Esc / Ctrl+C). */
  onCancel: () => void;
}

/**
 * The command palette overlay. Holds the live query, fuzzy-filters the item
 * set on every keystroke, and delegates up/down/enter/esc to an inner
 * {@link SelectList}. The inner list is rebuilt when the filter changes (the
 * palette owns ordering; the SelectList's built-in prefix filter is unused).
 */
export class CommandPalette implements Component {
  private readonly items: PaletteItem[];
  private readonly onSelectCb: (item: PaletteItem) => void;
  private readonly onCancelCb: () => void;
  private query = "";
  private select: SelectList;
  /** Guards against double-fire (Enter then Esc during teardown). */
  private answered = false;

  constructor(options: CommandPaletteOptions) {
    this.items = options.items;
    this.onSelectCb = options.onSelect;
    this.onCancelCb = options.onCancel;
    this.select = this.buildList();
  }

  /** The current filter query (test accessor). */
  get currentQuery(): string {
    return this.query;
  }

  /** The fuzzy-filtered items for the current query. */
  filteredItems(): PaletteItem[] {
    return fuzzyFilter(this.items, this.query, (item) => `${item.value} ${item.label} ${item.description} ${item.keys ?? ""}`);
  }

  /** Rebuild the inner SelectList from the current fuzzy matches. */
  private buildList(): SelectList {
    const matched = this.filteredItems();
    const selectItems: SelectItem[] = matched.map((item) => ({
      value: item.value,
      label: item.label,
      description: item.keys ?? item.description,
    }));
    const list = new SelectList(selectItems, 8, paletteSelectTheme);
    list.onSelect = (item) => {
      if (this.answered) return;
      this.answered = true;
      const match = matched.find((m) => m.value === item.value) ?? item;
      this.onSelectCb(match as PaletteItem);
    };
    list.onCancel = () => {
      if (this.answered) return;
      this.answered = true;
      this.onCancelCb();
    };
    return list;
  }

  invalidate(): void {
    this.select.invalidate();
  }

  /**
   * Route keyboard input: navigation/confirm/cancel -> inner SelectList;
   * printable chars -> append to the query + rebuild; backspace -> truncate +
   * rebuild. Uses the global keybinding registry so user remaps are honoured.
   */
  handleInput(data: string): void {
    const kb = getKeybindings();
    if (
      kb.matches(data, "tui.select.up") ||
      kb.matches(data, "tui.select.down") ||
      kb.matches(data, "tui.select.pageUp") ||
      kb.matches(data, "tui.select.pageDown") ||
      kb.matches(data, "tui.select.confirm") ||
      kb.matches(data, "tui.select.cancel")
    ) {
      this.select.handleInput(data);
      return;
    }
    // Backspace -> truncate the query.
    if (matchesKey(data, "backspace")) {
      if (this.query.length > 0) {
        this.query = this.query.slice(0, -1);
        this.select = this.buildList();
      }
      return;
    }
    // Printable ASCII -> append to the query + rebuild.
    if (isPrintable(data)) {
      this.query += data;
      this.select = this.buildList();
    }
    // Anything else (multibyte/escape sequences not bound above) is ignored.
  }

  /** Render the palette frame: filter line + list + canonical footer. */
  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(`${highlight.base("❯")} ${this.query.length > 0 ? textToken.base(this.query) : textToken.dim("type to filter…")}`);
    for (const line of this.select.render(width)) {
      lines.push(line);
    }
    // Canonical overlay footer (scope §3.2) — identical grammar to every overlay.
    lines.push(renderOverlayFooter());
    return lines;
  }
}

/** True if `data` is a single printable ASCII character (length 1, code ≥ 0x20). */
function isPrintable(data: string): boolean {
  return data.length === 1 && data.charCodeAt(0) >= 0x20 && data.charCodeAt(0) < 0x7f;
}
