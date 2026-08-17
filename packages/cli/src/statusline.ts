/**
 * openkai statusline — configure the status chrome chips (E002 Inc 05).
 *
 * The status line renders chips (agent, model, session, tokens, persist,
 * provider, state). The order and which chips are visible are configurable
 * via `~/.openkai/config.json` under the `statusline.chips` key. This command
 * reads/writes that config; the StatusLine TUI component reads it at render
 * time.
 *
 * Usage:
 *   openkai statusline                     Show current chip config.
 *   openkai statusline --set <a,b,c>       Set the chip order (comma-separated).
 *   openkai statusline --hide <chip>       Remove a chip from the line.
 *   openkai statusline --show <chip>       Add a chip back (at end).
 *   openkai statusline --reset             Restore the default chip order.
 */

import {
  DEFAULT_STATUSLINE_CHIPS,
  STATUSLINE_CHIPS,
  type StatuslineChip,
  readStatuslineChips,
  writeStatuslineChips,
} from "./config.js";

export interface StatuslineOptions {
  /** Set the full chip order (comma-separated ids). */
  set?: string;
  /** Hide a chip (remove from the order). */
  hide?: string;
  /** Show a chip (add to the end if not present). */
  show?: string;
  /** Reset to the default chip order. */
  reset?: boolean;
}

/** Parse and validate a comma-separated chip list. */
function parseChipList(csv: string): StatuslineChip[] | string {
  const valid = new Set<string>(STATUSLINE_CHIPS);
  const chips: StatuslineChip[] = [];
  for (const raw of csv.split(",")) {
    const id = raw.trim().toLowerCase();
    if (!id) continue;
    if (!valid.has(id)) {
      return `unknown chip "${id}". Valid chips: ${STATUSLINE_CHIPS.join(", ")}`;
    }
    chips.push(id as StatuslineChip);
  }
  if (chips.length === 0) {
    return "at least one chip is required.";
  }
  return chips;
}

export async function runStatusline(options: StatuslineOptions): Promise<number> {
  if (options.reset) {
    writeStatuslineChips([...DEFAULT_STATUSLINE_CHIPS]);
    process.stdout.write(`Reset statusline chips to: ${DEFAULT_STATUSLINE_CHIPS.join(", ")}\n`);
    return 0;
  }

  if (options.set) {
    const result = parseChipList(options.set);
    if (typeof result === "string") {
      process.stderr.write(`ERROR: ${result}\n`);
      return 2;
    }
    writeStatuslineChips(result);
    process.stdout.write(`Statusline chips set to: ${result.join(", ")}\n`);
    return 0;
  }

  if (options.hide) {
    const chip = options.hide.trim().toLowerCase();
    const valid = new Set<string>(STATUSLINE_CHIPS);
    if (!valid.has(chip)) {
      process.stderr.write(`ERROR: unknown chip "${chip}". Valid chips: ${STATUSLINE_CHIPS.join(", ")}\n`);
      return 2;
    }
    const current = readStatuslineChips();
    const next = current.filter((c) => c !== chip);
    if (next.length === 0) {
      process.stderr.write("ERROR: cannot hide the last chip.\n");
      return 2;
    }
    writeStatuslineChips(next);
    process.stdout.write(`Hid "${chip}". Chips: ${next.join(", ")}\n`);
    return 0;
  }

  if (options.show) {
    const chip = options.show.trim().toLowerCase() as StatuslineChip;
    const valid = new Set<string>(STATUSLINE_CHIPS);
    if (!valid.has(chip)) {
      process.stderr.write(`ERROR: unknown chip "${chip}". Valid chips: ${STATUSLINE_CHIPS.join(", ")}\n`);
      return 2;
    }
    const current = readStatuslineChips();
    if (current.includes(chip)) {
      process.stdout.write(`"${chip}" is already visible. Chips: ${current.join(", ")}\n`);
      return 0;
    }
    const next = [...current, chip];
    writeStatuslineChips(next);
    process.stdout.write(`Showing "${chip}". Chips: ${next.join(", ")}\n`);
    return 0;
  }

  // No flags: show current config.
  const current = readStatuslineChips();
  process.stdout.write(`Statusline chips: ${current.join(", ")}\n`);
  process.stdout.write(`\nAvailable chips: ${STATUSLINE_CHIPS.join(", ")}\n`);
  process.stdout.write(`Configure: openkai statusline --set <a,b,c> | --hide <chip> | --show <chip> | --reset\n`);
  return 0;
}