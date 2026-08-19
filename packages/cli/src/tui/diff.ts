/**
 * `/diff` overlay (E017 S1 — ren's TUI research: the missing diff viewer).
 *
 * A scrollable, read-only view of the unified diff between the latest
 * shadow-git snapshot and the work tree (the seam is
 * {@link ShadowGit.diff} — the TUI never shells out itself). Every line is
 * sanitised at construction: diff content is file content, which is
 * tool/model-sourced and hostile to the terminal (E001 §2 — the same
 * boundary every render path holds).
 *
 * E017 dossier pick 3 (omp's `renderDiff` port): `-`/`+` runs are paired and
 * inverse-highlighted at WORD level (pure-JS token LCS — no `diff` package),
 * the gutter pins at ≥3 digits so streamed rows stay byte-identical across
 * the 100-line crossing, and a gutter identical to the previous row's is
 * blanked. Multi-line change runs fall back to whole-line tint.
 *
 * Interaction grammar is the canonical one (scope §3.2): ↑/↓ scroll,
 * PageUp/PageDown page, Home/End jump, Esc/q close — the footer says so.
 * All colour comes from theme tokens; ad-hoc literals are a defect.
 */

import { matchesKey } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { highlight, opaquePanel, renderOverlayFooter, text as textToken } from "./theme.js";
import { sanitizeTerminalText } from "./sanitize.js";

/**
 * Tint one diff line with the theme tokens (pure — exported for tests).
 * Deletions read in the danger accent, additions in the base highlight,
 * hunk headers in the attention accent, file headers strong; everything
 * else is plain text. No literals — the tokens are the only colour source.
 *
 * Whole-line tint is renderDiff's fallback for change runs that aren't a
 * single `-`/`+` pair; it also stays the per-line export existing callers
 * (and tests) use directly.
 */
export function tintDiffLine(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return textToken.strong(line);
  if (line.startsWith("+")) return highlight.base(line);
  if (line.startsWith("-")) return highlight.danger(line);
  if (line.startsWith("@@")) return highlight.attention(line);
  if (line.startsWith("diff ") || line.startsWith("index ")) return textToken.muted(line);
  return textToken.base(line);
}

/** Inverse-video wrap (omp's `theme.inverse` → raw SGR; preserves the fg tint). */
function inverse(text: string): string {
  return `\x1b[7m${text}\x1b[27m`;
}

/** One token of the word diff: a whitespace run, a word, or a punctuation run. */
function tokenizeWords(text: string): string[] {
  return text.match(/\s+|\w+|[^\s\w]+/g) ?? [];
}

interface WordPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/**
 * Pure-JS word diff with jsdiff `diffWords` semantics (dossier pick 3 — the
 * `diff` package is NOT guaranteed present, so this is the substitute):
 * tokenise both lines, LCS the token streams, emit equal/removed/added
 * parts. Lines are diff-body short; past a cell cap the LCS degrades to
 * "common prefix/suffix equal, middle changed" — never wrong, just coarser.
 */
export function diffWordsPure(oldText: string, newText: string): WordPart[] {
  const a = tokenizeWords(oldText);
  const b = tokenizeWords(newText);
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ value: b.join(""), added: true }];
  if (b.length === 0) return [{ value: a.join(""), removed: true }];

  // Cell cap: a pathological line pair falls back to prefix/suffix trim.
  if (a.length * b.length > 25_000) {
    let pre = 0;
    while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre += 1;
    let suf = 0;
    while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf += 1;
    const parts: WordPart[] = [];
    if (pre > 0) parts.push({ value: a.slice(0, pre).join("") });
    const removed = a.slice(pre, a.length - suf).join("");
    const added = b.slice(pre, b.length - suf).join("");
    if (removed) parts.push({ value: removed, removed: true });
    if (added) parts.push({ value: added, added: true });
    if (suf > 0) parts.push({ value: a.slice(a.length - suf).join("") });
    return parts;
  }

  // LCS table over tokens (rows = a, cols = b).
  const rows = a.length;
  const cols = b.length;
  const table: Uint32Array = new Uint32Array((rows + 1) * (cols + 1));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i * (cols + 1) + j] =
        a[i] === b[j]
          ? table[(i + 1) * (cols + 1) + j + 1]! + 1
          : Math.max(table[(i + 1) * (cols + 1) + j]!, table[i * (cols + 1) + j + 1]!);
    }
  }

  // Walk the table, coalescing runs of the same part kind.
  const parts: WordPart[] = [];
  const push = (value: string, kind: "equal" | "added" | "removed"): void => {
    if (value.length === 0) return;
    const last = parts[parts.length - 1];
    const same =
      last !== undefined &&
      (kind === "equal" ? !last.added && !last.removed : kind === "added" ? last.added === true : last.removed === true);
    if (same) last.value += value;
    else parts.push({ value, added: kind === "added" || undefined, removed: kind === "removed" || undefined });
  };
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      push(a[i]!, "equal");
      i += 1;
      j += 1;
    } else if (table[(i + 1) * (cols + 1) + j]! >= table[i * (cols + 1) + j + 1]!) {
      push(a[i]!, "removed");
      i += 1;
    } else {
      push(b[j]!, "added");
      j += 1;
    }
  }
  while (i < rows) push(a[i++]!, "removed");
  while (j < cols) push(b[j++]!, "added");
  return parts;
}

/**
 * Word-level intra-line diff of one `-`/`+` pair (omp's renderIntraLineDiff
 * port): only the changed words get the inverse highlight; the leading
 * whitespace of the first changed part stays flat so the indentation doesn't
 * shout. Returned WITHOUT the `-`/`+` sigil and WITHOUT the line tint.
 */
export function renderIntraLineDiff(oldContent: string, newContent: string): { removedLine: string; addedLine: string } {
  const wordDiff = diffWordsPure(oldContent, newContent);
  let removedLine = "";
  let addedLine = "";
  let isFirstRemoved = true;
  let isFirstAdded = true;
  for (const part of wordDiff) {
    if (part.removed) {
      let value = part.value;
      if (isFirstRemoved) {
        // don't inverse the indentation
        const leadingWs = value.match(/^(\s*)/)?.[1] ?? "";
        value = value.slice(leadingWs.length);
        removedLine += leadingWs;
        isFirstRemoved = false;
      }
      if (value) removedLine += inverse(value);
    } else if (part.added) {
      let value = part.value;
      if (isFirstAdded) {
        const leadingWs = value.match(/^(\s*)/)?.[1] ?? "";
        value = value.slice(leadingWs.length);
        addedLine += leadingWs;
        isFirstAdded = false;
      }
      if (value) addedLine += inverse(value);
    } else {
      removedLine += part.value;
      addedLine += part.value;
    }
  }
  return { removedLine, addedLine };
}

/** One parsed diff row (the hunk parser's output). */
interface DiffRow {
  kind: "file" | "hunk" | "del" | "add" | "context" | "other";
  /** Line content WITHOUT the sigil for del/add rows; whole line otherwise. */
  text: string;
  oldNum?: number;
  newNum?: number;
}

/** Parse unified-diff lines into rows, tracking old/new line numbers per hunk. */
function parseDiffRows(lines: string[]): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  for (const line of lines) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      rows.push({ kind: "hunk", text: line });
      continue;
    }
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      rows.push({ kind: "file", text: line });
      continue;
    }
    if (line.startsWith("-")) {
      rows.push({ kind: "del", text: line.slice(1), oldNum: oldLine });
      oldLine += 1;
      continue;
    }
    if (line.startsWith("+")) {
      rows.push({ kind: "add", text: line.slice(1), newNum: newLine });
      newLine += 1;
      continue;
    }
    if (line.startsWith(" ") || line === "") {
      rows.push({ kind: "context", text: line.startsWith(" ") ? line.slice(1) : line, oldNum: oldLine, newNum: newLine });
      oldLine += 1;
      newLine += 1;
      continue;
    }
    rows.push({ kind: "other", text: line });
  }
  return rows;
}

/**
 * Render a unified diff (omp's renderDiff port — dossier pick 3): paired
 * `-`/`+` runs get word-level inverse highlights, the gutter pins at ≥3
 * digits per side (stable across the 100-line crossing), and a gutter
 * identical to the previous row's is blanked. Input lines MUST already be
 * sanitised (the overlay constructor does this).
 */
export function renderDiff(lines: string[]): string[] {
  const rows = parseDiffRows(lines);

  // Pair single -/+ runs: a change run with exactly one del and one add gets
  // the intra-line treatment; anything larger keeps whole-line tint.
  const intra = new Map<number, { removedLine: string; addedLine: string }>();
  let runStart = -1;
  const flushRun = (end: number): void => {
    if (runStart < 0) return;
    const run = rows.slice(runStart, end);
    if (run.length === 2 && run[0]!.kind === "del" && run[1]!.kind === "add") {
      const pair = renderIntraLineDiff(run[0]!.text, run[1]!.text);
      intra.set(runStart, pair);
      intra.set(runStart + 1, pair);
    }
    runStart = -1;
  };
  for (let i = 0; i < rows.length; i += 1) {
    const kind = rows[i]!.kind;
    if (kind === "del" || kind === "add") {
      if (runStart < 0) runStart = i;
    } else {
      flushRun(i);
    }
  }
  flushRun(rows.length);

  // Stable gutter: reserve ≥3 digits so a streamed re-render never re-pads
  // already-rendered rows at the 100-line crossing (omp's lineNumberWidth).
  let width = 3;
  for (const row of rows) {
    width = Math.max(width, String(row.oldNum ?? 0).length, String(row.newNum ?? 0).length);
  }

  const out: string[] = [];
  let prevGutter = "";
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    // One number column: the row's own line (old for `-`, new for `+` and
    // context). A `-`/`+` replacement pair then carries the SAME number on
    // both rows — the repeat blanks so the eye groups the pair (omp's
    // dup-gutter blanking).
    const num = row.kind === "del" ? row.oldNum : (row.newNum ?? row.oldNum);
    const gutterRaw = num !== undefined ? `${String(num).padStart(width)} │ ` : "";
    const gutter = gutterRaw !== "" && gutterRaw === prevGutter ? " ".repeat(gutterRaw.length) : gutterRaw;
    if (gutterRaw !== "") prevGutter = gutterRaw;
    const pair = intra.get(i);
    switch (row.kind) {
      case "del":
        out.push(gutter + highlight.danger(`-${pair ? pair.removedLine : row.text}`));
        break;
      case "add":
        out.push(gutter + highlight.base(`+${pair ? pair.addedLine : row.text}`));
        break;
      case "hunk":
        out.push(highlight.attention(row.text));
        break;
      case "file":
        out.push(row.text.startsWith("diff ") || row.text.startsWith("index ") ? textToken.muted(row.text) : textToken.strong(row.text));
        break;
      case "context":
        out.push(gutter + textToken.base(` ${row.text}`));
        break;
      default:
        out.push(textToken.base(row.text));
        break;
    }
  }
  return out;
}

export class DiffOverlay implements Component {
  /** Pre-rendered diff rows (sanitised raw lines → renderDiff at construction). */
  private readonly lines: string[];
  private offset = 0;
  /** Body rows shown per render — sized by the controller from the terminal. */
  private readonly viewHeight: number;

  constructor(
    private readonly title: string,
    lines: string[],
    private readonly onClose: () => void,
    viewHeight = 12,
  ) {
    this.lines = renderDiff(lines.map((line) => sanitizeTerminalText(line)));
    this.viewHeight = Math.max(3, viewHeight);
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || data === "q") {
      this.onClose();
      return;
    }
    if (matchesKey(data, "up")) this.scrollBy(-1);
    else if (matchesKey(data, "down")) this.scrollBy(1);
    else if (matchesKey(data, "pageUp")) this.scrollBy(-this.viewHeight);
    else if (matchesKey(data, "pageDown")) this.scrollBy(this.viewHeight);
    else if (matchesKey(data, "home")) this.offset = 0;
    else if (matchesKey(data, "end")) this.offset = Math.max(0, this.lines.length - this.viewHeight);
  }

  /** Current scroll offset (test accessor). */
  get scrollOffset(): number {
    return this.offset;
  }

  /** Total line count (test accessor). */
  get lineCount(): number {
    return this.lines.length;
  }

  private scrollBy(delta: number): void {
    const maxOffset = Math.max(0, this.lines.length - this.viewHeight);
    this.offset = Math.min(maxOffset, Math.max(0, this.offset + delta));
  }

  render(width: number): string[] {
    const visible = this.lines.slice(this.offset, this.offset + this.viewHeight);
    const position =
      this.lines.length > this.viewHeight
        ? ` ${textToken.dim(`lines ${this.offset + 1}–${Math.min(this.offset + this.viewHeight, this.lines.length)} of ${this.lines.length}`)}`
        : ` ${textToken.dim(`${this.lines.length} line${this.lines.length === 1 ? "" : "s"}`)}`;
    return opaquePanel(
      [
        ` ${highlight.base(this.title)} ${textToken.dim("— read-only")}`,
        "",
        ...visible.map((line) => ` ${line}`),
        "",
        position,
        ` ${textToken.dim(renderOverlayFooter())}`,
      ],
      width,
    );
  }

  invalidate(): void {
    // Stateless render — nothing cached to invalidate.
  }
}
