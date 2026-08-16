/**
 * Tips system (E002) — teaching moments, never noise. One rotating tip per
 * fresh session's welcome block (deterministic by day), plus one-shot
 * contextual hints at first-use moments (first approval, first fuse).
 * Disable via config: features.tips = false.
 */

const TIPS: readonly string[] = [
  "tip: /fuse <task> puts two models on it — an architect plans, a builder builds, a third merges with attribution.",
  "tip: openkai tail -f shows every tool call and token as it happens, in another terminal.",
  "tip: /fast toggles fast mode — reasoning off, answers quicker.",
  "tip: /model switches providers mid-session — your subscriptions are in there too.",
  "tip: Ctrl+S stashes a draft; Ctrl+S again pops it back.",
  "tip: /undo restores the tree to before the last approved change. Nothing is final.",
  "tip: /btw <question> asks a side question without polluting the main conversation.",
  "tip: CORTEX_PROJECT=<key> turns on shared memory; unset, everything stays local.",
];

/** Today's tip, deterministic — rotates daily, no state needed. */
export function tipOfTheDay(day: Date = new Date()): string {
  const index = Math.floor(day.getTime() / 86_400_000) % TIPS.length;
  return TIPS[index]!;
}
