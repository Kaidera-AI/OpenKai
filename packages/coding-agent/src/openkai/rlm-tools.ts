/**
 * openkai/rlm-tools (E021 F4) — the RLM recursion tools on the fork's seam:
 * `rlm_spawn` admits a child run (returns the handle immediately, never the
 * answer); `rlm_collect` gathers settled results + the usage attribution.
 * Self-registers on the tool capability (sanctioned touch-list).
 */

import { Type } from "@oh-my-pi/omptype/typebox";
import type { Api } from "@oh-my-pi/pi-ai";
import { type StreamFunction, streamSimple } from "@oh-my-pi/pi-ai";
import { Text } from "@oh-my-pi/pi-tui";

import type { CustomTool } from "../extensibility/custom-tools/types.js";

import { RlmRegistry } from "./rlm.js";

const SpawnParams = Type.Object({
	task: Type.String({ description: "The child run's task." }),
	system: Type.Optional(Type.String({ description: "System prompt for the child (a default stands)." })),
	model: Type.Optional(Type.String({ description: "Model id for the child (default: the session's current model)." })),
});

const rlmSpawnBase: CustomTool<typeof SpawnParams> = {
	name: "rlm_spawn",
	label: "RLM Spawn",
	description:
		"Spawn a recursive child run — returns an admission handle IMMEDIATELY " +
		"(never the answer). The child runs independently; collect results with " +
		"rlm_collect. Use for parallel decomposition, verification passes, or " +
		"sub-investigations that should not block the current turn.",
	parameters: SpawnParams,
	loadMode: "discoverable",
	approval: "exec",
	async execute(_id, params, _onUpdate, ctx) {
		const registry = ctx.modelRegistry;
		const current = ctx.model;
		let model = current;
		if (params.model !== undefined) {
			const slash = params.model.indexOf("/");
			model =
				slash > 0
					? registry.find(params.model.slice(0, slash), params.model.slice(slash + 1))
					: (registry.getAvailable().find(m => m.id === params.model) ?? current);
		}
		if (model === undefined) {
			return { content: [{ type: "text", text: "rlm_spawn: no model available (none selected)" }], isError: true };
		}
		const streamFn: StreamFunction<Api> = (m, context, options) =>
			streamSimple(m, context, { ...(options as object), apiKey: registry.resolver(m.provider) } as never);
		const handle = RlmRegistry.current().spawnChild(streamFn, model, {
			system: params.system ?? "You are a child run in an OpenKai RLM recursion. Do the task; report compactly.",
			prompt: params.task,
		});
		return {
			content: [
				{
					type: "text",
					text: `rlm_spawn admitted: ${handle.childId} (generation ${handle.generation}, model ${handle.model}) — collect with rlm_collect`,
				},
			],
			details: { childId: handle.childId, generation: handle.generation, model: handle.model },
		};
	},
	renderResult: (result, _options, theme) => {
		const details = result.details as { childId?: string; model?: string } | undefined;
		return new Text(
			theme.fg("accent", `◆ rlm child ${details?.childId ?? ""} admitted (${details?.model ?? "?"})`),
			1,
			0,
		);
	},
};

const CollectParams = Type.Object({
	childId: Type.Optional(Type.String({ description: "Collect one child; omit to collect everything settled." })),
});

const rlmCollectBase: CustomTool<typeof CollectParams> = {
	name: "rlm_collect",
	label: "RLM Collect",
	description:
		"Collect results from admitted child runs (rlm_spawn). Returns settled " +
		"results + the usage attribution; pending children are reported as pending, " +
		"never blocked on.",
	parameters: CollectParams,
	loadMode: "discoverable",
	approval: "read",
	async execute(_id, params, _onUpdate, _ctx) {
		const registry = RlmRegistry.current();
		if (params.childId !== undefined) {
			const result = registry.result(params.childId);
			if (result === undefined) {
				return {
					content: [{ type: "text", text: `rlm_collect: ${params.childId} still pending (or unknown)` }],
				};
			}
			return {
				content: [
					{
						type: "text",
						text: `[${result.childId} · ${result.model}] ${result.text || `(failed: ${result.error ?? "unknown"})`}`,
					},
				],
			};
		}
		const settled = registry.settledResults();
		const attribution = registry.childUsageAttribution();
		if (settled.length === 0) {
			return {
				content: [
					{
						type: "text",
						text: "rlm_collect: no settled children yet (children never block — check again shortly)",
					},
				],
			};
		}
		const body = settled.map(r => `[${r.childId} · ${r.model}] ${r.text.slice(0, 400)}`).join("\n\n");
		return {
			content: [
				{
					type: "text",
					text: `rlm settled (${settled.length}):\n${body}\n\nchild usage attributed: ${attribution.totalTokens} tokens`,
				},
			],
			details: { settled: settled.length, childTokens: attribution.totalTokens },
		};
	},
	renderResult: (result, _options, theme) => {
		const details = result.details as { settled?: number } | undefined;
		return new Text(
			theme.fg("success", `◆ rlm collected${details?.settled !== undefined ? ` — ${details.settled} settled` : ""}`),
			1,
			0,
		);
	},
};

const rlmSpawn = Object.assign(rlmSpawnBase, { path: "builtin:openkai/rlm-spawn" });
const rlmCollect = Object.assign(rlmCollectBase, { path: "builtin:openkai/rlm-collect" });

export { rlmCollect, rlmSpawn };
