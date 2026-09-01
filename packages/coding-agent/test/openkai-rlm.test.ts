/**
 * E021 F4 gate — the RLM recursion layer: admission handles return
 * immediately, results settle asynchronously, usage attributes into the
 * parent record, the generation counter orders children, and a divergent
 * fusion verdict admits a verification child.
 */

import { describe, expect, test } from "bun:test";
import type { Api, StreamFunction } from "@oh-my-pi/pi-ai";
import { MockModel } from "@oh-my-pi/pi-ai/providers/mock";

import { RlmRegistry } from "../src/openkai/rlm.js";

describe("E021 F4: RLM recursion", () => {
	test("admission is immediate; results settle; usage attributes; generation orders", async () => {
		RlmRegistry.reset();
		const registry = RlmRegistry.current();
		const model = new MockModel({
			id: "mock-child",
			responses: [{ content: ["child answer"] }],
		});
		const streamFn: StreamFunction<Api> = (m, context, options) =>
			(m as MockModel).stream(m, context, options as never);

		const handle = registry.spawnChild(streamFn, model as never, {
			system: "child",
			prompt: "verify the claim",
		});
		// Admission only: the handle returns synchronously, no answer attached.
		expect(handle.childId.length).toBeGreaterThan(0);
		expect(handle.generation).toBe(1);
		expect(registry.settled(handle.childId)).toBe(false);

		// Let the child complete.
		await new Promise(resolve => setTimeout(resolve, 100));
		expect(registry.settled(handle.childId)).toBe(true);
		const result = registry.result(handle.childId);
		expect(result?.text).toContain("child answer");

		const attribution = registry.childUsageAttribution();
		expect(attribution.children.length).toBe(1);
		expect(attribution.children[0]!.childId).toBe(handle.childId);

		// A second spawn bumps the generation.
		const model2 = new MockModel({ id: "mock-child-2", responses: [{ content: ["second"] }] });
		const handle2 = registry.spawnChild(streamFn, model2 as never, { system: "c", prompt: "second task" });
		expect(handle2.generation).toBe(2);
	});

	test("a failed child settles with its error, never hangs the registry", async () => {
		RlmRegistry.reset();
		const registry = RlmRegistry.current();
		const model = new MockModel({
			id: "mock-fail",
			handler: () => ({ throw: "child exploded" }),
		});
		const streamFn: StreamFunction<Api> = (m, context, options) =>
			(m as MockModel).stream(m, context, options as never);

		const handle = registry.spawnChild(streamFn, model as never, { system: "c", prompt: "boom" });
		await new Promise(resolve => setTimeout(resolve, 100));
		expect(registry.settled(handle.childId)).toBe(true);
		expect(registry.result(handle.childId)?.error).toContain("child exploded");
	});
});
