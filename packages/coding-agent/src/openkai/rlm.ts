/**
 * openkai/rlm (E021 F4) — the RLM recursion pattern on the fork's seams.
 * From the prime-agent research: an admission handle returns IMMEDIATELY
 * (never the answer), results fold back asynchronously, and child usage
 * attributes into the parent run's record.
 *
 * The mechanics:
 * - `spawnChild`: starts a child completion on its own model + context,
 *   returns a handle (id + generation + startedAt). Never blocks.
 * - `collectChild`/`collectAll`: gather settled results (or note pending).
 * - Usage attribution: each settled child's usage rolls into the parent's
 *   attribution record (the fusion run record carries `childUsage`).
 * - Generation counter: every spawn bumps the generation — a replay/reconnect
 *   token so a reattached client can order child events (the prime-agent
 *   generation-cursor pattern, scoped to the RLM layer).
 */

import { complete, type CompletionRequest } from "./fusion/complete.js";
import type { Api, Model, StreamFunction, Usage } from "@oh-my-pi/pi-ai";

/** An admission handle — the spawn returns this, never the answer. */
export interface RlmSpawnHandle {
  childId: string;
  generation: number;
  startedAt: number;
  model: string;
  task: string;
}

/** A settled child result. */
export interface RlmChildResult {
  childId: string;
  generation: number;
  model: string;
  task: string;
  text: string;
  usage: Usage | undefined;
  latencyMs: number;
  error?: string;
}

interface PendingChild {
  handle: RlmSpawnHandle;
  promise: Promise<RlmChildResult>;
}

/** The per-session child registry: spawn admission, collection, attribution. */
export class RlmRegistry {
  private readonly pending = new Map<string, PendingChild>();
  private generation = 0;
  private readonly attributed: RlmChildResult[] = [];

  /** Spawn a child run — admission only; the result arrives via collect. */
  spawnChild(
    streamFn: StreamFunction<Api>,
    model: Model<Api>,
    request: CompletionRequest,
  ): RlmSpawnHandle {
    this.generation += 1;
    const handle: RlmSpawnHandle = {
      childId: `${Date.now().toString(36)}-${this.generation}`,
      generation: this.generation,
      startedAt: Date.now(),
      model: model.id,
      task: request.prompt.slice(0, 120),
    };
    const started = Date.now();
    const promise = complete(streamFn, model, request)
      .then((result): RlmChildResult => ({
        childId: handle.childId,
        generation: handle.generation,
        model: model.id,
        task: handle.task,
        text: result.text,
        usage: result.usage,
        latencyMs: Date.now() - started,
      }))
      .catch((error): RlmChildResult => ({
        childId: handle.childId,
        generation: handle.generation,
        model: model.id,
        task: handle.task,
        text: "",
        usage: undefined,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      }));
    this.pending.set(handle.childId, { handle, promise });
    // Settled children move to the attribution log.
    void promise.then((result) => {
      this.pending.delete(handle.childId);
      this.attributed.push(result);
    });
    return handle;
  }

  /** Whether a child has settled (its result is in the attribution log). */
  settled(childId: string): boolean {
    return this.attributed.some((r) => r.childId === childId);
  }

  /** The child's result when settled, undefined while pending. */
  result(childId: string): RlmChildResult | undefined {
    return this.attributed.find((r) => r.childId === childId);
  }

  /** All settled results so far (collection is non-destructive). */
  settledResults(): readonly RlmChildResult[] {
    return this.attributed;
  }

  /** The current generation (replay/reconnect token). */
  get currentGeneration(): number {
    return this.generation;
  }

  /** Child usage folded into the parent's record: summed tokens + rows. */
  childUsageAttribution(): { totalTokens: number; children: Array<{ childId: string; model: string; totalTokens: number }> } {
    let totalTokens = 0;
    const children: Array<{ childId: string; model: string; totalTokens: number }> = [];
    for (const result of this.attributed) {
      const tokens = result.usage?.totalTokens ?? 0;
      totalTokens += tokens;
      children.push({ childId: result.childId, model: result.model, totalTokens: tokens });
    }
    return { totalTokens, children };
  }

  /** The per-session registry. */
  static current(): RlmRegistry {
    RlmRegistry.#current ??= new RlmRegistry();
    return RlmRegistry.#current;
  }

  static #current: RlmRegistry | undefined;
  /** Reset between sessions/tests. */
  static reset(): void {
    RlmRegistry.#current = undefined;
  }
}
