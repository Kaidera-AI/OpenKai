/**
 * Slash commands (scope §4 `commands.ts`) — the command surface.
 *
 * `/help /model /sessions /resume <id> /new /quit`. Each is a
 * {@link SlashCommand} for the Editor autocomplete surface. Execution is
 * routed through the controller via {@link CommandDispatch}: the app resolves
 * a slash command on submit and dispatches instead of prompting the model.
 */

import type { SlashCommand, AutocompleteItem } from "@earendil-works/pi-tui";

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

/** The P4a slash-command set, with descriptions for the autocomplete surface. */
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    name: "help",
    description: "Show available commands and keybindings.",
  },
  {
    name: "model",
    description: "Show or change the active model (cycling is P4b).",
    argumentHint: "[model-id]",
  },
  {
    name: "sessions",
    description: "List local persisted sessions (.openkai/sessions).",
  },
  {
    name: "resume",
    description: "Resume a session by id (replays the v3 tree).",
    argumentHint: "<session-id>",
  },
  {
    name: "new",
    description: "Start a fresh session (local branch root).",
  },
  {
    name: "quit",
    description: "Exit the TUI (also Ctrl+C).",
  },
];

/** Autocomplete items derived from the slash set (for the Editor surface). */
export function slashAutocompleteItems(): AutocompleteItem[] {
  return SLASH_COMMANDS.map((c) => ({
    value: `/${c.name}`,
    label: c.name,
    description: c.description,
  }));
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
    "  /quit            exit (also Ctrl+C)",
    "",
    "Keybindings",
    "  Enter            submit prompt",
    "  Shift+Enter       newline",
    "  Ctrl+O           toggle thinking density (hide/reveal reasoning)",
    "  Esc Esc          clear the draft",
    "  Ctrl+C           quit (with confirm)",
  ];
}