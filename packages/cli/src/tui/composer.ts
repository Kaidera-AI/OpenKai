/**
 * Composer (scope §4 `composer.ts`) — Editor wiring.
 *
 * Wraps a pi-tui {@link Editor}: Enter submits (via the Editor's built-in
 * `tui.input.submit`), `onSubmit` fires the controller; double-Esc clears the
 * draft (scope §3.5; single Esc is the first press of the pair, third-Esc
 * rewind menu is P4b). Prompt history is appended on submit (frecency is P4b).
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

  /** Submitted-prompt history (frecency ordering is P4b; here: append order). */
  get promptHistory(): readonly string[] {
    return this.history;
  }
}