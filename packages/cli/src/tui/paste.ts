/**
 * Bracketed-paste decode + atomic-token helpers (E017 dossier picks 4+5).
 *
 * tmux under kitty re-encodes control bytes inside bracketed pastes as
 * key-event escapes (Ctrl+J → `ESC[106;5u` or `ESC[27;5;106~`). Undecoded,
 * the ESC is stripped downstream and the literal `[106;5u` leaks into the
 * buffer. Our vendored pi-tui editor decodes only the csi-u variant inside
 * `handlePaste`; this module runs BOTH decodes plus NFC normalisation
 * upstream of the editor (fixes macOS NFD drag-drop cursor drift).
 *
 * {@link atomicTokenAt} backs the composer's atomic-token backspace: paste
 * markers (`[paste #N, +M lines]`) delete as one unit — one keypress never
 * leaves a half-eaten marker as stray text. The vendored editor already
 * handles the cursor-at-marker-end case (with registry cleanup); the
 * composer interception covers the cursor-INSIDE-marker case it misses.
 *
 * Zero dependencies; pure string transforms.
 */

// Both regexes verbatim from omp's bracketed-paste.ts (dossier pick 4).
const REENCODED_CTRL_CSI_U = /\x1b\[(\d+);5u/g;
const REENCODED_CTRL_XTERM = /\x1b\[27;5;(\d+)~/g;

function decodeReencodedCtrlByte(match: string, code: string): string {
  const cp = Number(code);
  if (cp >= 97 && cp <= 122) return String.fromCharCode(cp - 96); // a-z → Ctrl+A..Z
  if (cp >= 65 && cp <= 90) return String.fromCharCode(cp - 64); // A-Z → Ctrl+A..Z
  return match;
}

/**
 * Decode tmux/kitty re-encoded control bytes back to their literal byte.
 * MUST run before any control-character stripping so newlines/tabs survive
 * instead of leaking the printable escape tail into the buffer.
 */
export function decodeReencodedPasteControls(text: string): string {
  return text
    .replace(REENCODED_CTRL_CSI_U, decodeReencodedCtrlByte)
    .replace(REENCODED_CTRL_XTERM, decodeReencodedCtrlByte);
}

/**
 * Full pasted-text sanitiser: control-byte decode (both formats) + NFC
 * normalisation (macOS drag-drop hands us NFD paths; NFC keeps the editor's
 * cursor math honest). Line-ending normalisation + tab expansion stay with
 * the vendored editor's own `normalizeText`.
 */
export function sanitizePastedText(text: string): string {
  return decodeReencodedPasteControls(text).normalize("NFC");
}

/**
 * Transform one raw input chunk before the editor sees it: every COMPLETE
 * bracketed-paste span (`ESC[200~ … ESC[201~`) gets its content sanitised.
 * Both control-byte decodes also run on the whole chunk (they only match
 * escape sequences tmux emits inside pastes — inert on ordinary input),
 * which covers a paste span split across chunks. NFC applies to complete
 * spans only, so live IME composition is never re-normalised mid-keystroke.
 */
export function decodePastedChunk(data: string): string {
  const decoded = decodeReencodedPasteControls(data);
  return decoded.replace(/\x1b\[200~([\s\S]*?)\x1b\[201~/g, (_m, content: string) => {
    return `\x1b[200~${content.normalize("NFC")}\x1b[201~`;
  });
}

/**
 * The atomic-token pattern: pi-tui's paste markers. Matches the vendored
 * editor's own marker format (`editor.js` PASTE_MARKER_REGEX) so one marker
 * is one opaque unit.
 */
export const PASTE_TOKEN_PATTERN = /\[paste #\d+( (?:\+\d+ lines|\d+ chars))?\]/g;

/**
 * Find an atomic token on `line` whose span CONTAINS column `col`
 * (port of omp's editor `#atomicTokenAt`). Returns the token's span, or
 * undefined when the column is not inside any token. Pure — the composer
 * decides what a hit means (backspace expands over the token).
 */
export function atomicTokenAt(
  line: string,
  col: number,
  pattern: RegExp = PASTE_TOKEN_PATTERN,
): { start: number; end: number } | undefined {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  for (;;) {
    const match = re.exec(line);
    if (match === null) break;
    if (match[0].length === 0) {
      re.lastIndex = match.index + 1;
      continue;
    }
    const start = match.index;
    const end = start + match[0].length;
    if (col < start) break;
    if (col < end) return { start, end };
  }
  return undefined;
}
