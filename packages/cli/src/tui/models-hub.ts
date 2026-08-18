/**
 * Fullscreen `/models` hub (omp's shape, droid look): a sidebar of scopes —
 * recently used, all models, one entry per provider — beside a model list
 * with context + cost columns. Enter on a model switches the session model.
 * The compact alt-flow stays `/model` (the five-level picker).
 */

import { SelectList, fuzzyFilter, visibleWidth } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, paletteSelectTheme, renderOverlayFooter, text as textToken, surface, opaquePanel } from "./theme.js";

export interface HubProvider {
  id: string;
  label: string;
  configured: boolean;
}

export interface HubModel {
  id: string;
  name?: string;
  contextWindow?: number;
  cost?: { input?: number; output?: number };
}

function formatContext(ctx?: number): string {
  if (!ctx || ctx <= 0) return "";
  if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(ctx % 1_000_000 === 0 ? 0 : 1)}m`;
  if (ctx >= 1000) return `${Math.round(ctx / 1000)}k`;
  return String(ctx);
}

function formatCost(cost?: { input?: number; output?: number }): string {
  if (!cost) return "";
  const inCost = cost.input ?? 0;
  const outCost = cost.output ?? 0;
  if (inCost <= 0 && outCost <= 0) return "free";
  const fmt = (n: number) => (n < 1 ? n.toString() : String(Math.round(n)));
  return `$${fmt(inCost)}/${fmt(outCost)}`;
}

interface ScopeRow extends SelectItem {
  scope: string;
}

interface ModelRow extends SelectItem {
  modelId?: string;
  providerId?: string;
}

export class ModelsHub implements Component {
  private scope: string = "all";
  private query = "";
  private scopeList: SelectList;
  private modelList: SelectList;
  private focus: "scope" | "model" = "scope";

  constructor(
    private readonly providers: HubProvider[],
    private readonly modelsFor: (provider: string) => HubModel[],
    private readonly recent: string[],
    private readonly current: { provider: string; modelId: string },
    private readonly onPick: (provider: string, modelId: string) => void,
    private readonly onCancel: () => void,
  ) {
    this.scopeList = this.buildScopeList();
    this.modelList = this.buildModelList();
  }

  private scopes(): { id: string; label: string }[] {
    return [
      { id: "recent", label: "recently used" },
      { id: "all", label: "all models" },
      ...this.providers.map((p) => ({ id: p.id, label: p.label })),
    ];
  }

  private buildScopeList(): SelectList {
    const rows: ScopeRow[] = this.scopes().map((s) => ({
      value: s.id,
      label: `${s.id === this.scope ? "▶ " : "  "}${s.label}`,
      description: s.id === "all" ? `${this.allModels().length}` : s.id === "recent" ? `${this.recent.length}` : `${this.modelsFor(s.id).length}`,
      scope: s.id,
    }));
    const list = new SelectList(rows, rows.length + 2, paletteSelectTheme);
    list.onSelect = (item) => {
      this.scope = (item as ScopeRow).scope;
      this.focus = "model";
      this.scopeList = this.buildScopeList();
      this.modelList = this.buildModelList();
    };
    list.onCancel = () => this.onCancel();
    return list;
  }

  private allModels(): { provider: string; model: HubModel }[] {
    return this.providers.flatMap((p) => this.modelsFor(p.id).map((m) => ({ provider: p.id, model: m })));
  }

  private scopedModels(): { provider: string; model: HubModel }[] {
    if (this.scope === "all") return this.allModels();
    if (this.scope === "recent") {
      return this.recent
        .map((key) => {
          const [provider, ...rest] = key.split("/");
          const modelId = rest.join("/");
          const model = this.modelsFor(provider!).find((m) => m.id === modelId);
          return model ? { provider: provider!, model } : undefined;
        })
        .filter((x): x is { provider: string; model: HubModel } => x !== undefined);
    }
    return this.modelsFor(this.scope).map((m) => ({ provider: this.scope, model: m }));
  }

  private buildModelList(): SelectList {
    const rows: ModelRow[] = this.scopedModels().map(({ provider, model }) => {
      const ctx = formatContext(model.contextWindow);
      const cost = formatCost(model.cost);
      const meta = [ctx, cost].filter((s) => s.length > 0).join(" · ");
      const isCurrent = provider === this.current.provider && model.id === this.current.modelId;
      return {
        value: `${provider}/${model.id}`,
        label: `${isCurrent ? "● " : "  "}${model.name ?? model.id}`,
        description: [this.scope === "all" || this.scope === "recent" ? provider : "", meta].filter((s) => s.length > 0).join(" · "),
        modelId: model.id,
        providerId: provider,
      };
    });
    const filtered = this.query ? fuzzyFilter(rows, this.query, (r) => `${r.label} ${r.value}`) : rows;
    const list = new SelectList(filtered, 12, paletteSelectTheme);
    list.onSelect = (item) => {
      const row = item as ModelRow;
      if (row.providerId && row.modelId) this.onPick(row.providerId, row.modelId);
    };
    list.onCancel = () => {
      if (this.focus === "model") {
        this.focus = "scope";
      } else {
        this.onCancel();
      }
    };
    return list;
  }

  handleInput(data: string): void {
    if (data === "\t") {
      this.focus = this.focus === "scope" ? "model" : "scope";
      return;
    }
    if (this.focus === "model") {
      if (data === "\x7f") {
        this.query = this.query.slice(0, -1);
        this.modelList = this.buildModelList();
        return;
      }
      if (data.length === 1 && data >= " ") {
        this.query += data;
        this.modelList = this.buildModelList();
        return;
      }
      this.modelList.handleInput(data);
      return;
    }
    this.scopeList.handleInput(data);
  }

  render(width: number): string[] {
    const sidebarWidth = Math.max(20, Math.min(30, Math.floor(width * 0.28)));
    const bodyWidth = width - sidebarWidth - 3;
    const scopeLines = this.scopeList.render(sidebarWidth - 2);
    const modelLines = this.modelList.render(bodyWidth - 2);
    const rows = Math.max(scopeLines.length, modelLines.length);
    const out: string[] = [
      ` ${highlight.base("models")} ${textToken.dim("— Tab switches pane · Enter picks · Esc back")}`,
      ` ${this.query ? `${textToken.dim("filter:")} ${this.query}` : textToken.dim("type to filter models")}`,
      "",
    ];
    for (let i = 0; i < rows; i += 1) {
      const left = scopeLines[i] ?? "";
      const right = modelLines[i] ?? "";
      const leftPadded = left + " ".repeat(Math.max(0, sidebarWidth - visibleWidth(left)));
      out.push(` ${surface["2"](leftPadded)} ${textToken.dim("│")} ${right}`);
    }
    out.push("", ` ${textToken.dim(renderOverlayFooter())}`);
    return opaquePanel(out, width);
  }

  invalidate(): void {
    this.scopeList.invalidate();
    this.modelList.invalidate();
  }
}
