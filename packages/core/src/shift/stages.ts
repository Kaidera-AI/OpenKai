/**
 * Shift — deterministic stage classification (E002 Inc 02, Switchyard pattern).
 *
 * FU-4 discipline: the classifier is DETERMINISTIC CONFIG FIRST — no model
 * call on the classification hot path. A prompt is classified into one of
 * three stages (plan / build / review) by keyword scoring and optional
 * task-class mapping, both driven by a config object the caller supplies.
 *
 * The same input always yields the same stage: the function is pure,
 * side-effect-free, and testable without any provider or network.
 */

/** The three Shift stages (Switchyard signal-driven routing). */
export type Stage = "plan" | "build" | "review";

/**
 * Task-class input from the fusion policy ({@link shouldFuse}). When present
 * it takes priority over keyword scoring — the policy already classified the
 * work, so we respect it.
 */
export interface StageTaskClassInput {
  taskClass?: "architecture" | "ambiguous" | "high-blast-radius" | "routine";
}

/** Input to {@link classifyStage}. */
export interface ShiftInput extends StageTaskClassInput {
  /** The operator's prompt or task description. */
  prompt: string;
}

/**
 * Configurable keyword sets per stage and the tie-break priority. Every field
 * has a default so a caller can pass `{}` and get sensible behaviour.
 */
export interface StageConfig {
  /**
   * Keywords that score for each stage. Case-insensitive WORD-BOUNDARY match
   * — a keyword like "add" matches "add a test" but NOT "address" (the
   * substring bug that mis-routed explicit review prompts is fixed).
   * Default: a curated set per stage.
   */
  stageKeywords?: Partial<Record<Stage, string[]>>;
  /**
   * Priority order for tie-breaking when two stages score equally. The first
   * stage in this list wins. Default: `["plan", "build", "review"]` — plan
   * first because planning usually precedes building.
   */
  stagePriority?: Stage[];
  /**
   * Mapping from a fusion task class to a stage. When the input carries a
   * `taskClass` this mapping is consulted BEFORE keyword scoring.
   * Default: architecture→plan, ambiguous→plan, high-blast-radius→plan,
   * routine→build.
   */
  taskClassMapping?: Partial<Record<NonNullable<StageTaskClassInput["taskClass"]>, Stage>>;
  /** The fallback stage when no signal matches. Default: `"build"`. */
  defaultStage?: Stage;
}

/** Default keyword sets — curated from common operator phrasing. */
const DEFAULT_STAGE_KEYWORDS: Record<Stage, string[]> = {
  plan: [
    "design",
    "plan",
    "architect",
    "outline",
    "strategy",
    "approach",
    "how should",
    "how would",
    "what if",
    "consider",
    "evaluate options",
    "trade-off",
    "tradeoff",
  ],
  build: [
    // ponytail: verbs only. "code" was a bare NOUN here, and it collides with
    // the most common review phrasing ("review the code", "audit the code"):
    // both stages scored 1, and the plan/build/review tie-break handed the
    // job to build. Ceiling: prompts mixing a review verb with a build noun
    // ("check the build output") still tie to build — upgrade to an
    // earliest-keyword-position tie-break if that shows up in real use.
    "implement",
    "build",
    "write",
    "create",
    "develop",
    "refactor",
    "fix",
    "add",
    "generate",
    "scaffold",
    "deploy",
    "install",
    "configure",
  ],
  review: [
    "review",
    "check",
    "test",
    "verify",
    "validate",
    "inspect",
    "audit",
    "lint",
    "debug",
    "diagnose",
    "assess",
    "evaluate",
  ],
};

/** Default tie-break order. */
const DEFAULT_STAGE_PRIORITY: Stage[] = ["plan", "build", "review"];

/** Default task-class → stage mapping. */
const DEFAULT_TASK_CLASS_MAPPING: Record<
  NonNullable<StageTaskClassInput["taskClass"]>,
  Stage
> = {
  architecture: "plan",
  ambiguous: "plan",
  "high-blast-radius": "plan",
  routine: "build",
};

/** The built-in default config. */
export const DEFAULT_STAGE_CONFIG: Required<StageConfig> = {
  stageKeywords: DEFAULT_STAGE_KEYWORDS,
  stagePriority: DEFAULT_STAGE_PRIORITY,
  taskClassMapping: DEFAULT_TASK_CLASS_MAPPING,
  defaultStage: "build",
};

/**
 * Escape regex special characters in a keyword so it can be embedded in a
 * RegExp safely.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Count keyword matches for a stage against the prompt. Case-insensitive,
 * WORD-BOUNDARY match: the keyword (which may be a phrase like "how should")
 * must appear as a whole word/phrase, not as a substring of a larger word.
 *
 * This fixes the substring bug where "add" matched inside "address" and "fix"
 * matched inside "prefix" — both mis-routed explicit review prompts to the
 * build stage.
 */
function scoreStage(prompt: string, keywords: string[] | undefined): number {
  if (!keywords || keywords.length === 0) return 0;
  const lower = prompt.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    const escaped = escapeRegex(kw.toLowerCase());
    // \b is a word boundary: "add" matches "add a test" but NOT "address"
    // because "add" in "address" is followed by "r" (a word character), so
    // there is no \b after "add".
    const re = new RegExp(`\\b${escaped}\\b`);
    if (re.test(lower)) count += 1;
  }
  return count;
}

/**
 * Classify a prompt into a stage — DETERMINISTIC, config-first, no model call.
 *
 * Rule order (first match wins):
 *   1. If the input carries a `taskClass`, the task-class mapping decides.
 *   2. Otherwise, keyword scoring: each stage's keywords are counted; the
 *      highest-scoring stage wins, with `stagePriority` breaking ties.
 *   3. If no keywords match, `defaultStage` is returned.
 *
 * The function is pure: same input + same config → same output, always.
 */
export function classifyStage(
  input: ShiftInput,
  config: StageConfig = {},
): Stage {
  const cfg = { ...DEFAULT_STAGE_CONFIG, ...config };
  const keywords = { ...DEFAULT_STAGE_KEYWORDS, ...cfg.stageKeywords };
  const priority = cfg.stagePriority ?? DEFAULT_STAGE_PRIORITY;
  const taskClassMap = { ...DEFAULT_TASK_CLASS_MAPPING, ...cfg.taskClassMapping };
  const defaultStage = cfg.defaultStage ?? "build";

  // Rule 1: task-class mapping (the fusion policy already classified the work).
  if (input.taskClass) {
    const mapped = taskClassMap[input.taskClass];
    if (mapped) return mapped;
  }

  // Rule 2: keyword scoring with word-boundary matching.
  const scores: Record<Stage, number> = {
    plan: scoreStage(input.prompt, keywords.plan),
    build: scoreStage(input.prompt, keywords.build),
    review: scoreStage(input.prompt, keywords.review),
  };

  const maxScore = Math.max(scores.plan, scores.build, scores.review);
  if (maxScore === 0) return defaultStage;

  // Tie-break by priority order.
  for (const stage of priority) {
    if (scores[stage] === maxScore) return stage;
  }

  // Fallback (should not reach here if priority covers all stages).
  return defaultStage;
}