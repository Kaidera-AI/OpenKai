/**
 * Settings overlay (`/setup`, `/settings`) — everything the first-run wizard
 * covers, adjustable WITHOUT leaving the TUI. Nothing in OpenKai ejects the
 * operator except /exit (CTO rule 2026-08-17).
 */

import { SelectList, fuzzyFilter } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";
import { PROVIDERS, providerKeyStatus } from "../providers.js";
import { FEATURES, featureEnabled, setFeature } from "./features.js";
import { themeName, themeNames, setTheme } from "./theme.js";
import { DEFAULT_STATUSLINE_CHIPS, readStatuslineChips, type StatuslineChip } from "../config.js";

export interface SettingsActions {
  pickModel: () => void;
  toggleTheme: () => string;
  setMemory: (mode: "local" | "cortex", project?: string) => void;
  currentProject?: string;
  /** Open the in-TUI sign-in flow for a provider (key entry or OAuth). */
  signIn: (providerId: string) => void;
  /** Apply a status line preset live + persist it. */
  setStatusline: (preset: string) => void;
  /** Open the autonomy level picker. */
  pickAutonomy: () => void;
  /** Current autonomy level (off/low/med/high). */
  currentAutonomy: () => string;
}

interface Row extends SelectItem {
  action?: () => string | undefined;
}

const TABS = ["appearance", "providers", "model", "interaction", "memory", "features"] as const;
type SettingsTab = (typeof TABS)[number];

/** Status line presets (omp's statusLine.preset shape) over our chip sets. */
const STATUSLINE_PRESETS: Record<string, { label: string; chips: StatuslineChip[] }> = {
  default: { label: "brand · agent · provider · persist · state | tokens · model", chips: [...DEFAULT_STATUSLINE_CHIPS] },
  minimal: { label: "brand · state | model", chips: ["brand", "state", "model"] },
  compact: { label: "brand · provider · state | tokens · model", chips: ["brand", "provider", "state", "tokens", "model"] },
  full: { label: "every chip", chips: ["brand", "agent", "provider", "persist", "session", "state", "tokens", "model"] },
};

function currentPresetName(): string {
  const active = readStatuslineChips().join(",");
  for (const [name, preset] of Object.entries(STATUSLINE_PRESETS)) {
    if (preset.chips.join(",") === active) return name;
  }
  return "custom";
}

/** The settings panel (omp's tabbed shape): appearance/providers/model/memory/features. */
export class SettingsOverlay implements Component {
  private tab: SettingsTab;
  private query = "";
  private list: SelectList;
  private rows: Row[];
  private outcome: string | undefined;

  constructor(
    private readonly actions: SettingsActions,
    private readonly onClose: () => void,
    initialTab: SettingsTab = "appearance",
  ) {
    this.tab = initialTab;
    this.rows = this.buildRows();
    this.list = this.buildList(this.rows);
  }

  private buildRows(): Row[] {
    switch (this.tab) {
      case "appearance": {
        const preset = currentPresetName();
        return [
          {
            value: "theme",
            label: "theme",
            description: `now: ${themeName} — Enter to cycle (${themeNames().join(" / ")})`,
            action: () => this.actions.toggleTheme(),
          },
          {
            value: "statusline",
            label: "status line",
            description: `now: ${preset} — Enter to cycle (default → minimal → compact → full)`,
            action: () => {
              const names = Object.keys(STATUSLINE_PRESETS);
              const next = names[(names.indexOf(preset) + 1) % names.length]!;
              this.actions.setStatusline(next);
              return `status line: ${next} (${STATUSLINE_PRESETS[next]!.label})`;
            },
          },
        ];
      }
      case "providers":
        return Object.entries(PROVIDERS).map(([id, info]) => {
          const status = providerKeyStatus(id);
          const state = status.oauth === true
            ? "OAuth lane"
            : status.configured
              ? `✓ via ${status.via}`
              : `set ${status.needsKey}`;
          return {
            value: `provider:${id}`,
            label: info.label,
            description: state,
            action: () => {
              this.actions.signIn(id);
              return undefined;
            },
          };
        });
      case "model":
        return [
          {
            value: "model",
            label: "model & effort & fusion partner",
            description: "open the picker",
            action: () => {
              this.actions.pickModel();
              return undefined;
            },
          },
        ];
      case "interaction":
        return [
          {
            value: "autonomy",
            label: "autonomy",
            description: `now: ${this.actions.currentAutonomy()} — Enter to pick a level`,
            action: () => {
              this.actions.pickAutonomy();
              return undefined;
            },
          },
          {
            value: "tips",
            label: "daily tips",
            description: featureEnabled("tips") ? "on" : "off",
            action: () => {
              const next = !featureEnabled("tips");
              setFeature("tips", next);
              return `tips: ${next ? "on" : "off"}`;
            },
          },
        ];
      case "memory":
        return [
          {
            value: "memory:local",
            label: "local files (.openkai/)",
            description: "offline default — sessions stay in this project",
            action: () => {
              this.actions.setMemory("local");
              return "memory: local files";
            },
          },
          {
            value: "memory:cortex",
            label: "Cortex (KOS) — recommended",
            description: "shared searchable memory for long projects",
            action: () => {
              this.actions.setMemory("cortex", this.actions.currentProject ?? "openkai");
              return `memory: Cortex for next launch (CORTEX_PROJECT=${this.actions.currentProject ?? "openkai"})`;
            },
          },
        ];
      case "features":
        return FEATURES.map((f) => ({
          value: `feature:${f.key}`,
          label: f.label,
          description: featureEnabled(f.key) ? "on" : "off",
          action: () => {
            const next = !featureEnabled(f.key);
            setFeature(f.key, next);
            return `${f.label}: ${next ? "on" : "off"}`;
          },
        }));
    }
  }

  private buildList(rows: Row[]): SelectList {
    const filtered = this.query
      ? fuzzyFilter(rows, this.query, (r) => r.label)
      : rows;
    const list = new SelectList(filtered, 14, paletteSelectTheme);
    list.onSelect = (item) => {
      const row = item as Row;
      const message = row.action?.();
      if (message === undefined) {
        this.onClose(); // an action that navigates away (model picker)
        return;
      }
      this.rows = this.buildRows();
      this.list = this.buildList(this.rows);
      this.outcome = message;
    };
    list.onCancel = () => this.onClose();
    return list;
  }

  handleInput(data: string): void {
    if (data === "\x1b[D" || data === "\x1b[C") {
      // ← / → switch tabs
      const index = TABS.indexOf(this.tab);
      const next = (index + (data === "\x1b[C" ? 1 : TABS.length - 1)) % TABS.length;
      this.tab = TABS[next]!;
      this.query = "";
      this.outcome = undefined;
      this.rows = this.buildRows();
      this.list = this.buildList(this.rows);
      return;
    }
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
    const tabLine = TABS.map((t) =>
      t === this.tab ? highlight.base(` ${t} `) : textToken.dim(` ${t} `),
    ).join(textToken.dim("·"));
    const out = [
      ` ${tabLine} ${textToken.dim("— ←/→ switch tab")}`,
      ` ${this.query ? `${textToken.dim("filter:")} ${this.query}` : textToken.dim("type to filter")}`,
      "",
      ...this.list.render(width - 4),
    ];
    if (this.outcome) out.push("", ` ${highlight.base("→")} ${this.outcome}`);
    out.push("", ` ${textToken.dim(renderOverlayFooter())}`);
    return opaquePanel(out, width);
  }

  invalidate(): void {
    this.list.invalidate();
  }
}
