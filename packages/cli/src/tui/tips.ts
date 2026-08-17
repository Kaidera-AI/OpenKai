/**
 * Tips system (E002) — teaching moments, never noise. One rotating tip per
 * fresh session's welcome block (deterministic by day), plus one-shot
 * contextual hints at first-use moments (first approval, first fuse).
 * Disable via config: features.tips = false.
 */

const TIPS: readonly string[] = [
  "tip: /fuse <task> puts two models on it — an architect plans, a builder builds, a third merges with attribution.",
  "tip: openkai tail -f shows every tool call and token as it happens, in another terminal.",
  "tip: /fast toggles fast mode — reasoning off, answers quicker. Shift+Tab cycles effort directly.",
  "tip: /model switches providers mid-session — your subscriptions (Claude, Codex, Kimi, Copilot) are in there too.",
  "tip: Ctrl+K opens the command palette — everything is one keystroke away.",
  "tip: Ctrl+S stashes a draft; Ctrl+S again pops it back. Nothing lost to a misclick.",
  "tip: /undo restores the tree to before the last approved change. Nothing is final.",
  "tip: /btw <question> asks a side question without polluting the main conversation.",
  "tip: /fork branches this session and prints a paste-able resume receipt.",
  "tip: /tree shows the session tree — forks, branches, the full lineage.",
  "tip: /retry re-runs the last prompt, optionally on another model.",
  "tip: /init generates a starter AGENTS.md for this project. Never overwrites.",
  "tip: /memory add <learning> records what you learned — every session in this folder sees it next boot.",
  "tip: /setup re-runs onboarding (sign in to providers, pick a model); /settings is the config panel (theme, status line, memory, features).",
  "tip: /settings → appearance → status line cycles presets: default · minimal · compact · full.",
  "tip: start a prompt with → and write a numbered list (1. Do X, 2. Do Y) for multi-step tasks.",
  "tip: sign in to two providers and /fuse runs the architect/builder split across both — that's where fusion's lift comes from.",
  "tip: /sessions lists local persisted sessions; /resume <id> replays the tree.",
  "tip: Ctrl+D exits with your draft saved, not discarded. /exit is the explicit way.",
  "tip: CORTEX_PROJECT=<key> turns on shared Kaidera memory; unset, everything stays local to this machine.",
];

/** Today's tip, deterministic — rotates daily, no state needed. */
export function tipOfTheDay(day: Date = new Date()): string {
  const index = Math.floor(day.getTime() / 86_400_000) % TIPS.length;
  return TIPS[index]!;
}
