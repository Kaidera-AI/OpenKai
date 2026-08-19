/**
 * Fork-from-message picker (E017 dossier pick 3 — pi's UserMessageSelector
 * adapted to our overlay conventions). Lists every past user message newest
 * first (via `SessionStore.listUserMessages`, contract #2); Enter forks the
 * session at that entry (`SessionStore.forkAtEntry`), Esc cancels. The
 * controller owns the async fork; this overlay is pure presentation over
 * our SelectList chrome.
 */

import { SelectList } from "@earendil-works/pi-tui";
import type { Component, SelectItem } from "@earendil-works/pi-tui";
import { highlight, opaquePanel, paletteSelectTheme, renderOverlayFooter, text as textToken } from "./theme.js";
import { relativeTime } from "./history-search.js";

/** One forkable point: a past user message (contract #2 row). */
export interface ForkPoint {
  entryId: string;
  text: string;
  timestamp: number;
}

export class ForkPicker implements Component {
  private readonly list: SelectList;

  constructor(
    points: readonly ForkPoint[],
    private readonly onPick: (point: ForkPoint) => void,
    private readonly onCancel: () => void,
  ) {
    // Newest first; selection starts on the most recent message (pi's default).
    const newestFirst = [...points].reverse();
    const items: SelectItem[] = newestFirst.map((point, i) => ({
      value: point.entryId,
      // Single-line normalised preview (pi's label) + position/age metadata.
      label: point.text.replace(/\s+/g, " ").trim().slice(0, 60) || "(empty)",
      description: `message ${points.length - i} of ${points.length} · ${relativeTime(point.timestamp)}`,
    }));
    this.list = new SelectList(items, 10, paletteSelectTheme);
    this.list.onSelect = (item) => {
      const point = newestFirst.find((p) => p.entryId === item.value);
      if (point) this.onPick(point);
    };
    this.list.onCancel = () => this.onCancel();
  }

  handleInput(data: string): void {
    this.list.handleInput(data);
  }

  render(width: number): string[] {
    return opaquePanel(
      [
        ` ${highlight.base("fork")} ${textToken.dim("— rewind to a past message; Enter forks there; Esc back")}`,
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
