/**
 * Settings overlay (`/setup`, `/settings`) — everything the first-run wizard
 * covers, adjustable WITHOUT leaving the TUI. Nothing in OpenKai ejects the
 * operator except /exit (CTO rule 2026-08-17).
 */

import { SelectList, fuzzyFilter } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken } from "./theme.js";
import { PROVIDERS, providerKeyStatus } from "../providers.js";
import { FEATURES, featureEnabled, setFeature } from "./features.js";
import { themeName, themeNames, setTheme } from "./theme.js";

export interface SettingsActions {
  pickModel: () => void;
  toggleTheme: () => string;
  setMemory: (mode: "local" | "cortex", project?: string) => void;
  currentProject?: string;
}

interface Row extends SelectItem {
  action?: () => string | undefined;
}

/** The settings panel: providers, model, theme, memory, features, wizard. */
export class SettingsOverlay implements Component {
  private query = "";
  private list: SelectList;
  private rows: Row[];

  constructor(private readonly actions: SettingsActions, private readonly onClose: () => void) {
    this.rows = this.buildRows();
    this.list = this.buildList(this.rows);
  }

  private buildRows(): Row[] {
    const rows: Row[] = [];

    rows.push({ value: "_h1", label: highlight.base("providers"), description: "", action: undefined });
    for (const [id, info] of Object.entries(PROVIDERS)) {
      const status = providerKeyStatus(id);
      const state = status.oauth === true
        ? "OAuth lane"
        : status.configured
          ? `✓ via ${status.via}`
          : `set ${status.needsKey}`;
      rows.push({
        value: `provider:${id}`,
        label: `  ${info.label}`,
        description: state,
        action: () => `add the key to ~/.openkai/.env as ${status.needsKey ?? "the provider credentials"} (env wins)`,
      });
    }

    rows.push({ value: "_h2", label: highlight.base("session"), description: "", action: undefined });
    rows.push({
      value: "model",
      label: "  model & effort",
      description: "open the picker",
      action: () => {
        this.actions.pickModel();
        return undefined;
      },
    });
    rows.push({
      value: "theme",
      label: "  theme",
      description: `now: ${themeName} — Enter to cycle`,
      action: () => this.actions.toggleTheme(),
    });
    rows.push({
      value: "memory:local",
      label: "  memory: local files",
      description: "sessions under .openkai/ (offline default)",
      action: () => {
        this.actions.setMemory("local");
        return "memory: local files (sessions stay in this project)";
      },
    });
    rows.push({
      value: "memory:cortex",
      label: "  memory: Cortex (KOS)",
      description: "shared searchable memory — recommended for long projects",
      action: () => {
        this.actions.setMemory("cortex", this.actions.currentProject ?? "openkai");
        return `memory: Cortex mode set for next launch (CORTEX_PROJECT=${this.actions.currentProject ?? "openkai"})`;
      },
    });

    rows.push({ value: "_h3", label: highlight.base("features"), description: "", action: undefined });
    for (const f of FEATURES) {
      rows.push({
        value: `feature:${f.key}`,
        label: `  ${f.label}`,
        description: featureEnabled(f.key) ? "on" : "off",
        action: () => {
          const next = !featureEnabled(f.key);
          setFeature(f.key, next);
          return `${f.label}: ${next ? "on" : "off"}`;
        },
      });
    }

    rows.push({ value: "_h4", label: highlight.base("wizard"), description: "", action: undefined });
    rows.push({
      value: "wizard",
      label: "  re-run first-run wizard",
      description: "plays next launch, in-app",
      action: () => "the wizard replays on next launch (no exit needed — close settings when done)",
    });

    return rows;
  }

  private buildList(rows: Row[]): SelectList {
    const selectable = rows.filter((r) => r.action !== undefined);
    const filtered = this.query
      ? fuzzyFilter(selectable, this.query, (r) => r.label)
      : selectable;
    const list = new SelectList(filtered, 14, paletteSelectTheme);
    list.onSelect = (item) => {
      const row = item as Row;
      const message = row.action?.();
      if (message === undefined) {
        this.onClose(); // an action that navigates away (model picker)
        return;
      }
      // Refresh rows so toggles/states re-render, then show the outcome.
      this.rows = this.buildRows();
      this.list = this.buildList(this.rows);
      this.outcome = message;
    };
    list.onCancel = () => this.onClose();
    return list;
  }

  private outcome: string | undefined;

  handleInput(data: string): void {
    if (data === "\x7f") {
      this.query = this.query.slice(0, -1);
      this.list = this.buildList(this.rows);
      return;
    }
    if (data.length === 1 && data >= " ") {
      this.query += data;
      this.list = this.buildList(this.rows);
      return;
    }
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    const out = [
      ` ${highlight.base("settings")} ${textToken.dim("— nothing here exits the app; only /exit does")}`,
      ` ${this.query ? `${textToken.dim("filter:")} ${this.query}` : textToken.dim("type to filter")}`,
      "",
      ...this.list.render(width - 4),
    ];
    if (this.outcome) out.push("", ` ${highlight.base("→")} ${this.outcome}`);
    out.push("", ` ${textToken.dim(renderOverlayFooter())}`);
    return out;
  }

  invalidate(): void {
    this.list.invalidate();
  }
}
