/**
 * Slash commands (scope §4 `commands.ts`) — the command surface.
 *
 * `/help /model /sessions /resume <id> /new /quit`, plus the P4b additions:
 * `/btw <text>` (side-channel clarifying question, scope §1.5) and `/undo`
 * (TUI surface over `undoLastMutation()`, scope §1.6). Each is a
 * {@link SlashCommand} for the Editor autocomplete surface. Execution is
 * routed through the controller via the composer's `onSubmit` parse path.
 *
 * The command palette (scope §1.3) reuses the same command set plus the
 * keybinding actions; {@link buildPaletteItems} composes the list.
 */

import type { SlashCommand, AutocompleteItem } from "@earendil-works/pi-tui";
import type { PaletteItem } from "./palette.js";

/** A resolved slash command + raw argument. */
export interface ResolvedCommand {
  name: string;
  argument: string;
}

/** Parse a submitted line into a slash command, or `null` if it isn't one. */
export function parseSlashCommand(line: string): ResolvedCommand | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/")) return null;
  const space = trimmed.indexOf(" ");
  const name = space === -1 ? trimmed.slice(1) : trimmed.slice(1, space);
  const argument = space === -1 ? "" : trimmed.slice(space + 1).trim();
  return { name, argument };
}

/** The P4 slash-command set, with descriptions for the autocomplete surface. */
export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands and keybindings." },
  { name: "model", description: "Show or change the active model (cycling is P4b).", argumentHint: "[model-id]" },
  { name: "sessions", description: "List local persisted sessions (.openkai/sessions)." },
  { name: "resume", description: "Resume a session by id (replays the v3 tree).", argumentHint: "<session-id>" },
  { name: "new", description: "Start a fresh session (local branch root)." },
  { name: "btw", description: "Ask a clarifying side question (answer as a system block, not a user turn).", argumentHint: "<text>" },
  { name: "fuse", description: "Run the task through the fusion panel (architect + builder → attributed synthesis).", argumentHint: "<task>" },
  { name: "welcome", description: "Re-run the first-run setup (providers, model, memory)." },
  { name: "undo", description: "Undo the last gated mutation (restore the previous shadow snapshot)." },
  { name: "quit", description: "Exit the TUI (also Ctrl+C)." },
];

/** Autocomplete items derived from the slash set (for the Editor surface). */
export function slashAutocompleteItems(): AutocompleteItem[] {
  return SLASH_COMMANDS.map((c) => ({ value: `/${c.name}`, label: c.name, description: c.description }));
}

/** The help text rendered by the `/help` command (plain lines). */
export function helpText(): string[] {
  return [
    "OpenKai TUI — commands",
    "  /help            this help",
    "  /model [id]      show / change the active model",
    "  /sessions        list local persisted sessions",
    "  /resume <id>     resume a session by id",
    "  /new             start a fresh session",
    "  /btw <text>      ask a side question (system block, not a user turn)",
    "  /fuse <task>     fusion panel: architect + builder, then attributed synthesis",
    "  /undo            undo the last gated mutation",
    "  /quit            exit (also Ctrl+C)",
    "",
    "Keybindings",
    "  Enter            submit prompt",
    "  Shift+Enter       newline",
    "  Ctrl+O           toggle thinking density (hide/reveal reasoning)",
    "  Ctrl+K           open the command palette (fuzzy)",
    "  Ctrl+S           stash / pop the prompt draft",
    "  Esc Esc          clear the draft",
    "  Ctrl+C           quit (with confirm)",
  ];
}

/**
 * Build the command-palette item set (scope §1.3): every slash command plus
 * the keybinding actions. Each item carries a which-key hint. `actions` maps
 * a palette `value` to a no-arg callback the controller wires; the bound
 * callback is attached to the item for invocation on select.
 */
export function buildPaletteItems(actions: Record<string, () => void>): PaletteItem[] {
  const items: PaletteItem[] = [
    { value: "help", label: "Help", description: "Show commands and keybindings", keys: "/help" },
    { value: "model", label: "Model", description: "Show or change the active model", keys: "/model" },
    { value: "sessions", label: "Sessions", description: "List local persisted sessions", keys: "/sessions" },
    { value: "resume", label: "Resume", description: "Resume a session by id", keys: "/resume" },
    { value: "new", label: "New session", description: "Start a fresh session", keys: "/new" },
    { value: "btw", label: "BTW", description: "Ask a side question (system block)", keys: "/btw" },
    { value: "undo", label: "Undo mutation", description: "Undo the last gated mutation", keys: "/undo" },
    { value: "quit", label: "Quit", description: "Exit the TUI", keys: "/quit" },
    { value: "toggle-thinking", label: "Toggle thinking", description: "Hide/reveal reasoning", keys: "Ctrl+O" },
    { value: "palette", label: "Command palette", description: "Open the fuzzy command palette", keys: "Ctrl+K" },
    { value: "stash", label: "Stash / pop draft", description: "Stash or pop the prompt draft", keys: "Ctrl+S" },
  ];
  for (const item of items) {
    if (actions[item.value]) {
      item.action = actions[item.value]!;
    }
  }
  return items;
}
