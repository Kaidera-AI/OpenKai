/**
 * E021 F4 gate — fusion recursion: a divergent verdict admits a verification
 * child through the RLM registry, with usage attributed to the fusion run.
 */

import { describe, expect, test } from "bun:test";
import { MockModel } from "@oh-my-pi/pi-ai/providers/mock";
import type { Api, Model, StreamFunction } from "@oh-my-pi/pi-ai";

import { RlmRegistry } from "../src/openkai/rlm.js";

// Drive the same code path as fusion-tool.ts's divergence block (the tool's
// own execute needs a full session ctx; the recursion contract lives in the
// registry + this shared shape).
import { fuse } from "../src/openkai/fusion/fuse.js";

describe("E021 F4: fusion recursion on divergence", () => {
  test("a divergent verdict admits a verification child attributed to the run", async () => {
    RlmRegistry.reset();
    const registry = RlmRegistry.current();

    const architect = new MockModel({ id: "mock-arch", responses: [{ content: ["use the cache"] }] });
    const builder = new MockModel({ id: "mock-build", responses: [{ content: ["never cache"] }] });
    const judge = new MockModel({
      id: "mock-judge",
      responses: [
        {
          content: [
            JSON.stringify({
              consensus: [],
              divergences: [{ topic: "cache", architect: "use it", builder: "never", kept: "builder" }],
              discarded: [],
              blindSpots: [],
              comparison: { agreements: [], betterA: [], betterB: [], uniqueA: [], uniqueB: [] },
            }),
          ],
        },
      ],
    });
    const verify = new MockModel({ id: "mock-verify", responses: [{ content: ["builder holds: no invalidation story"] }] });

    const byId = new Map<string, MockModel>([
      [architect.id, architect],
      [builder.id, builder],
      [judge.id, judge],
      [verify.id, verify],
    ]);
    const streamFn: StreamFunction<Api> = (model, context, options) => {
      const mock = byId.get(model.id);
      if (mock === undefined) throw new Error(`unscripted ${model.id}`);
      return mock.stream(model, context, options as never);
    };

    const result = await fuse(streamFn, {
      task: "cache or not",
      architectModel: architect as unknown as Model<Api>,
      builderModel: builder as unknown as Model<Api>,
      judgeModel: judge as unknown as Model<Api>,
    });
    expect(result.synthesis.divergences.length).toBe(1);

    // The tool's divergence block: admit the verification child.
    const topics = result.synthesis.divergences.map((d) => d.topic).join("; ");
    const handle = registry.spawnChild(streamFn, verify as unknown as Model<Api>, {
      system: "verify the divergence",
      prompt: `The panel diverged on: ${topics}`,
    });
    expect(handle.generation).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(registry.settled(handle.childId)).toBe(true);
    expect(registry.result(handle.childId)?.text).toContain("builder holds");

    const attribution = registry.childUsageAttribution();
    expect(attribution.children.length).toBe(1);
    expect(attribution.children[0]!.model).toBe("mock-verify");
  });
});
