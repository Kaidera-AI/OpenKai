/**
 * Theme picker with live preview (CTO 2026-08-19): scrolling the list
 * applies the candidate theme immediately so the operator SEES how it looks;
 * Enter persists it (config + apply); Esc cancels and restores the original
 * theme. Same overlay grammar as every other picker.
 */

import { SelectList } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";
import { themeNames, themeName, setTheme } from "./theme.js";

export interface ThemePickerOptions {
  /** Persist the final choice (writeConfigFile by the caller) and apply. */
  onApply: (id: string) => void;
  /** Called on cancel (the picker restores the original theme itself first). */
  onCancel: () => void;
}

const DESCRIPTIONS: Record<string, string> = {
  auto: "follows your terminal background (OSC 11 / COLORFGBG)",
  dark: "Kaidera dark — mint on graphite (default)",
  light: "Kaidera light",
  catppuccin: "pastel dark, soft contrast",
  dracula: "high-contrast purple dark",
  gruvbox: "warm retro dark",
  nord: "cool arctic blues",
  "one-dark": "Atom's classic dark",
  rosepine: "muted rose-pine dark",
  solarized: "Solarized precision",
  tokyonight: "neon night Tokyo",
};

export class ThemePicker implements Component {
  private readonly list: SelectList;
  private readonly original: string;

  constructor(options: ThemePickerOptions) {
    this.original = themeName;
    const entries = ["auto", ...themeNames()].map((id) => ({
      value: id,
      label: `${id === this.original ? "● " : "  "}${id}`,
      description: DESCRIPTIONS[id] ?? "theme pack",
    }));
    this.list = new SelectList(entries, entries.length + 2, paletteSelectTheme);
    // Live preview (CTO): every cursor move applies the candidate so the
    // whole app repaints in it before the operator commits.
    this.list.onSelectionChange = (item) => this.preview((item as SelectItem).value);
    this.list.onSelect = (item) => options.onApply((item as SelectItem).value);
    this.list.onCancel = () => {
      this.preview(this.original); // restore before leaving
      options.onCancel();
    };
  }

  private preview(id: string): void {
    if (id === "auto") return; // auto needs the async OSC-11 detect — preview skips it (applied on Enter)
    setTheme(id);
  }

  handleInput(data: string): void {
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    const out = [
      ` ${highlight.base("theme")} ${textToken.dim("— move to preview · Enter applies · Esc restores")}`,
      "",
      ...this.list.render(width - 4),
      "",
      ` ${textToken.dim(renderOverlayFooter())}`,
    ];
    return opaquePanel(out, width);
  }

  invalidate(): void {
    this.list.invalidate();
  }
}
