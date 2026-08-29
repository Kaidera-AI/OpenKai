/**
 * 0.1.11 gate — upstream's in-place retry (18.0.10) composes with the fusion
 * tool: executing the same tool call twice produces two independent runs
 * (fresh context per completion — the no-history-reuse invariant).
 */

import { describe, expect, test } from "bun:test";
import { MockModel } from "@oh-my-pi/pi-ai/providers/mock";
import type { Api, Model, StreamFunction } from "@oh-my-pi/pi-ai";

import { fuse } from "../src/openkai/fusion/fuse.js";

describe("0.1.11: retry composes with fusion", () => {
  test("repeated execution of the same call runs independent panels", async () => {
    const model = new MockModel({
      id: "mock",
      handler: () => ({ content: ["verdict-shape: consensus reached"] }),
    });
    const streamFn: StreamFunction<Api> = (m, context, options) =>
      (m as MockModel).stream(m, context, options as never);

    const first = await fuse(streamFn, {
      task: "t",
      architectModel: model as unknown as Model<Api>,
      builderModel: model as unknown as Model<Api>,
    });
    const second = await fuse(streamFn, {
      task: "t",
      architectModel: model as unknown as Model<Api>,
      builderModel: model as unknown as Model<Api>,
    });
    // The same task runs twice through fully independent panels — every call
    // builds a FRESH context (the no-history-reuse invariant), so a retry is
    // always a clean new run, never a replay of the previous turn's history.
    const firstCtx = model.calls[0]!.context;
    const secondCtx = model.calls.at(-1)!.context;
    expect(firstCtx.messages.length).toBe(1); // every completion is one fresh user message
    expect(secondCtx.messages.length).toBe(1);
    expect(model.calls.length).toBeGreaterThanOrEqual(2);
  });
});
