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
  /ImportError/i,
  /ModuleNotFoundError/i,
  /ValueError/i,
  /SyntaxError/i,
  /TypeError/i,
  /command not found/i,
  /No such file or directory/i,
  /file does not exist/i,
  /timed? ?out/i,
  /permission denied/i,
];

const TEST_PASS_PATTERNS = [/\bpass(ed|es)?\b/i, /\ball tests pass\b/i, /✔/, /\bOK\b/];
const TEST_FAIL_LITERALS = [/\bfail(ed|s|ures)?\b/i, /✖/, /\berror(s)?\b/i];
const NONZERO_COUNT = /([1-9][0-9]*) (failed|failing|errors?)/i;

const WRITE_TOOLS = new Set(["write_file", "edit_file", "hashline_edit", "write", "edit"]);

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
    if (CRITICAL_PATTERNS.some((p) => p.test(s.resultText))) {
      severity = Math.max(severity, SEVERITY.CRITICAL);
    } else if (
      s.isError ||
      HARD_PATTERNS.some((p) => p.test(s.resultText)) ||
      /exit(ed)? (code )?[1-9]/i.test(s.resultText)
    ) {
      severity = Math.max(severity, SEVERITY.HARD);
    }
  }
  return severity;
}


/** Recent production intensity: (writes+edits) / ops in the window. */
export function productionIntensity(signals: ToolSignal[]): number {
  const recent = signals.slice(-WINDOW);
  if (recent.length === 0) return 0;
  const writes = recent.filter((s) => WRITE_TOOLS.has(s.tool)).length;
  return writes / recent.length;
}

/** True when the window shows a settled run: tests passed, production, no severity. */
export function testsPassed(signals: ToolSignal[]): boolean {
  const recent = signals.slice(-WINDOW);
  if (recent.length === 0) return false;
  // Zero-count mentions ("0 failed") are guarded out before the fail-literal
  // test — Switchyard's "0 failed" guard.
  const text = recent
    .map((s) => s.resultText)
    .join("\n")
    .replace(/\b0 (failed|failing|errors?)\b/gi, "");
  const hasPass = TEST_PASS_PATTERNS.some((p) => p.test(text));
  const hasFailLiteral = TEST_FAIL_LITERALS.some((p) => p.test(text));
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
 */
export function supportsModalities(modelInput: readonly ModelModality[], required: readonly ModelModality[]): boolean {
  return required.every((m) => modelInput.includes(m));
}

/** Vision-capable shorthand (image tasks must never route to a text-only model). */
export function isVisionCapable(modelInput: readonly ModelModality[]): boolean {
  return modelInput.includes("image");
}

/**
 * Filter candidate models by required input modalities; if the filter would
 * empty the pool, return the original pool (fail-open to text-only rather
 * than refuse the task). Pure and deterministic.
 */
export function filterByModality<T extends { input: readonly ModelModality[] }>(
  models: readonly T[],
  required: readonly ModelModality[],
): T[] {
  const filtered = models.filter((m) => supportsModalities(m.input, required));
  return filtered.length > 0 ? filtered : [...models];
}
