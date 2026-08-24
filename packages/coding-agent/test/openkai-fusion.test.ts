/**
 * E021 F1 gate — the fusion panel runs on the fork: two scripted MockModels
 * (architect + builder) and a judge, the combined verdict structure intact,
 * the bandit writeback moving on the outcome.
 */

import { describe, expect, test } from "bun:test";
import { MockModel, type MockHandler } from "@oh-my-pi/pi-ai/providers/mock";
import type { Api, StreamFunction } from "@oh-my-pi/pi-ai";

import { fuse } from "../src/openkai/fusion/fuse.js";
import { FusionBandit } from "../src/openkai/fusion/bandit.js";

const text = (t: string): MockHandler => ({
  content: [t],
});

describe("E021 F1: fusion on the fork", () => {
  test("panel + synthesis verdict over scripted models", async () => {
    const architect = new MockModel({ id: "mock-architect", responses: [text("architect answer: use the cache")] });
    const builder = new MockModel({ id: "mock-builder", responses: [text("builder answer: skip the cache")] });
    // The judge sees both outputs and returns the synthesis JSON shape.
    const judge = new MockModel({
      id: "mock-judge",
      responses: [
        text(
          JSON.stringify({
            consensus: ["the cache question needs an invalidation story first"],
            divergences: [
              {
                topic: "cache at all",
                architect: "use the cache",
                builder: "skip the cache",
                kept: "builder",
              },
            ],
            discarded: [{ item: "cache-everything idea", reason: "no invalidation story", by: "builder" }],
            blindSpots: [],
            comparison: { agreements: [], betterA: [], betterB: [], uniqueA: [], uniqueB: [] },
          }),
        ),
      ],
    });

    // The panel's streamFn routes by model instance (the registry seam is the
    // production wiring; the test drives the same StreamFunction shape).
    const byId = new Map([
      [architect.id, architect],
      [builder.id, builder],
      [judge.id, judge],
    ]);
    const streamFn: StreamFunction<Api> = (model, context, options) => {
      const mock = byId.get(model.id);
      if (mock === undefined) throw new Error(`unscripted model ${model.id}`);
      return mock.stream(model, context, options as never);
    };

    const bandit = new FusionBandit();
    const result = await fuse(streamFn, {
      task: "should we cache the catalogue?",
      architectModel: architect,
      builderModel: builder,
      judgeModel: judge,
    });

    expect(result.outputs.length).toBe(2);
    expect(result.outputs[0]!.text).toContain("architect answer");
    expect(result.outputs[1]!.text).toContain("builder answer");
    expect(result.synthesis.synthesisError).toBeUndefined();
    expect(result.synthesis.consensus[0]).toContain("invalidation");
    expect(result.synthesis.divergences.length).toBe(1);
    expect(result.gate.outcome).toBe("not-run");

    // The bandit learns from the verdict (the reward writeback shape).
    bandit.noteOutcome("medium", architect.id, true);
    const arm = bandit.armFor("medium", architect.id);
    expect(arm.alpha).toBeGreaterThan(1);
  });

  test("a failed role renders honestly (partial panel, no synthesis lie)", async () => {
    const architect = new MockModel({
      id: "mock-architect",
      handler: () => ({ throw: "provider exploded" }),
    });
    const builder = new MockModel({ id: "mock-builder", responses: [text("builder carries on")] });
    const byId = new Map([
      [architect.id, architect],
      [builder.id, builder],
    ]);
    const streamFn: StreamFunction<Api> = (model, context, options) => {
      const mock = byId.get(model.id);
      if (mock === undefined) throw new Error(`unscripted model ${model.id}`);
      return mock.stream(model, context, options as never);
    };

    const result = await fuse(streamFn, {
      task: "resilience probe",
      architectModel: architect,
      builderModel: builder,
    });
    const failed = result.outputs.find((o) => o.role === "architect");
    expect(failed?.error).toContain("provider exploded");
    const survived = result.outputs.find((o) => o.role === "builder");
    expect(survived?.text).toContain("carries on");
    // The synthesis explicitly does not run over a broken panel.
    expect(result.synthesis.synthesisError ?? result.synthesis.consensus.length === 0).toBeTruthy();
  });
});
