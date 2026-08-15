/**
 * Keymap (scope §4 `keymap.ts`) — KeybindingsManager + Esc grammar.
 *
 * Augments pi-tui's {@link Keybindings} with OpenKai-specific actions
 * (`openkai.toggleThinking`, `openkai.quit`, `openkai.openPalette`,
 * `openkai.stash`) and builds a {@link KeybindingsManager} installed as the
 * global keybinding registry so the Editor's built-in handlers resolve against
 * it. `tui.input.copy` is remapped off `ctrl+c` so Ctrl+C is free for
 * quit-with-confirm (scope §3.5). The leader-key palette (Ctrl+K, scope §1.3) is
 * intercepted at the app input-listener level (which runs before the focused
 * Editor), so it consumes Ctrl+K before the Editor's `deleteToLineEnd` would;
 * `deleteToLineEnd` is remapped to `ctrl+shift+k` to keep the capability and
 * avoid a keybinding conflict record.
 *
 * The Esc grammar (double-Esc clears the draft, scope §3.5) is detected at the
 * app input-listener level via {@link DoubleEscDetector}, which tracks rapid
 * consecutive Esc presses within a reassembly window.
 */

import {
  KeybindingsManager,
  TUI_KEYBINDINGS,
  matchesKey,
  setKeybindings,
  type KeybindingDefinitions,
  type KeybindingsConfig,
} from "@earendil-works/pi-tui";

// ── Declaration merge: OpenKai keybinding ids ──────────────────────────────
declare module "@earendil-works/pi-tui" {
  interface Keybindings {
    /** Toggle thinking density (Ctrl+O) — hide/reveal reasoning, scope §3.3. */
    "openkai.toggleThinking": true;
    /** Quit the TUI with confirm (Ctrl+C), scope §3.5. */
    "openkai.quit": true;
    /** Open the leader-key command palette (Ctrl+K), scope §1.3. */
    "openkai.openPalette": true;
    /** Stash/pop the prompt draft (Ctrl+S), scope §1.4. */
    "openkai.stash": true;
  }
}

/** OpenKai-specific keybinding definitions (merged over the pi-tui defaults). */
export const OPENKAI_KEYBINDINGS: KeybindingDefinitions = {
  ...TUI_KEYBINDINGS,
  "openkai.toggleThinking": { defaultKeys: "ctrl+o", description: "Toggle thinking density" },
  "openkai.quit": { defaultKeys: "ctrl+c", description: "Quit the TUI (with confirm)" },
  "openkai.openPalette": { defaultKeys: "ctrl+k", description: "Open the command palette" },
  "openkai.stash": { defaultKeys: "ctrl+s", description: "Stash / pop the prompt draft" },
};

/**
 * User bindings: remap `tui.input.copy` off `ctrl+c` so the Editor does not
 * swallow Ctrl+C before the quit-with-confirm handler sees it. Copy is
 * remapped to `alt+c`. `tui.editor.deleteToLineEnd` is remapped off `ctrl+k`
 * (to `ctrl+shift+k`) so Ctrl+K is free for the leader-key palette (§1.3).
 */
const OPENKAI_USER_BINDINGS: KeybindingsConfig = {
  "tui.input.copy": "alt+c",
  "tui.editor.deleteToLineEnd": "ctrl+shift+k",
};

/**
 * Build and install the OpenKai {@link KeybindingsManager} as the global
 * registry. Returns the manager so the app input listener can match against
 * the OpenKai ids. Idempotent — safe to call once per process.
 */
export function installKeymap(): KeybindingsManager {
  const manager = new KeybindingsManager(OPENKAI_KEYBINDINGS, OPENKAI_USER_BINDINGS);
  setKeybindings(manager);
  return manager;
}

/** True if `data` is the Ctrl+O toggle (matches the installed keybinding). */
export function isToggleThinking(data: string, manager: KeybindingsManager): boolean {
  return manager.matches(data, "openkai.toggleThinking");
}

/** True if `data` is the Ctrl+C quit (matches the installed keybinding). */
export function isQuit(data: string, manager: KeybindingsManager): boolean {
  return manager.matches(data, "openkai.quit");
}

/** True if `data` is the Ctrl+K palette open (matches the installed keybinding). */
export function isOpenPalette(data: string, manager: KeybindingsManager): boolean {
  return manager.matches(data, "openkai.openPalette");
}

/** True if `data` is the Ctrl+S stash/pop (matches the installed keybinding). */
export function isStash(data: string, manager: KeybindingsManager): boolean {
  return manager.matches(data, "openkai.stash");
}

/** True if `data` is a lone Escape key. */
export function isEscape(data: string): boolean {
  return matchesKey(data, "escape");
}

/**
 * Double-Esc detector (scope §3.5). Returns `true` when two Esc presses
 * arrive within `windowMs` (default 350ms). The first Esc of a pair is not
 * consumed; the second clears the draft.
 */
export class DoubleEscDetector {
  private lastEscAt = 0;
  constructor(private readonly windowMs = 350) {}

  /** Feed an input chunk; returns `true` if this completes a double-Esc. */
  feed(data: string): boolean {
    if (!isEscape(data)) {
      this.lastEscAt = 0;
      return false;
    }
    const now = Date.now();
    if (this.lastEscAt > 0 && now - this.lastEscAt <= this.windowMs) {
      this.lastEscAt = 0;
      return true;
    }
    this.lastEscAt = now;
    return false;
  }
}
