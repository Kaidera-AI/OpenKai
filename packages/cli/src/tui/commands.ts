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
  { name: "models", description: "Fullscreen model hub: recent / all / per-provider scopes with context + cost." },
  { name: "sessions", description: "List local persisted sessions (.openkai/sessions)." },
  { name: "resume", description: "Resume a session — bare /resume opens the searchable picker.", argumentHint: "[session-id]" },
  { name: "rename", description: "Rename this session (top bar, /sessions, /resume search, exports).", argumentHint: "<display-name>" },
  { name: "export", description: "Export this session as a self-contained HTML transcript.", argumentHint: "[path]" },
  { name: "new", description: "Start a fresh session (local branch root)." },
  { name: "btw", description: "Ask a clarifying side question (answer as a system block, not a user turn).", argumentHint: "<text>" },
  { name: "fuse", description: "Fusion panel — bare /fuse asks what to fuse.", argumentHint: "[task]" },
  { name: "retry", description: "Re-run the last prompt (optionally on another model).", argumentHint: "[model-id]" },
  { name: "fork", description: "Fork from a past message (picker) — rewind the session to any earlier prompt." },
  { name: "tree", description: "Show the session tree (branches by fork links)." },
  { name: "autonomy", description: "Pick the autonomy level (off/low/med/high) — how much runs without asking.", argumentHint: "[level]" },
  { name: "plan", description: "Toggle plan mode — read-only; mutations refused at the gate (Cline)." },
  { name: "goal", description: "Set, show, pause, resume, done, or drop the session goal.", argumentHint: "[text|pause|resume|done|drop]" },
  { name: "setup", description: "Open the onboarding panel (provider sign-in, model). Never exits." },
  { name: "settings", description: "Open the configuration panel (appearance, status line, memory, features)." },
  { name: "init", description: "Generate a starter AGENTS.md for this project (never overwrites)." },
  { name: "memory", description: "Project memory: init the shared .openkai/memory structure, show status, or record a learning.", argumentHint: "add <learning>" },
  { name: "clear", description: "Clear the transcript display (the conversation history is untouched)." },
  { name: "copy", description: "Copy the last code block to the clipboard (or /copy cmd for the last command).", argumentHint: "[code|cmd]" },
  { name: "stats", description: "Show session stats: block counts, model, tokens, fusion partner." },
  { name: "context", description: "Show token usage for this session." },
  { name: "login", description: "Sign in to a provider (opens the onboarding panel)." },
  { name: "compact", description: "Compact the conversation context (model-written summary + retained tail; incremental)." },
  { name: "shake", description: "Strip heavy tool results from context to reclaim tokens (omp's /shake elide)." },
  { name: "undo", description: "Undo the last gated mutation (restore the previous shadow snapshot)." },
  { name: "shift", description: "Session routing ledger — recent tier decisions with stage, source, reason (OK-9.7)." },
  { name: "diff", description: "Diff the latest shadow snapshot against the work tree (scrollable overlay)." },
  { name: "exit", description: "Exit the TUI (also Ctrl+C)." },
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
    "  /model [id]      show / change the active model (context + cost per model)",
    "  /sessions        list local persisted sessions",
    "  /resume [id]     resume a session — bare /resume opens the searchable picker",
    "  /rename <text>   rename this session (top bar, /sessions, /resume search)",
    "  /export [path]   export this session as a self-contained HTML transcript",
    "  /new             start a fresh session",
    "  /btw <text>      ask a side question (system block, not a user turn)",
    "  /fuse [task]     fusion panel — bare /fuse asks what to fuse",
    "  /fork            fork from a past message (picker = rewind to any prompt)",
    "  /tree            show the session tree",
    "  /retry [id]      re-run the last prompt (optionally on another model)",
    "  /init            generate a starter AGENTS.md (never overwrites)",
    "  /memory [add ..] project memory: status, or record a shared learning",
    "  /setup           onboarding panel (sign in to providers, pick a model)",
    "  /settings        config panel (appearance, status line, memory, features)",
    "  /login           sign in to a provider (same as /setup)",
    "  /logout <prov>   sign out of an OAuth provider",
    "  /clear           clear the transcript display",
    "  /copy [code|cmd] copy the last code block / command to the clipboard",
    "  /stats           session stats: blocks, model, tokens, fusion partner",
    "  /compact         compact the context (model summary + retained tail)",
    "  /shake           strip heavy tool results from context to reclaim tokens",
    "  /features [key]  list / toggle optional features (all on by default)",
    "  /autonomy [lvl]  pick the autonomy level (off/low/med/high)",
    "  /plan            toggle plan mode (read-only; mutations refused)",
    "  /goal [text]     set / show / pause / resume / done / drop the session goal",
    "  /undo            undo the last gated mutation",
    "  /shift           routing ledger — recent tier decisions (stage · tier · source · reason)",
    "  /diff            diff the latest snapshot against the work tree (overlay)",
    "  /exit            exit (also Ctrl+C)",
    "",
    "Keybindings",
    "  Enter            submit prompt",
    "  Shift+Enter       newline",
    "  Ctrl+K           open the command palette (fuzzy)",
    "  Ctrl+R           search prompt history (Enter reuses)",
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
    { value: "shift", label: "Routing ledger", description: "Recent shift tier decisions", keys: "/shift" },
    { value: "diff", label: "Snapshot diff", description: "Latest snapshot vs work tree", keys: "/diff" },
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
