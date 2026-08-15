/**
 * FU-4 — selective invocation policy. Fusion is opt-in and the classifier is
 * DETERMINISTIC CONFIG FIRST (E016 §3.2): priority, task class, and blast
 * radius decide — never a model call on the dispatch hot path.
 *
 * Default is the cheap single-model path; fusion fires for architecture
 * decisions, ambiguous requirements, and high-blast-radius work.
 */

export type FusionPriority = "low" | "medium" | "high" | "urgent";

/** Task classes that justify fusion at high priority or above. */
export type FusionTaskClass =
  | "architecture"
  | "ambiguous"
  | "high-blast-radius"
  | "routine";

export interface FusionPolicyInput {
  priority?: FusionPriority;
  taskClass?: FusionTaskClass;
  /** Distinct files the task is expected to touch. */
  filesBreadth?: number;
  /** Explicit operator override (`openkai fuse` passes force=true). */
  force?: boolean;
}

export interface FusionPolicyConfig {
  /** Priorities that always fuse. Default: ["urgent"]. */
  fusePriorities: FusionPriority[];
  /** Classes that fuse at high priority or above. Default: all but routine. */
  fuseClasses: FusionTaskClass[];
  /** Files-breadth at or above which any task fuses. Default: 10. */
  breadthThreshold: number;
}

export interface FusionPolicyDecision {
  fuse: boolean;
  reason: string;
}

export const DEFAULT_FUSION_POLICY: FusionPolicyConfig = {
  fusePriorities: ["urgent"],
  fuseClasses: ["architecture", "ambiguous", "high-blast-radius"],
  breadthThreshold: 10,
};

const PRIORITY_RANK: Record<FusionPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

/**
 * Evaluate the policy. Rule order is the audit order — the first matching
 * rule is the reason returned:
 *   1. explicit force (operator opt-in) wins over everything;
 *   2. urgent-class priorities fuse;
 *   3. high-priority work in a fusion class fuses;
 *   4. breadth at/over the threshold fuses (high blast radius);
 *   5. otherwise the cheap single-model path.
 */
export function shouldFuse(
  input: FusionPolicyInput,
  config: FusionPolicyConfig = DEFAULT_FUSION_POLICY,
): FusionPolicyDecision {
  if (input.force === true) {
    return { fuse: true, reason: "explicit invocation (force)" };
  }

  const priority = input.priority ?? "medium";
  if (config.fusePriorities.includes(priority)) {
    return { fuse: true, reason: `priority ${priority} is a fusion priority` };
  }

  if (
    input.taskClass !== undefined &&
    config.fuseClasses.includes(input.taskClass) &&
    PRIORITY_RANK[priority] >= PRIORITY_RANK["high"]
  ) {
    return {
      fuse: true,
      reason: `${priority}-priority ${input.taskClass} work is a fusion class`,
    };
  }

  if (
    input.filesBreadth !== undefined &&
    input.filesBreadth >= config.breadthThreshold
  ) {
    return {
      fuse: true,
      reason: `blast radius ${input.filesBreadth} files >= threshold ${config.breadthThreshold}`,
    };
  }

  return {
    fuse: false,
    reason: "default single-model path (no fusion rule matched)",
  };
}
