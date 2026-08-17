/**
 * Level picker overlay — a SelectList of entries with a short description
 * each, Enter applies. Shared by `/autonomy` and the bare `/fuse` menu so
 * every "pick one" interaction has the same grammar (CTO feedback).
 */

import { SelectList } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";

export interface LevelEntry {
  id: string;
  label: string;
  description: string;
}

export class LevelPicker implements Component {
  private list: SelectList;

  constructor(
    private readonly title: string,
    entries: LevelEntry[],
    current: string,
    private readonly onSelect: (id: string) => void,
    private readonly onCancel: () => void,
  ) {
    const items: SelectItem[] = entries.map((e) => ({
      value: e.id,
      label: `${e.id === current ? "● " : "  "}${e.label}`,
      description: e.description,
    }));
    this.list = new SelectList(items, entries.length + 2, paletteSelectTheme);
    this.list.onSelect = (item) => this.onSelect((item as SelectItem).value);
    this.list.onCancel = () => this.onCancel();
  }

  handleInput(data: string): void {
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    return opaquePanel(
      [
        ` ${highlight.base(this.title)} ${textToken.dim("— Enter to pick; Esc back")}`,
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
