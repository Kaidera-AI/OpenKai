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

import { CombinedAutocompleteProvider, Editor } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
import { editorTheme } from "./theme.js";
import { SLASH_COMMANDS } from "./commands.js";
import { atomicTokenAt, decodePastedChunk } from "./paste.js";

/**
 * The composer editor (E017 dossier picks 4+5): the vendored pi-tui Editor
 * with two interceptions in `handleInput`, both pure helpers from paste.ts.
 *
 *  1. **Bracketed-paste decode** — tmux/kitty re-encoded control bytes (BOTH
 *     the csi-u and xterm formats) are decoded and paste spans NFC-normalised
 *     BEFORE the editor's own control-strip sees them (the vendored editor
 *     decodes only csi-u; an undecoded xterm sequence leaks its printable
 *     tail into the buffer).
 *  2. **Atomic-token backspace** — a paste marker deletes as one unit. The
 *     vendored editor handles a REGISTERED marker atomically (its segmenter
 *     merges it, cursor included) — that path is delegated untouched. The
 *     case it misses is an UNREGISTERED marker (a restored draft: `setText`
 *     leaves the paste registry empty, so the cursor CAN sit inside the
 *     marker and one backspace would eat a single character, leaving a
 *     half-eaten marker as stray text). Intercepted here: step to the
 *     marker's start and forward-delete the whole span. Markers are pure
 *     ASCII, so span length == grapheme count for the unmerged case.
 */
class ComposerEditor extends Editor {
  override handleInput(data: string): void {
    if (data === "\x7f") {
      const { line: lineIndex, col } = this.getCursor();
      const line = this.getLines()[lineIndex] ?? "";
      const token = atomicTokenAt(line, col - 1);
      if (token !== undefined && col < token.end) {
        // Cursor strictly INSIDE the marker — only possible when the marker
        // is unregistered (registered markers merge into one segment the
        // cursor can't enter). Walk to the token start, then forward-delete
        // the whole span; the registry has no entry to clean up.
        for (let i = col; i > token.start; i -= 1) super.handleInput("\x1b[D");
        for (let i = token.start; i < token.end; i += 1) super.handleInput("\x1b[3~");
        return;
      }
      // Cursor at the marker's end (or no marker): the vendored atomic path
      // (registry cleanup + renumbering) or plain grapheme delete.
      super.handleInput("\x7f");
      return;
    }
    super.handleInput(decodePastedChunk(data));
  }
}

/** Options for constructing a {@link Composer}. */
export interface ComposerOptions {
  /** Called when the user submits a non-empty prompt. */
  onSubmit: (text: string) => void;
  /** Working directory for `@` file completion (defaults to cwd). */
  cwd?: string;
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
    const editor = new ComposerEditor(tui, editorTheme, { paddingX: 1 });
    editor.disableSubmit = false;
    // Discoverability: typing `/` opens the command autocomplete (and `@`
    // completes files) — the operator should never need to know the set in
    // advance.
    editor.setAutocompleteProvider(
      new CombinedAutocompleteProvider(SLASH_COMMANDS, options.cwd ?? process.cwd()),
    );
    editor.onSubmit = (text: string): void => {
      let trimmed = text.trim();
      if (trimmed.length === 0) return;
      // omp's `.` shortcut: a lone dot means "keep going".
      if (trimmed === ".") trimmed = "keep going";
      this.history.push(trimmed);
      editor.addToHistory(trimmed);
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
