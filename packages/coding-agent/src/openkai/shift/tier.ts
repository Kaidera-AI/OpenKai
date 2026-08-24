/**
 * Shift tier scorer (OK-9.1, Switchyard stage-router pattern, arXiv lineage
 * in research/2026-08-18-switchyard-routing-fusion-deep-dive.md §2).
 *
 * Pure and deterministic: windowed behavioural signals over the last few tool
 * results decide the tier (efficient vs capable) for the current stage. No
 * model call on the hot path. Decision order (first match wins):
 *   1. critical severity OR compaction        → capable (override)
 *   2. tests passed + recent production + 0 severity → efficient (settled)
 *   3. corroborative tanh scorer past threshold → route by sign
 *   4. fall-through                             → stage default (fall_open)
 *
 * Every decision carries a `source` label (override | tests_passed |
 * dimensions | fall_open) — Switchyard's observability discipline, and the
 * calibration-loop input.
 */

export type Tier = "efficient" | "capable";

export type TierDecisionSource = "override" | "tests_passed" | "dimensions" | "fall_open";

export interface TierDecision {
  tier: Tier;
  source: TierDecisionSource;
  /** Corroborative score in [-1, 1]; positive = toward capable. */
  score: number;
  /** |score| — how confident the dimensions step is. */
  confidence: number;
  reason: string;
}

/** One observed tool result in the window. */
export interface ToolSignal {
  /** The tool name (bash, write_file, edit_file, read_file, …). */
  tool: string;
  /** First ~500 chars of the tool result text (for pattern matching). */
  resultText: string;
  /** The command text for bash calls (enables write-bucketing, K3). */
  command?: string;
  /** Non-zero exit / isError flag when known. */
  isError?: boolean;
}

export interface TierInput {
  /** Last N tool results (caller passes ≤ window; we take the last 3). */
  signals: ToolSignal[];
  /** Current turn depth (tool calls so far this turn/session). */
  turnDepth: number;
  /** True when the session context was auto-compacted (self-latching). */
  compacted: boolean;
}

/** Severity levels (Switchyard's curated table). */
export const SEVERITY = { SOFT: 0.3, HARD: 0.7, CRITICAL: 1.0 } as const;

const CRITICAL_PATTERNS = [
  /out of memory/i,
  /\bOOM\b/,
  /connection refused/i,
  /ENOSPC/i,
  /kernel panic/i,
];

const HARD_PATTERNS = [
  /Traceback \(most recent call last\)/i,
  // Structural error names — any CamelCase *Error/*Exception (AssertionError,
  // KeyError, RuntimeError, …), not an enumerated handful (K3: pytest's
  // AssertionError evaded the list AND the lowercase /error(s)?/ literal).
  /\b\w*(?:Error|Exception)\b/,
  /command not found/i,
  /No such file or directory/i,
  /file does not exist/i,
  /timed? ?out/i,
];

/**
 * The gate's refusal prefix. An operator rejecting a permission request is the
 * consent layer working, not tool friction — scoring it as severity would
 * escalate turns precisely because the operator said no (K3).
 */
const REFUSAL_PREFIX = /^\s*permission denied:/i;

const SOFT_PATTERNS = [
  // Plain non-zero exit with no harder pattern (Switchyard: SOFT 0.3 — the
  // 0.5 threshold was calibrated against it; mapping these to HARD shifted
  // the operating point upward).
  /exit(ed)? (code )?[1-9]/i,
  /permission denied/i, // OS-level EACCES inside command output (gate refusals are stripped first)
];

// Pass/fail evidence (K3 fidelity fixes): 'failing'/'passing' forms matched
// (mocha's canonical summary); Jest's ✕ (U+2715) alongside ✖; structural
// *Error/*Exception names; negated passes stripped before the pass test so
// 'did not pass' never reads as a pass. Bare 'OK' is NOT pass evidence.
const TEST_PASS_PATTERNS = [/\bpass(ed|es|ing)?\b/i, /\ball tests pass\b/i, /[✔✓]/];
const TEST_FAIL_LITERALS = [/\bfail(ed|s|ures|ing)?\b/i, /[✖✕✗✘]/, /\berror(s)?\b/i, /\b\w*(?:Error|Exception)\b/];
const NEGATED_PASS_STRIP = /\b(did not pass|didn't pass|not passed|not passing)\b/gi;
/** Non-global twin: /g makes .test() stateful (lastIndex alternation). */
const NEGATED_PASS_TEST = /\b(did not pass|didn't pass|not passed|not passing)\b/i;
const NONZERO_COUNT = /([1-9][0-9]*) (failed|failing|errors?)/i;

const WRITE_TOOLS = new Set(["write_file", "edit_file", "hashline_edit", "write", "edit"]);

/**
 * Bash write patterns (Switchyard buckets these as production; without them a
 * productive sed/redirect agent reads as "spinning", K3): output redirection,
 * in-place editors, tee, and file moves/copies into the tree.
 */
const BASH_WRITE = /(>>?)|(\bsed\s+-i\b)|(\btee\b)|(\b(mv|cp|touch|mkdir)\b)/;

/** True when the signal is a write-class operation. */
function isProduction(s: ToolSignal): boolean {
  if (WRITE_TOOLS.has(s.tool)) return true;
  if (s.tool === "bash" && s.command !== undefined) return BASH_WRITE.test(s.command);
  return false;
}

/** Window size (Switchyard: last 3 tool results). */
const WINDOW = 3;
/** Turn depth at which "no production" splits into spinning vs exploring. */
const DEEP_TURN = 8;
/** Corroborative threshold (Switchyard ships 0.5; one maxed signal ≈0.4621). */
export const TIER_THRESHOLD = 0.5;

/** Max severity over the window (0 when clean). */
export function windowSeverity(signals: ToolSignal[]): number {
  let severity = 0;
  for (const s of signals.slice(-WINDOW)) {
    // Gate refusals are the consent layer working, not tool friction.
    if (REFUSAL_PREFIX.test(s.resultText)) continue;
    if (CRITICAL_PATTERNS.some((p) => p.test(s.resultText))) {
      severity = Math.max(severity, SEVERITY.CRITICAL);
    } else if (HARD_PATTERNS.some((p) => p.test(s.resultText))) {
      severity = Math.max(severity, SEVERITY.HARD);
    } else if (s.isError || SOFT_PATTERNS.some((p) => p.test(s.resultText))) {
      severity = Math.max(severity, SEVERITY.SOFT);
    }
  }
  return severity;
}


/** Recent production intensity: (writes+edits) / ops in the window. */
export function productionIntensity(signals: ToolSignal[]): number {
  const recent = signals.slice(-WINDOW);
  if (recent.length === 0) return 0;
  const writes = recent.filter(isProduction).length;
  return writes / recent.length;
}

/** True when the window shows a settled run: tests passed, production, no severity. */
export function testsPassed(signals: ToolSignal[]): boolean {
  const recent = signals.slice(-WINDOW);
  if (recent.length === 0) return false;
  // Zero-count mentions ("0 failed") are guarded out before the literal tests
  // (Switchyard's guard). Negated passes ("did not pass") count as FAILURE
  // evidence — stripping them left "2 passed, 1 did not pass" reading as a
  // pass (K3).
  const text = recent
    .map((s) => s.resultText)
    .join("\n")
    .replace(/\b0 (failed|failing|errors?)\b/gi, "");
  const hasFailLiteral = TEST_FAIL_LITERALS.some((p) => p.test(text)) || NEGATED_PASS_TEST.test(text);
  const hasPass = TEST_PASS_PATTERNS.some((p) => p.test(text.replace(NEGATED_PASS_STRIP, "")));
  const hasNonzero = NONZERO_COUNT.test(text);
  return hasPass && !hasFailLiteral && !hasNonzero;
}
function spinExplore(signals: ToolSignal[], turnDepth: number): { spinning: number; exploring: number } {
  if (turnDepth < DEEP_TURN) return { spinning: 0, exploring: 0 };
  const recent = signals.slice(-WINDOW);
  const production = productionIntensity(signals);
  if (production > 0) return { spinning: 0, exploring: 0 };
  const reads = recent.filter((s) => s.tool.startsWith("read") || s.tool === "grep" || s.tool === "glob" || s.tool === "list_files").length;
  return reads > 0 ? { spinning: 0, exploring: 1 } : { spinning: 1, exploring: 0 };
}

/**
 * The tier decision. Pure: same input → same decision.
 */
export function decideTier(input: TierInput, defaultTier: Tier = "efficient"): TierDecision {
  const signals = input.signals.slice(-WINDOW);
  const severity = windowSeverity(signals);

  // 1. Hard escalate: critical severity or compaction.
  if (severity >= SEVERITY.CRITICAL || input.compacted) {
    return {
      tier: "capable",
      source: "override",
      score: 1,
      confidence: 1,
      reason: input.compacted ? "compacted context belongs capable" : "critical error severity",
    };
  }

  // 2. Hard de-escalate: settled run.
  const produced = productionIntensity(signals) > 0;
  if (testsPassed(signals) && produced && severity === 0) {
    return {
      tier: "efficient",
      source: "tests_passed",
      score: -1,
      confidence: 1,
      reason: "tests passed with recent production and clean window",
    };
  }

  // 3. Corroborative tanh scorer.
  const { spinning, exploring } = spinExplore(signals, input.turnDepth);
  const raw = 0.1 * (severity / SEVERITY.HARD + spinning + exploring - productionIntensity(signals));
  const score = Math.tanh(5 * raw);
  const confidence = Math.abs(score);
  if (confidence >= TIER_THRESHOLD) {
    return {
      tier: score > 0 ? "capable" : "efficient",
      source: "dimensions",
      score,
      confidence,
      reason: `corroborative score ${score.toFixed(3)} past threshold`,
    };
  }

  // 4. Fall-through: stage default.
  return {
    tier: defaultTier,
    source: "fall_open",
    score,
    confidence,
    reason: `below threshold; stage default ${defaultTier}`,
  };
}


// ── Multi-modal routing (K3 #2, vision slice) ──────────────────────────────

/** Input modalities the pi-ai catalogue records per model. */
export type ModelModality = "text" | "image";

/**
 * True when the model accepts every required modality (K3 #2). The catalogue
 * records text/image today; audio/video/STT/TTS/embedding/ranking arrive with
 * the provider substrate — the filter is modality-generic so they slot in.
 * Tokens are a closed lowercase vocabulary; caller input is normalised (K3:
 * 'Image' used to silently defeat the filter).
 */
export function supportsModalities(modelInput: readonly ModelModality[], required: readonly ModelModality[]): boolean {
  const held = modelInput.map((m) => m.toLowerCase());
  return required.every((m) => held.includes(m.toLowerCase()));
}

/** Vision-capable shorthand (image tasks must never route to a text-only model). */
export function isVisionCapable(modelInput: readonly ModelModality[]): boolean {
  return modelInput.includes("image");
}

/**
 * Filter candidate models by required input modalities. If the filter would
 * empty the pool, return the original pool with `fellBack: true` (fail-open to
 * text-only rather than refuse the task) — the caller can label the routing
 * event instead of silently handing an image task to a text model (K3).
 * Pure and deterministic.
 */
export function filterByModality<T extends { input: readonly ModelModality[] }>(
  models: readonly T[],
  required: readonly ModelModality[],
): { models: T[]; fellBack: boolean } {
  const filtered = models.filter((m) => supportsModalities(m.input, required));
  return filtered.length > 0 ? { models: filtered, fellBack: false } : { models: [...models], fellBack: true };
}
