/**
 * 0.1.11 gate — the RLM display half: a settled verification child's verdict
 * renders in the fusion card; pending children show honestly as running.
 */

import { describe, expect, test } from "bun:test";
import { Text } from "@oh-my-pi/pi-tui";
import { MockModel } from "@oh-my-pi/pi-ai/providers/mock";
import type { Api, StreamFunction } from "@oh-my-pi/pi-ai";

import { fusionTool } from "../src/openkai/fusion-tool.js";
import { RlmRegistry } from "../src/openkai/rlm.js";

describe("0.1.11: verification child renders in the fusion card", () => {
  test("a settled child joins the verdict lines", () => {
    RlmRegistry.reset();
    const registry = RlmRegistry.current();
    const model = new MockModel({ id: "mock-verify", responses: [{ content: ["builder holds the line"] }] });
    const streamFn: StreamFunction<Api> = (m, context, options) =>
      (m as MockModel).stream(m, context, options as never);
    const handle = registry.spawnChild(streamFn, model as never, { system: "verify", prompt: "which side?" });

    // The fusion card's renderResult against details naming this child.
    const renderResult = fusionTool.renderResult;
    if (renderResult === undefined) throw new Error("fusion tool must render results");
    const theme = { fg: (_key: string, text: string) => text };
    const component = renderResult(
      { content: [], details: {
        task: "t",
        gateOutcome: "not-run",
        roles: [],
        consensusCount: 0,
        divergenceCount: 1,
        verificationChildId: handle.childId,
      } } as never,
      {} as never,
      theme as never,
    );
    const runningText = component.render(80).join("\n");
    expect(runningText).toContain("running");

    return new Promise<void>((resolve) => setTimeout(() => {
      const settled = renderResult(
        { content: [], details: {
          task: "t",
          gateOutcome: "not-run",
          roles: [],
          consensusCount: 0,
          divergenceCount: 1,
          verificationChildId: handle.childId,
        } } as never,
        {} as never,
        theme as never,
      );
      const text = settled.render(80).join("\n");
      expect(text).toContain("verification (mock-verify");
      expect(text).toContain("builder holds the line");
      resolve();
    }, 150));
  });
});
