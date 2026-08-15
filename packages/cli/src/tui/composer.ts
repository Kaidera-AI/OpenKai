/**
 * Composer (scope §4 `composer.ts`) — Editor wiring.
 *
 * Wraps a pi-tui {@link Editor}: Enter submits (via the Editor's built-in
 * `tui.input.submit`), `onSubmit` fires the controller. Prompt history is
 * appended on submit; frecency-ranked recall seeding is owned by the
 * controller (scope §1.4) which calls {@link Editor.addToHistory} in ranked
 * order at startup. {@link Composer.prefill} inserts a slash command prefix
 * (used by the palette's `/btw` / `/resume` actions, scope §1.3).
 */

import { Editor } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import { editorTheme } from "./theme.js";

/** Options for constructing a {@link Composer}. */
export interface ComposerOptions {
  /** Called when the user submits a non-empty prompt. */
  onSubmit: (text: string) => void;
}

/**
 * The prompt editor. The controller reads {@link Composer.text} on submit and
 * calls {@link Composer.clear} to reset the draft.
 */
export class Composer {
  readonly editor: Editor;
  private readonly onSubmitCb: (text: string) => void;
  private readonly history: string[] = [];

  constructor(tui: TUI, options: ComposerOptions) {
    this.onSubmitCb = options.onSubmit;
    const editor = new Editor(tui, editorTheme, { paddingX: 1 });
    editor.disableSubmit = false;
    editor.onSubmit = (text: string): void => {
      const trimmed = text.trim();
      if (trimmed.length === 0) return;
      this.history.push(trimmed);
      editor.addToHistory(text);
      this.onSubmitCb(trimmed);
    };
    this.editor = editor;
  }

  /** Current draft text (paste markers expanded). */
  get text(): string {
    return this.editor.getExpandedText();
  }

  /** Clear the draft (double-Esc, scope §3.5). */
  clear(): void {
    this.editor.setText("");
  }

  /** Insert text at the cursor (used by `/resume <id>` command expansion). */
  insert(text: string): void {
    this.editor.insertTextAtCursor(text);
  }

  /**
   * Replace the draft with a prefix (e.g. `/btw ` from the palette, scope §1.3)
   * so the operator types the argument and submits. Clears first so the prefix
   * is the only content.
   */
  prefill(prefix: string): void {
    this.editor.setText(prefix);
  }

  /** Submitted-prompt history (frecency ordering is P4b; here: append order). */
  get promptHistory(): readonly string[] {
    return this.history;
  }
}
