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

import { CombinedAutocompleteProvider, CURSOR_MARKER, Editor, visibleWidth } from "@earendil-works/pi-tui";
import type { TUI } from "@earendil-works/pi-tui";
// Deep import (pi-tui has no exports map, so subpaths resolve): the editor's
// own word-wrap — the click mapping must replay the exact wrap the render used.
import { wordWrapLine } from "@earendil-works/pi-tui/dist/components/editor.js";
import { editorTheme } from "./theme.js";
import { SLASH_COMMANDS } from "./commands.js";
import { atomicTokenAt, decodePastedChunk } from "./paste.js";
import { mightContainMagicKeyword, paintMagicKeywords, shimmerPhase } from "./magic-keywords.js";
import { capabilities, renderTerminalText } from "./capabilities.js";
import { clampColumns, resolveLayout } from "./layout.js";

/** Keep both borders and the cursor-bearing content rows inside the cap. */
export function clampComposerRows(lines: string[], maxRows: number): string[] {
  if (lines.length <= maxRows || lines.length < 3) return lines;
  const innerRows = Math.max(1, maxRows - 2);
  const content = lines.slice(1, -1);
  const cursorIndex = content.findIndex((line) => line.includes(CURSOR_MARKER));
  const anchor = cursorIndex === -1 ? content.length - 1 : cursorIndex;
  const start = Math.min(Math.max(0, anchor - innerRows + 1), Math.max(0, content.length - innerRows));
  return [lines[0]!, ...content.slice(start, start + innerRows), lines[lines.length - 1]!];
}

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
  /**
   * Magic-keyword shimmer (E017 UK round 4): standalone `ultrathink` /
   * `ultrareview` paint with the animated rainbow gradient. The painter adds
   * zero-width SGR only, so layout/visible width are untouched; the same
   * prose masking as detection applies, so keywords inside code spans or
   * XML never paint. The repaint clock lives in {@link Composer}.
   */
  override render(width: number): string[] {
    const lines = super.render(width);
    const painted = mightContainMagicKeyword(this.getExpandedText())
      ? lines.map((line) => paintMagicKeywords(line, shimmerPhase()))
      : lines;
    const terminal = (this as unknown as { tui: { terminal: { columns: number; rows: number } } }).tui.terminal;
    return clampComposerRows(painted, resolveLayout(terminal.columns, terminal.rows).composerMaxRows)
      .map(renderTerminalText);
  }

  /**
   * Click-to-cursor (E019 inc 03): position the cursor at a clicked CONTENT
   * point (0-based row within the rendered content area, 0-based grapheme
   * column within that row). The visual→logical mapping replays the exact
   * wrap the editor rendered, so clicks land where the operator pointed —
   * Claude Code's grammar.
   */
  positionCursorAt(row: number, col: number): void {
    // Vendored-private access (E019): pi-tui's Editor exposes getCursor but
    // no setter; the state shape below is the editor's own, used nowhere
    // else in OpenKai.
    const internals = this as unknown as {
      state: { lines: string[]; cursorLine: number; cursorCol: number };
      setCursorCol(col: number): void;
    };
    const width = this.lastRenderedContentWidth();
    // The wrap must be EXACT: replay the editor's own wordWrapLine (same
    // function, same width) so chunk startIndex/endIndex land in the editor's
    // code-unit coordinates. The earlier render-row replay drifted on
    // space-heavy wraps (AdvMouse review) and read overlay/border rows.
    const layoutWidth = Math.max(1, width - 2); // paddingX=1 both sides
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const gLen = (s: string): number => [...seg.segment(s)].length;
    // Clicked terminal cells → graphemes within a chunk (a click inside a
    // wide glyph targets its start); chunk offsets are UTF-16 code units —
    // convert explicitly (emoji/CJK rows differ).
    const cellsToGraphemes = (rowText: string, cells: number): number => {
      let cellsSeen = 0;
      let count = 0;
      for (const g of seg.segment(rowText)) {
        const w = Math.max(1, visibleWidth(g.segment));
        if (cellsSeen + w > cells) break;
        cellsSeen += w;
        count += 1;
      }
      return count;
    };
    const graphemesToUnits = (text: string, count: number): number => {
      let units = 0;
      let seen = 0;
      for (const g of seg.segment(text)) {
        if (seen >= count) break;
        units += g.segment.length;
        seen += 1;
      }
      return units;
    };

    const lines = internals.state.lines;
    let visualRow = 0;
    let logical = 0;
    let targetCol = 0;
    let resolved = false;
    while (logical < lines.length && !resolved) {
      const line = lines[logical] ?? "";
      const chunks = gLen(line) <= layoutWidth ? [{ text: line, startIndex: 0, endIndex: line.length }] : wordWrapLine(line, layoutWidth);
      for (const chunk of chunks) {
        if (visualRow === row) {
          targetCol = chunk.startIndex + graphemesToUnits(chunk.text, cellsToGraphemes(chunk.text, col));
          resolved = true;
          break;
        }
        visualRow += 1;
      }
      if (!resolved) logical += 1;
    }
    if (!resolved) {
      // Past the end: cursor to the document end (click below the text).
      logical = Math.max(0, lines.length - 1);
      targetCol = (lines[logical] ?? "").length;
    }
    internals.state.cursorLine = logical;
    internals.setCursorCol(targetCol);
    this.invalidate();
  }

  /** The width the editor last rendered at (defaults sanely pre-render). */
  private lastRenderedContentWidth(): number {
    const terminal = (this as unknown as { tui: { terminal: { columns: number } } }).tui.terminal;
    return clampColumns(terminal.columns);
  }

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

    // The shimmer clock: repaint while a magic keyword is visible so the
    // gradient moves. Probe is a substring check — cheap; the timer is
    // unref'd and never blocks exit.
    this.shimmerTimer = setInterval(() => {
      if (capabilities().reducedMotion) return;
      if (mightContainMagicKeyword(this.editor.getExpandedText())) {
        tui.requestRender();
      }
    }, 120);
    this.shimmerTimer.unref();
  }

  private readonly shimmerTimer: NodeJS.Timeout;

  /** Tear down the shimmer clock (E019 KW-02: an orphaned interval per
   *  /new /resume restart pinned the old editor+TUI forever). */
  dispose(): void {
    clearInterval(this.shimmerTimer);
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

  /** Click-to-cursor geometry (E019 inc 03): rendered height + padding. */
  composerGeometry(): { height: number; paddingX: number } {
    const terminal = (this.editor as unknown as { tui: { terminal: { columns: number } } }).tui.terminal;
    return { height: this.editor.render(clampColumns(terminal.columns)).length, paddingX: 1 };
  }

  /** Position the text cursor at a clicked content point. */
  positionCursorAt(row: number, col: number): void {
    (this.editor as ComposerEditor).positionCursorAt(row, col);
  }
}
