/**
 * Keymap (scope §4 `keymap.ts`) — KeybindingsManager + Esc grammar.
 *
 * Augments pi-tui's {@link Keybindings} with OpenKai-specific actions
 * (`openkai.toggleThinking`, `openkai.quit`) and builds a
 * {@link KeybindingsManager} installed as the global keybinding registry so
 * the Editor's built-in handlers resolve against it. `tui.input.copy` is
 * remapped off `ctrl+c` so Ctrl+C is free for quit-with-confirm (scope §3).
 *
 * The Esc grammar (double-Esc clears the draft, scope §3.5) is detected at the
 * app input-listener level via {@link detectDoubleEsc}, which tracks rapid
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
  }
}

/** OpenKai-specific keybinding definitions (merged over the pi-tui defaults). */
export const OPENKAI_KEYBINDINGS: KeybindingDefinitions = {
  ...TUI_KEYBINDINGS,
  "openkai.toggleThinking": { defaultKeys: "ctrl+o", description: "Toggle thinking density" },
  "openkai.quit": { defaultKeys: "ctrl+c", description: "Quit the TUI (with confirm)" },
};

/**
 * User bindings: remap `tui.input.copy` off `ctrl+c` so the Editor does not
 * swallow Ctrl+C before the quit-with-confirm handler sees it. Copy is
 * remapped to `alt+c` (rarely typed mid-edit) so the capability is preserved.
 */
const OPENKAI_USER_BINDINGS: KeybindingsConfig = {
  "tui.input.copy": "alt+c",
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

/** True if `data` is a lone Escape key. */
export function isEscape(data: string): boolean {
  return matchesKey(data, "escape");
}

/**
 * Double-Esc detector (scope §3.5). Returns `true` when two Esc presses
 * arrive within `windowMs` (default 350ms — wider than pi-tui's escape
 * reassembly window so a slow terminal still pairs them). The first Esc of a
 * pair is not consumed; the second clears the draft.
 */
export class DoubleEscDetector {
  private lastEscAt = 0;
  constructor(private readonly windowMs = 350) {}

  /** Feed an input chunk; returns `true` if this completes a double-Esc. */
  feed(data: string): boolean {
    if (!isEscape(data)) {
      // Any non-Esc input resets the pairing window.
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