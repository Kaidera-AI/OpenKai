/**
 * Provider/model picker (`/model`) — two-level browse: providers (with their
 * configured state) → the provider's models from the bundled catalogue.
 * Fuzzy-filterable, canonical footer grammar, theme tokens only.
 */

import { SelectList, fuzzyFilter } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken } from "./theme.js";

export interface ProviderEntry {
  id: string;
  label: string;
  configured: boolean;
  oauth?: boolean;
}

export interface ModelEntry {
  id: string;
  name?: string;
  /** Context window in tokens (omp's metadata column). */
  contextWindow?: number;
  /** Per-million USD cost pair, input/output (omp's cost column). */
  cost?: { input?: number; output?: number };
}

export interface ModelPickerSelection {
  provider: string;
  modelId: string;
  effort: string;
  /** The fusion partner (builder model) — the picker's second selection. */
  partner?: { provider: string; modelId: string };
}

interface Row extends SelectItem {
  providerId?: string;
  modelId?: string;
  effortLevel?: string;
  skip?: boolean;
  partnerProvider?: string;
  partnerModel?: string;
}

/** `200k` context window (omp's formatContext, abbreviated). */
function formatContext(ctx?: number): string {
  if (!ctx || ctx <= 0) return "";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(ctx % 1_000_000 === 0 ? 0 : 1)}m`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}k`;
  return String(ctx);
}

/** `$1/5` per-million cost pair; `free` when both legs are zero (omp's shape). */
function formatCost(cost?: { input?: number; output?: number }): string {
  if (!cost) return "";
  const inCost = cost.input ?? 0;
  const outCost = cost.output ?? 0;
  if (inCost <= 0 && outCost <= 0) return "free";
  const fmt = (n: number) => (n < 1 ? n.toString() : String(Math.round(n)));
  return `$${fmt(inCost)}/${fmt(outCost)}`;
}

const EFFORT_LEVELS = ["off", "minimal", "low", "medium", "high"] as const;

/** The four-level provider→model→effort→partner picker overlay. */
export class ModelPicker implements Component {
  private level: "providers" | "models" | "effort" | "partner";
  private query = "";
  private list: SelectList;
  private provider: string | undefined;
  private pickedModel: string | undefined;
  private effort: string = "off";
  private allRows: Row[];

  constructor(
    private readonly providers: ProviderEntry[],
    private readonly modelsFor: (provider: string) => ModelEntry[],
    private readonly current: { provider: string; modelId: string; effort?: string },
    private readonly configuredOthers: (provider: string) => string[],
    private readonly onSelect: (selection: ModelPickerSelection) => void,
    private readonly onCancel: () => void,
  ) {
    this.level = "providers";
    this.effort = current.effort ?? "off";
    this.allRows = this.providerRows();
    this.list = this.buildList(this.allRows);
  }

  private providerRows(): Row[] {
    return this.providers.map((p) => ({
      value: p.id,
      label: `${p.id === this.current.provider ? "● " : "  "}${p.label}`,
      description: p.oauth ? "subscription (OAuth)" : p.configured ? "key configured" : "no key",
      providerId: p.id,
    }));
  }

  private modelRows(provider: string): Row[] {
    return this.modelsFor(provider).map((m) => {
      const ctx = formatContext(m.contextWindow);
      const cost = formatCost(m.cost);
      const meta = [ctx, cost].filter((s) => s.length > 0).join(" · ");
      return {
        value: m.id,
        label: `${m.id === this.current.modelId && provider === this.current.provider ? "● " : "  "}${m.name ?? m.id}`,
        description: [m.name ? m.id : "", meta].filter((s) => s.length > 0).join(" · "),
        modelId: m.id,
      };
    });
  }

  private effortRows(): Row[] {
    return EFFORT_LEVELS.map((level) => ({
      value: level,
      label: `${level === this.effort ? "● " : "  "}${level}`,
      description:
        level === "off" ? "fastest, no reasoning" : level === "high" ? "deepest reasoning" : "",
      effortLevel: level,
    }));
  }

  private partnerRows(): Row[] {
    const rows: Row[] = [
      {
        value: "_skip",
        label: "  skip — self-pair (same model both roles)",
        description: "works fine; two providers is the real lift",
        skip: true,
      },
    ];
    for (const providerId of this.configuredOthers(this.provider ?? "")) {
      for (const m of this.modelsFor(providerId).slice(0, 12)) {
        rows.push({
          value: `${providerId}/${m.id}`,
          label: `  ${m.name ?? m.id}`,
          description: providerId,
          partnerProvider: providerId,
          partnerModel: m.id,
        });
      }
    }
    return rows;
  }

  private buildList(rows: Row[]): SelectList {
    const filtered = this.query
      ? fuzzyFilter(rows, this.query, (r) => `${r.label} ${r.value}`)
      : rows;
    const list = new SelectList(filtered, 12, paletteSelectTheme);
    list.onSelect = (item) => this.handleSelect(item as Row);
    list.onCancel = () => this.handleCancel();
    return list;
  }

  private handleSelect(row: Row): void {
    if (this.level === "providers" && row.providerId) {
      this.provider = row.providerId;
      this.level = "models";
      this.query = "";
      this.allRows = this.modelRows(row.providerId);
      this.list = this.buildList(this.allRows);
      return;
    }
    if (this.level === "models" && row.modelId && this.provider) {
      this.pickedModel = row.modelId;
      this.level = "effort";
      this.query = "";
      this.allRows = this.effortRows();
      this.list = this.buildList(this.allRows);
      return;
    }
    if (this.level === "effort" && row.effortLevel) {
      this.effort = row.effortLevel;
      this.level = "partner";
      this.query = "";
      this.allRows = this.partnerRows();
      this.list = this.buildList(this.allRows);
      return;
    }
    if (this.level === "partner" && this.provider && this.pickedModel) {
      this.onSelect({
        provider: this.provider,
        modelId: this.pickedModel,
        effort: this.effort,
        partner: row.skip
          ? undefined
          : { provider: row.partnerProvider!, modelId: row.partnerModel! },
      });
    }
  }

  private handleCancel(): void {
    if (this.level === "partner") {
      this.level = "effort";
      this.query = "";
      this.allRows = this.effortRows();
      this.list = this.buildList(this.allRows);
      return;
    }
    if (this.level === "effort") {
      this.level = "models";
      this.query = "";
      this.allRows = this.modelRows(this.provider!);
      this.list = this.buildList(this.allRows);
      return;
    }
    if (this.level === "models") {
      this.level = "providers";
      this.query = "";
      this.provider = undefined;
      this.allRows = this.providerRows();
      this.list = this.buildList(this.allRows);
      return;
    }
    this.onCancel();
  }

  /** Text input feeds the fuzzy query; navigation keys go to the list. */
  handleInput(data: string): void {
    if (data === "\x7f") {
      this.query = this.query.slice(0, -1);
      this.list = this.buildList(this.allRows);
      return;
    }
    if (data.length === 1 && data >= " ") {
      this.query += data;
      this.list = this.buildList(this.allRows);
      return;
    }
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    const title =
      this.level === "providers"
        ? `${highlight.base("providers")} ${textToken.dim("— Enter to browse models")}`
        : this.level === "models"
          ? `${highlight.base(this.provider ?? "")} ${textToken.dim("— Enter to pick; Esc back")}`
          : this.level === "effort"
            ? `${highlight.base("effort")} ${textToken.dim(`— for ${this.pickedModel}; Esc back`)}`
            : `${highlight.base("fusion partner")} ${textToken.dim("— the 2nd model (or skip); Esc back")}`;
    const filter = this.query ? `${textToken.dim("filter:")} ${this.query}` : textToken.dim("type to filter");
    return [
      ` ${title}`,
      ` ${filter}`,
      "",
      ...this.list.render(width - 4),
      "",
      ` ${textToken.dim(renderOverlayFooter())}`,
    ];
  }

  invalidate(): void {
    this.list.invalidate();
  }
}
