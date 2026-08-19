/**
 * Theme picker with live preview (CTO 2026-08-19): scrolling the list
 * applies the candidate theme immediately so the operator SEES how it looks;
 * Enter persists it (config + apply); Esc cancels and restores the original
 * theme. Same overlay grammar as every other picker.
 */

import { SelectList } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";
import { themeNames, themeName, setTheme, detectThemeSync } from "./theme.js";
import { readConfigFile } from "../config.js";

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
  private readonly configured: string;

  constructor(options: ThemePickerOptions) {
    this.original = themeName;
    // The ● marks the CONFIGURED choice (what persists), not the resolved
    // pack — with config theme=auto the settings row says "now: auto" and
    // the marker must agree.
    this.configured = (readConfigFile()["theme"] as string | undefined) ?? "auto";
    const entries = ["auto", ...themeNames()].map((id) => ({
      value: id,
      label: `${id === this.configured ? "● " : "  "}${id}`,
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
    // "auto" previews as the sync detection (COLORFGBG) — never an OSC-11
    // query on the running TUI's stdin.
    setTheme(id === "auto" ? detectThemeSync() : id);
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
