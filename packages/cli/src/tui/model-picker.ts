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
}

export interface ModelPickerSelection {
  provider: string;
  modelId: string;
}

interface Row extends SelectItem {
  providerId?: string;
  modelId?: string;
}

/** The two-level provider→model picker overlay. */
export class ModelPicker implements Component {
  private level: "providers" | "models";
  private query = "";
  private list: SelectList;
  private provider: string | undefined;
  private allRows: Row[];

  constructor(
    private readonly providers: ProviderEntry[],
    private readonly modelsFor: (provider: string) => ModelEntry[],
    private readonly current: { provider: string; modelId: string },
    private readonly onSelect: (selection: ModelPickerSelection) => void,
    private readonly onCancel: () => void,
  ) {
    this.level = "providers";
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
    return this.modelsFor(provider).map((m) => ({
      value: m.id,
      label: `${m.id === this.current.modelId && provider === this.current.provider ? "● " : "  "}${m.name ?? m.id}`,
      description: m.name ? m.id : "",
      modelId: m.id,
    }));
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
      this.onSelect({ provider: this.provider, modelId: row.modelId });
    }
  }

  private handleCancel(): void {
    if (this.level === "models") {
      // First Esc steps back to providers; second cancels (drill-down grammar).
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
        : `${highlight.base(this.provider ?? "")} ${textToken.dim("— Enter to switch; Esc back")}`;
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
