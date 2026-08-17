/**
 * Provider/model picker (`/model`) — a five-level browse:
 *   provider → model → effort → partner-provider → partner-model
 * The fusion partner uses the SAME provider-first interface as the primary
 * pick, so the operator always knows which lane the second model lives on
 * (CTO feedback 2026-08-18). Fuzzy-filterable, canonical footer grammar,
 * theme tokens only.
 */
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, opaquePanel } from "./theme.js";
import { SelectList, fuzzyFilter } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";

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

type Level = "providers" | "models" | "effort" | "partnerProviders" | "partnerModels";

/** The five-level provider→model→effort→partner picker overlay. */
export class ModelPicker implements Component {
  private level: Level = "providers";
  private query = "";
  private list: SelectList;
  private provider: string | undefined;
  private pickedModel: string | undefined;
  private effort: string = "off";
  private partnerProvider: string | undefined;
  private allRows: Row[];

  constructor(
    private readonly providers: ProviderEntry[],
    private readonly modelsFor: (provider: string) => ModelEntry[],
    private readonly current: { provider: string; modelId: string; effort?: string },
    private readonly configuredOthers: (provider: string) => string[],
    private readonly onSelect: (selection: ModelPickerSelection) => void,
    private readonly onCancel: () => void,
  ) {
    this.effort = current.effort ?? "off";
    this.allRows = this.providerRows();
    this.list = this.buildList(this.allRows);
  }

  private providerRows(): Row[] {
    return this.providers.map((p) => ({
      value: p.id,
      label: `${p.id === this.current.provider ? "● " : "  "}${p.label}`,
      description: p.oauth ? "subscription" : p.configured ? "key set" : "no key",
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
      description: level === "off" ? "fastest" : level === "high" ? "deepest" : "",
      effortLevel: level,
    }));
  }

  /** Partner provider list — same interface as the primary pick. */
  private partnerProviderRows(): Row[] {
    const rows: Row[] = [
      { value: "_skip", label: "  skip — self-pair", description: "same model both roles", skip: true },
    ];
    for (const id of this.configuredOthers(this.provider ?? "")) {
      const p = this.providers.find((x) => x.id === id);
      rows.push({
        value: id,
        label: `  ${p?.label ?? id}`,
        description: p?.oauth ? "subscription" : "key set",
        providerId: id,
      });
    }
    return rows;
  }

  private partnerModelRows(provider: string): Row[] {
    return this.modelsFor(provider).map((m) => {
      const ctx = formatContext(m.contextWindow);
      const cost = formatCost(m.cost);
      const meta = [ctx, cost].filter((s) => s.length > 0).join(" · ");
      return {
        value: m.id,
        label: `  ${m.name ?? m.id}`,
        description: meta,
        modelId: m.id,
      };
    });
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
    switch (this.level) {
      case "providers":
        if (!row.providerId) return;
        this.provider = row.providerId;
        this.goto("models");
        return;
      case "models":
        if (!row.modelId || !this.provider) return;
        this.pickedModel = row.modelId;
        this.goto("effort");
        return;
      case "effort":
        if (!row.effortLevel) return;
        this.effort = row.effortLevel;
        this.goto("partnerProviders");
        return;
      case "partnerProviders":
        if (row.skip) {
          this.finish(undefined);
          return;
        }
        if (!row.providerId) return;
        this.partnerProvider = row.providerId;
        this.goto("partnerModels");
        return;
      case "partnerModels":
        if (!row.modelId || !this.partnerProvider) return;
        this.finish({ provider: this.partnerProvider, modelId: row.modelId });
        return;
    }
  }

  private goto(level: Level): void {
    this.level = level;
    this.query = "";
    this.allRows =
      level === "models" ? this.modelRows(this.provider!)
      : level === "effort" ? this.effortRows()
      : level === "partnerProviders" ? this.partnerProviderRows()
      : level === "partnerModels" ? this.partnerModelRows(this.partnerProvider!)
      : this.providerRows();
    this.list = this.buildList(this.allRows);
  }

  private finish(partner: { provider: string; modelId: string } | undefined): void {
    this.onSelect({
      provider: this.provider!,
      modelId: this.pickedModel!,
      effort: this.effort,
      partner,
    });
  }

  private handleCancel(): void {
    switch (this.level) {
      case "partnerModels":
        this.goto("partnerProviders");
        return;
      case "partnerProviders":
        this.goto("effort");
        return;
      case "effort":
        this.goto("models");
        return;
      case "models":
        this.goto("providers");
        return;
      default:
        this.onCancel();
    }
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
        ? `${highlight.base("provider")} ${textToken.dim("— Enter to browse models")}`
        : this.level === "models"
          ? `${highlight.base(this.provider ?? "")} ${textToken.dim("— Enter to pick; Esc back")}`
          : this.level === "effort"
            ? `${highlight.base("effort")} ${textToken.dim(`— for ${this.pickedModel}; Esc back`)}`
            : this.level === "partnerProviders"
              ? `${highlight.base("fusion partner")} ${textToken.dim("— pick the 2nd provider (or skip); Esc back")}`
              : `${highlight.base(this.partnerProvider ?? "")} ${textToken.dim("— the partner model; Esc back")}`;
    const filter = this.query ? `${textToken.dim("filter:")} ${this.query}` : textToken.dim("type to filter");
    return opaquePanel(
      [
        ` ${title}`,
        ` ${filter}`,
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
