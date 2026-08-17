/**
 * Level picker overlay (`/autonomy`) — a SelectList of levels with a short
 * description each, Enter applies. Same interaction grammar as the model
 * picker so switching autonomy feels like picking effort (CTO feedback).
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
    title: string,
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
    void title;
  }

  handleInput(data: string): void {
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    return opaquePanel([
      ` ${highlight.base("autonomy")} ${textToken.dim("— how much runs without asking; Esc back")}`,
      "",
      ...this.list.render(width - 4),
      "",
      ` ${textToken.dim(renderOverlayFooter())}`,
    ], width);
  }

  invalidate(): void {
    this.list.invalidate();
  }
}
