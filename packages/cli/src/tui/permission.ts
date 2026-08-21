/**
 * Permission overlay (P4b scope §5) — the approval surface for a
 * `permission_request` event.
 *
 * Shown via `tui.showOverlay(...)` when the controller receives a
 * `permission_request`. Renders the tool name + rule, a diff/command preview,
 * a four-item {@link SelectList} (`Allow once` / `Always (session)` /
 * `Always (this project)` / `Reject`), and the canonical overlay footer
 * (scope §3.2 + §5: identical footer grammar to every other overlay — ad-hoc
 * literals are a review defect). The project-scoped always stop persists
 * `tools.approval.<tool> = "allow"` to config.json (E017 pick 7) and emits a
 * plain `always` to the controller, so `transport.respond` is untouched.
 *
 * **All colour comes from theme.ts** — removed diff lines use
 * `highlight.danger` (red), added lines use `highlight.base` (Kaidera mint);
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
import { writeToolApproval } from "../config.js";
import { sanitizeTerminalText } from "./sanitize.js";
import { highlight, renderOverlayFooter, surface, text as textToken, toolBorder } from "./theme.js";

/**
 * Every string on this overlay is model-supplied (tool name, bash command,
 * diff path/body) and this is the ONE surface that must never be spoofable:
 * ADR §5.6 makes the permission engine *the* control, so an overlay whose
 * text the model drives removes it — CSI 2J blanks the frame, SGR forges the
 * approval chrome (E001 finding F6b). `sanitizeTerminalText` strips the
 * controls; `oneLine` additionally flattens newlines for the fields rendered
 * as a single line, so a payload cannot fabricate an extra line of chrome
 * inside the frame. The diff body keeps its newlines — it is rendered as
 * multiple lines by design.
 */
function oneLine(value: string): string {
  return sanitizeTerminalText(value).replace(/\n/g, " ");
}

/**
 * The approval decision the overlay emits to the controller. Both always
 * stops emit `always` — the project-scoped stop additionally persists
 * `tools.approval.<tool> = "allow"` itself, so the controller/gate contract
 * (`transport.respond`) is unchanged.
 */
export type PermissionDecision = "once" | "always" | "reject";

/**
 * The approval actions surfaced as a SelectList (E017 pick 7: the single
 * `always` of P4b splits into two stops — session-scoped cache vs the
 * persisted per-tool policy key).
 */
const APPROVAL_ITEMS: SelectItem[] = [
  { value: "once", label: "Allow once", description: "approve this call only" },
  { value: "always", label: "Always (session)", description: "approve identical calls this session" },
  { value: "always-project", label: "Always (this project)", description: "persist tools.approval.<tool> = allow in config.json" },
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
    this.toolName = oneLine(options.toolName);
    this.rule = oneLine(options.rule);
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
      if (item.value === "always-project") {
        // Persist the per-tool override (the RAW tool name is the config key —
        // the sanitised display copy must never leak into storage), then emit
        // the plain session `always` so the gate caches this call signature
        // too. The gate re-reads the policy map live, so the key applies from
        // the next request onward.
        writeToolApproval(options.toolName, "allow");
        this.onDecision("always");
        return;
      }
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
      `${textToken.muted("cwd  ")} ${textToken.base(oneLine(preview.cwd))}`,
      `${textToken.muted("cmd  ")} ${highlight.base(oneLine(preview.command))}`,
    ];
  }
  // diff: removed/added lines, token-coloured. before→removed, after→added,
  // presented as a unified-ish +/- sketch (the renderer applies the tokens).
  const lines: string[] = [];
  const beforeLines =
    preview.before.length === 0 ? ["(new file)"] : sanitizeTerminalText(preview.before).split("\n");
  const afterLines = sanitizeTerminalText(preview.after).split("\n");
  const pathLine = `${textToken.muted("file ")} ${textToken.base(oneLine(preview.path))}`;
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
