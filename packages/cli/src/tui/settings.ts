/**
 * Settings overlay (`/setup`, `/settings`) — everything the first-run wizard
 * covers, adjustable WITHOUT leaving the TUI. Nothing in OpenKai ejects the
 * operator except /exit (CTO rule 2026-08-17).
 */

import { SelectList, fuzzyFilter } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import type { ShiftPosture } from "@kaidera/openkai-core";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";
import { PROVIDERS, providerKeyStatus } from "../providers.js";
import { FEATURES, featureEnabled, setFeature } from "./features.js";
import { themeName, themeNames, setTheme } from "./theme.js";
import { DEFAULT_STATUSLINE_CHIPS, readStatuslineChips, readConfigFile, readToolApprovals, writeShiftPosture, type StatuslineChip } from "../config.js";
import { readShiftConfig } from "../fuse.js";
import { invalidateMagicKeywordsCache } from "./magic-keywords.js";
import { writeConfigFile } from "../config.js";

// ── Magic keywords (ultrathink/ultrareview — E017 UK round 4) ──────────────

type MagicKeywordsMode = "all" | "think" | "review" | "off";

function readMagicKeywordsMode(): MagicKeywordsMode {
  const slice = readConfigFile()["magicKeywords"];
  if (typeof slice !== "object" || slice === null) return "all";
  const record = slice as Record<string, unknown>;
  if (record["enabled"] === false) return "off";
  const think = record["ultrathink"] !== false;
  const review = record["ultrareview"] !== false;
  if (think && review) return "all";
  if (think) return "think";
  if (review) return "review";
  return "off";
}

function magicKeywordsState(): string {
  switch (readMagicKeywordsMode()) {
    case "all":
      return "ultrathink + ultrareview";
    case "think":
      return "ultrathink only";
    case "review":
      return "ultrareview only";
    case "off":
      return "off";
  }
}

/** Cycle all → think → review → off; persists the magicKeywords config slice. */
function cycleMagicKeywords(): string {
  invalidateMagicKeywordsCache();
  const order: MagicKeywordsMode[] = ["all", "think", "review", "off"];
  const next = order[(order.indexOf(readMagicKeywordsMode()) + 1) % order.length]!;
  const config = readConfigFile();
  config["magicKeywords"] =
    next === "off"
      ? { enabled: false }
      : { enabled: true, ultrathink: next !== "review", ultrareview: next !== "think" };
  writeConfigFile(config);
  return `magic keywords: ${magicKeywordsState()}`;
}

export interface SettingsActions {
  pickModel: () => void;
  /** Open the theme picker (visible list; E017 UX — no blind cycling). */
  pickTheme: () => void;
  /** Open the status-line preset picker. */
  pickStatusline: () => void;
  /** Open the routing posture picker. */
  pickPosture: () => void;
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
  /**
   * The row opens another overlay (picker, sign-in). The settings overlay
   * closes BEFORE the action runs — otherwise the close pops the freshly
   * opened overlay off the stack (hideOverlay pops the topmost).
   */
  navigates?: boolean;
}

const TABS = ["appearance", "providers", "model", "interaction", "memory", "features", "routing"] as const;
type SettingsTab = (typeof TABS)[number];

/** Status line presets (omp's statusLine.preset shape) over our chip sets. */
const STATUSLINE_PRESETS: Record<string, { label: string; chips: StatuslineChip[] }> = {
  default: { label: "brand · agent · provider · persist · state | tokens · model", chips: [...DEFAULT_STATUSLINE_CHIPS] },
  minimal: { label: "brand · state | model", chips: ["brand", "state", "model"] },
  compact: { label: "brand · provider · state | tokens · model", chips: ["brand", "provider", "state", "tokens", "model"] },
  full: { label: "every chip", chips: ["brand", "agent", "provider", "git", "persist", "session", "state", "ctx", "tokens", "model"] },
};

function currentPresetName(): string {
  const active = readStatuslineChips().join(",");
  for (const [name, preset] of Object.entries(STATUSLINE_PRESETS)) {
    if (preset.chips.join(",") === active) return name;
  }
  return "custom";
}

/** One-line summary of the persisted per-tool approval overrides (E017 pick 7). */
function toolApprovalsSummary(): string {
  const approvals = Object.entries(readToolApprovals());
  if (approvals.length === 0) return "none (prompt-by-default)";
  return approvals.map(([tool, policy]) => `${tool}=${policy}`).join(" · ");
}

/** The settings panel (omp's tabbed shape): appearance/providers/model/interaction/memory/features/routing. */
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
            description: `now: ${(readConfigFile().theme as string | undefined) ?? "auto"} — Enter to pick from the list`,
            navigates: true,
            action: () => {
              this.actions.pickTheme();
              return undefined;
            },
          },
          {
            value: "statusline",
            label: "status line",
            description: `now: ${preset} — Enter to pick from the list`,
            navigates: true,
            action: () => {
              this.actions.pickStatusline();
              return undefined;
            },
          },
        ];
      }
      case "providers":
        return Object.entries(PROVIDERS).map(([id, info]) => {
          const status = providerKeyStatus(id);
          const state = info.keyless === true
            ? "keyless — no API key; the local server must be running"
            : status.configured && status.via
              ? `✓ via ${status.via}`
              : status.oauth === true
                ? "OAuth lane"
                : `set ${status.needsKey}`;
          return {
            value: `provider:${id}`,
            label: info.label,
            description: state,
            ...(info.keyless === true ? {} : { navigates: true }),
            action: () => {
              if (info.keyless === true) {
                return "keyless lane — nothing to sign in; start the server and pick a model";
              }
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
            navigates: true,
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
            label: "access level",
            description: `now: ${this.actions.currentAutonomy()} — Enter to change what runs without asking`,
            navigates: true,
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
          {
            value: "magicKeywords",
            label: "magic keywords",
            description: `${magicKeywordsState()} — Enter to cycle`,
            action: () => cycleMagicKeywords(),
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
      case "routing": {
        const shift = readShiftConfig(readConfigFile());
        const posture: ShiftPosture = shift.posture ?? "balanced";
        const pins = shift.pins ?? {};
        const floor = Object.entries(pins.floor ?? {}).map(([stage, tier]) => `${stage}≥${tier}`);
        const pinsSummary = [
          floor.length > 0 ? `floor: ${floor.join(" ")}` : "floor: —",
          `ceiling: ${pins.ceiling ?? "—"}`,
          pins.never !== undefined && pins.never.length > 0 ? `never: ${pins.never.join(", ")}` : "never: —",
        ].join(" · ");
        return [
          {
            value: "routing:posture",
            label: "posture",
            description: `now: ${posture} — Enter to pick from the list`,
            navigates: true,
            action: () => {
              this.actions.pickPosture();
              return undefined;
            },
          },
          {
            value: "routing:pins",
            label: "model pins (read-only)",
            description: `${pinsSummary} — edit ~/.openkai/config.json shift.pins`,
            action: () => `pins: ${pinsSummary}`,
          },
          {
            value: "routing:approvals",
            label: "tool approvals (read-only)",
            description: `${toolApprovalsSummary()} — edit ~/.openkai/config.json tools.approval`,
            action: () => `tool approvals: ${toolApprovalsSummary()}`,
          },
        ];
      }
    }
  }

  private buildList(rows: Row[]): SelectList {
    const filtered = this.query
      ? fuzzyFilter(rows, this.query, (r) => r.label)
      : rows;
    const list = new SelectList(filtered, 14, paletteSelectTheme);
    list.onSelect = (item) => {
      const row = item as Row;
      if (row.navigates === true) {
        // Close settings FIRST, then open the target overlay (stack order).
        this.onClose();
        row.action?.();
        return;
      }
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
