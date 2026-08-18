/**
 * FU-1 — role-split execution on one task.
 *
 * Architect (plans/critiques) and builder (implements) run CONCURRENTLY as
 * separate fresh sessions. Phase 1 is self-pairing: same model for both
 * roles, because role separation alone delivers most of the replicated lift
 * and needs zero new provider plumbing (E016 §3.2). Cross-model pairs are a
 * config change, not a code change.
 */

import type { Api, Model, StreamFunction } from "@earendil-works/pi-ai";
import { complete } from "./complete.js";
import type { FusionRole, RoleOutput } from "./types.js";

const ROLE_SYSTEM: Record<FusionRole, string> = {
  architect:
    "You are the ARCHITECT role in a two-role fusion run. Plan, analyse trade-offs, " +
    "and critique: produce the design position for the task — structure, risks, " +
    "edge cases, and what a correct implementation must prove. Do not write the " +
    "implementation itself. Be specific and terse.",
  builder:
    "You are the BUILDER role in a two-role fusion run. Implement: produce the " +
    "concrete deliverable for the task — code, steps, or artefact content — with " +
    "the reasoning compressed to what the design review needs. Do not critique " +
    "the brief; build against it. Be specific and terse.",
};

export interface PanelOptions {
  task: string;
  architectModel: Model<Api>;
  builderModel: Model<Api>;
  /** Extra context both roles see verbatim (e.g. the immutable gate listing). */
  sharedContext?: string;
}

/**
 * Run the panel. The two `complete` calls are independent top-level
 * invocations — each builds its own Context inside `complete`, so there is
 * no shared message history to leak by construction.
 *
 * allSettled, not all: one role's provider failing must not throw away the
 * other role's completed work. A failed role settles as a RoleOutput with
 * empty text and its `error` field set; the caller (fuse) records the
 * partial panel and skips synthesis/gate rather than merging one opinion.
 */
export async function runPanel(
  streamFn: StreamFunction,
  options: PanelOptions,
): Promise<RoleOutput[]> {
  const prompt = options.sharedContext
    ? `${options.task}\n\n${options.sharedContext}`
    : options.task;

  const run = async (role: FusionRole, model: Model<Api>): Promise<RoleOutput> => {
    const startedRole = Date.now();
    try {
      const result = await complete(streamFn, model, {
        system: ROLE_SYSTEM[role],
        prompt,
      });
      return {
        role,
        modelId: model.id,
        text: result.text,
        usage: result.usage,
        latencyMs: result.latencyMs,
      };
    } catch (error) {
      return {
        role,
        modelId: model.id,
        text: "",
        usage: undefined,
        latencyMs: Date.now() - startedRole,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // Concurrent: fusion's 2-3x wall-clock is mitigated by running the pair
  // in parallel (OpenRouter's measurement is sequential-panel latency).
  const settled = await Promise.allSettled([
    run("architect", options.architectModel),
    run("builder", options.builderModel),
  ]);
  // run() never rejects (it captures its own failures), but keep the
  // invariant local: an unexpected rejection becomes the same error shape.
  return settled.map((outcome, i) => {
    if (outcome.status === "fulfilled") return outcome.value;
    const role: FusionRole = i === 0 ? "architect" : "builder";
    const reason: unknown = outcome.reason;
    return {
      role,
      modelId: (i === 0 ? options.architectModel : options.builderModel).id,
      text: "",
      usage: undefined,
      latencyMs: 0,
      error: reason instanceof Error ? reason.message : String(reason),
    };
  });
}
