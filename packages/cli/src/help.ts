/**
 * OpenKai help system (E002). Structured topics for `openkai help [topic]`
 * and `/help [topic]`; every topic is short, task-first, and points at the
 * next thing to try. The rule: help teaches, never lectures.
 */

export interface HelpTopic {
  id: string;
  title: string;
  lines: string[];
  seeAlso: string[];
}

export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "start",
    title: "Getting started",
    lines: [
      "openkai                launch the TUI (first run plays a 60s setup)",
      "  / <command>          every action starts with / — typing / lists them",
      "  Ctrl+K               command palette (fuzzy search over everything)",
      "  Esc Esc              clear the draft; Ctrl+C twice to quit",
      "openkai chat --prompt \"…\"   one-shot answer in the terminal",
      "openkai tail -f        live feed: what the agent is doing right now",
    ],
    seeAlso: ["providers", "tips"],
  },
  {
    id: "providers",
    title: "Providers & models",
    lines: [
      "/model                 pick provider → model (shows what's configured)",
      "--provider <id>        per-command provider (nvidia, anthropic, openai, …)",
      "Keys live in ~/.openkai/.env (global) or ./.env (this folder).",
      "  Real env vars always win over file values.",
      "Subscription lanes (Codex, Copilot) authenticate on first use — no key needed.",
      "openkai info           shows every provider's connection state",
    ],
    seeAlso: ["fusion", "start"],
  },
  {
    id: "fusion",
    title: "Fusion (two minds, one attributed answer)",
    lines: [
      "/fuse <task>           architect + builder in parallel, then a synthesised merge",
      "openkai fuse --prompt \"…\" --cast balanced   70b plans, 8b builds",
      "--gate                 gate-first validation: checks designed BEFORE work,",
      "                       baseline must fail red; refuses without --yes",
      "openkai fusion report  per-pair telemetry from your runs",
      "Casts (curated role sets) are config data: ~/.openkai/config.json, key \"casts\".",
    ],
    seeAlso: ["providers"],
  },
  {
    id: "memory",
    title: "Memory (sessions & Cortex)",
    lines: [
      "Sessions persist automatically as branchable trees (.openkai/sessions/).",
      "  /sessions            list them; /resume <id> continues one",
      "Cortex mode (CORTEX_PROJECT set): every run checkpoints into shared",
      "  project memory — searchable via openkai events and your other tools.",
      "  Unreachable Cortex ⇒ local mode, nothing breaks.",
      "Choose/re-choose any time: /settings (memory tab).",
    ],
    seeAlso: ["sessions"],
  },
  {
    id: "permissions",
    title: "Permissions & undo",
    lines: [
      "Writes and shell need your approval — an overlay shows the diff first.",
      "  Allow once · Allow always (this session) · Reject",
      "The deny floor (.env, keys, .ssh) refuses WITHOUT prompting — it cannot",
      "  be overridden, by design.",
      "/undo                  restore the tree to before the last approved change",
      "openkai undo --history list snapshots",
    ],
    seeAlso: ["shortcuts"],
  },
  {
    id: "sessions",
    title: "Sessions",
    lines: [
      "/new                   fresh session",
      "/sessions · /resume    list / continue",
      "openkai sessions --show <id>   full entry tree",
      "Sessions are JSONL trees — branch, fork, replay.",
    ],
    seeAlso: ["memory"],
  },
  {
    id: "shortcuts",
    title: "Shortcuts",
    lines: [
      "Enter submit · Shift+Enter newline",
      "Ctrl+K palette · Ctrl+O thinking density · Ctrl+S stash draft",
      "Esc Esc clear draft · Ctrl+C Ctrl+C quit",
    ],
    seeAlso: ["start"],
  },
  {
    id: "tips",
    title: "Tips from the team",
    lines: [
      "Fuse the hard stuff, chat the rest — fusion costs 2–3× wall-clock.",
      "openkai tail -f in a second terminal shows every tool call live.",
      "fast mode (/fast) turns reasoning off for quick answers.",
      "The palette (Ctrl+K) is also the which-key map — every shortcut is listed there.",
      ".env keys never leave the machine; the deny floor keeps them out of the model too.",
    ],
    seeAlso: ["fusion", "start"],
  },
];

export function helpIndex(): string[] {
  return [
    "OpenKai help — topics:",
    ...HELP_TOPICS.map((t) => `  ${t.id.padEnd(12)} ${t.title}`),
    "",
    "openkai help <topic> or /help <topic>",
  ];
}

export function helpTopic(id: string): HelpTopic | undefined {
  const needle = id.toLowerCase().trim();
  return HELP_TOPICS.find((t) => t.id === needle || t.title.toLowerCase().includes(needle));
}
