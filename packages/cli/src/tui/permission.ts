/**
 * Permission overlay (P4b scope §5) — the approval surface for a
 * `permission_request` event.
 *
 * Shown via `tui.showOverlay(...)` when the controller receives a
 * `permission_request`. Renders the tool name + rule, a diff/command preview,
 * a three-item {@link SelectList} (`Allow once` / `Allow always` / `Reject`),
 * and the canonical overlay footer (scope §3.2 + §5: identical footer grammar
 * to every other overlay — ad-hoc literals are a review defect).
 *
 * **All colour comes from theme.ts** — removed diff lines use
 * `highlight.danger` (red), added lines use `highlight.base` (cyan); the rule
 * line uses `text.muted`; the footer uses {@link renderOverlayFooter}. The
 * overlay itself is a {@link Component} so it renders headlessly for the
 * golden-frame test (scope §6): the test asserts the footer grammar + the
 * theme-token diff colours on the captured frame.
 *
 * `handleInput` delegates to the inner {@link SelectList}; `onSelect`/`onCancel`
 * fire {@link onDecision}, which the controller wires to
 * `transport.respond(requestId, decision)` + `tui.hideOverlay()`.
 */

import { SelectList, type SelectItem } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import type { PermissionPreview } from "@kaidera/openkai-core";
import { highlight, renderOverlayFooter, surface, text as textToken, toolBorder } from "./theme.js";

/** The approval decision the overlay emits to the controller. */
export type PermissionDecision = "once" | "always" | "reject";

/** The three approval actions surfaced as a SelectList. */
const APPROVAL_ITEMS: SelectItem[] = [
  { value: "once", label: "Allow once", description: "approve this call only" },
  { value: "always", label: "Allow always", description: "approve identical calls this session" },
  { value: "reject", label: "Reject", description: "deny and tell the model" },
];

/** Options for {@link PermissionOverlay}. */
export interface PermissionOverlayOptions {
  /** The tool name awaiting approval. */
  toolName: string;
  /** Short human reason from the policy engine (the `rule` field). */
  rule: string;
  /** The renderer-facing preview (diff or command). */
  preview: PermissionPreview;
  /** Called when the operator picks an action (or Esc → reject). */
  onDecision: (decision: PermissionDecision) => void;
}

/**
 * The permission overlay component. Composes a header + preview + SelectList +
 * footer, and routes input to the SelectList. Renderable headlessly.
 */
export class PermissionOverlay implements Component {
  private readonly toolName: string;
  private readonly rule: string;
  private readonly preview: PermissionPreview;
  private readonly onDecision: (decision: PermissionDecision) => void;
  private readonly select: SelectList;
  /** Guards against double-fire (Enter then Esc during teardown). */
  private answered = false;

  constructor(options: PermissionOverlayOptions) {
    this.toolName = options.toolName;
    this.rule = options.rule;
    this.preview = options.preview;
    this.onDecision = options.onDecision;
    this.select = new SelectList([...APPROVAL_ITEMS], 5, {
      selectedPrefix: (t) => highlight.base(t),
      selectedText: (t) => highlight.base(t),
      description: (t) => textToken.muted(t),
      scrollInfo: (t) => textToken.muted(t),
      noMatch: (t) => textToken.muted(t),
    });
    this.select.onSelect = (item) => {
      if (this.answered) return;
      this.answered = true;
      this.onDecision(item.value as PermissionDecision);
    };
    this.select.onCancel = () => {
      if (this.answered) return;
      this.answered = true;
      this.onDecision("reject");
    };
  }

  invalidate(): void {
    this.select.invalidate();
  }

  handleInput(data: string): void {
    this.select.handleInput(data);
  }

  /** Render the overlay frame at `width` (headless-safe for golden-frame tests). */
  render(width: number): string[] {
    const lines: string[] = [];
    // Header: tool name (bold) + rule (muted).
    lines.push(`${textToken.strong(this.toolName)} ${textToken.muted(this.rule)}`);
    lines.push(textToken.muted(toolBorder("─".repeat(Math.max(1, Math.min(width, 72))))));

    // Preview — branch on kind (the engine never formats display strings).
    for (const line of renderPreview(this.preview, width)) {
      lines.push(line);
    }

    lines.push(textToken.muted(toolBorder("─".repeat(Math.max(1, Math.min(width, 72))))));
    // Actions.
    for (const line of this.select.render(width)) {
      lines.push(line);
    }
    // Footer — the canonical overlay grammar (scope §3.2 + §5).
    lines.push(renderOverlayFooter());
    return lines;
  }
}

/** Render the preview payload to coloured lines. */
function renderPreview(preview: PermissionPreview, width: number): string[] {
  const cap = Math.max(8, Math.min(width - 2, 78));
  if (preview.kind === "command") {
    return [
      `${textToken.muted("cwd  ")} ${textToken.base(preview.cwd)}`,
      `${textToken.muted("cmd  ")} ${highlight.base(preview.command)}`,
    ];
  }
  // diff: removed/added lines, token-coloured. before→removed, after→added,
  // presented as a unified-ish +/- sketch (the renderer applies the tokens).
  const lines: string[] = [];
  const beforeLines = preview.before.length === 0 ? ["(new file)"] : preview.before.split("\n");
  const afterLines = preview.after.split("\n");
  const pathLine = `${textToken.muted("file ")} ${textToken.base(preview.path)}`;
  lines.push(pathLine);
  for (const b of beforeLines) {
    lines.push(highlight.danger(truncate(`- ${b}`, cap)));
  }
  for (const a of afterLines) {
    lines.push(highlight.base(truncate(`+ ${a}`, cap)));
  }
  return lines;
}

/** Truncate a line to `max` visible chars, keeping a trailing ellipsis. */
function truncate(line: string, max: number): string {
  return line.length > max ? line.slice(0, max - 1) + "…" : line;
}

// Re-export so the surface[3] background is available if a renderer wants it.
export { surface };
