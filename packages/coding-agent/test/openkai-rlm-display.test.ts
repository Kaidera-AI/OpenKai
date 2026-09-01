/**
 * 0.1.11 gate — the RLM display half: a settled verification child's verdict
 * renders in the fusion card; pending children show honestly as running.
 */

import { describe, expect, test } from "bun:test";
import type { Api, StreamFunction } from "@oh-my-pi/pi-ai";
import { MockModel } from "@oh-my-pi/pi-ai/providers/mock";

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
			{
				content: [],
				details: {
					task: "t",
					gateOutcome: "not-run",
					roles: [],
					consensusCount: 0,
					divergenceCount: 1,
					verificationChildId: handle.childId,
				},
			} as never,
			{} as never,
			theme as never,
		);
		const runningText = component.render(80).join("\n");
		expect(runningText).toContain("running");

		return new Promise<void>(resolve =>
			setTimeout(() => {
				const settled = renderResult(
					{
						content: [],
						details: {
							task: "t",
							gateOutcome: "not-run",
							roles: [],
							consensusCount: 0,
							divergenceCount: 1,
							verificationChildId: handle.childId,
						},
					} as never,
					{} as never,
					theme as never,
				);
				const text = settled.render(80).join("\n");
				expect(text).toContain("verification (mock-verify");
				expect(text).toContain("builder holds the line");
				resolve();
			}, 150),
		);
	});
});

describe("E022 Inc 03: pending-child display states", () => {
	test("a pending child names its model, generation, and elapsed time", () => {
		RlmRegistry.reset();
		const registry = RlmRegistry.current();
		// A streamFn that never settles keeps the child pending synchronously —
		// the display state is the contract, no timers needed. The never-promise
		// stands in for a live event stream (spawnChild only stores it).
		const streamFn: StreamFunction<Api> = (() => new Promise<never>(() => {})) as unknown as StreamFunction<Api>;
		const model = { id: "mock-slow" } as never;
		const handle = registry.spawnChild(streamFn, model, { system: "s", prompt: "p" });

		const info = registry.pendingInfo(handle.childId);
		expect(info).toBeDefined();
		expect(info!.model).toBe("mock-slow");
		expect(info!.generation).toBe(handle.generation);

		const renderResult = fusionTool.renderResult;
		if (renderResult === undefined) throw new Error("fusion tool must render results");
		const theme = { fg: (_key: string, text: string) => text };
		const card = renderResult(
			{
				content: [],
				details: {
					task: "t",
					gateOutcome: "not-run",
					roles: [],
					consensusCount: 0,
					divergenceCount: 1,
					verificationChildId: handle.childId,
				},
			} as never,
			{} as never,
			theme as never,
		);
		const text = card.render(80).join("\n");
		expect(text).toContain("mock-slow");
		expect(text).toContain(`gen ${handle.generation}`);
		expect(text).toContain("running");
	});

	test("a failed child renders its error, not a silent verdict", async () => {
		RlmRegistry.reset();
		const registry = RlmRegistry.current();
		const model = new MockModel({ id: "mock-broken", responses: [{ throw: new Error("provider 503") }] });
		const streamFn: StreamFunction<Api> = (m, context, options) =>
			(m as MockModel).stream(m, context, options as never);
		const handle = registry.spawnChild(streamFn, model as never, { system: "s", prompt: "p" });

		// Await the registry's settle signal — no wall-clock wait.
		const settled = registry.whenSettled(handle.childId);
		expect(settled).toBeDefined();
		const child = await settled!;
		expect(child.error).toContain("provider 503");

		const renderResult = fusionTool.renderResult;
		if (renderResult === undefined) throw new Error("fusion tool must render results");
		const theme = { fg: (_key: string, text: string) => text };
		const card = renderResult(
			{
				content: [],
				details: {
					task: "t",
					gateOutcome: "not-run",
					roles: [],
					consensusCount: 0,
					divergenceCount: 1,
					verificationChildId: handle.childId,
				},
			} as never,
			{} as never,
			theme as never,
		);
		const text = card.render(80).join("\n");
		expect(text).toContain("failed");
		expect(text).toContain("provider 503");
	});
});
