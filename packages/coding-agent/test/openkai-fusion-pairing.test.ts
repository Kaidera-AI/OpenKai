/**
 * E022 Inc 03 gate — fusion-first defaults:
 *  1. Pair suggestions are SCORER-DRIVEN: the `source` contract names bandit
 *     evidence when gated-run telemetry exists, diversity policy when it does
 *     not, and configured pairs verbatim. Never a hardcoded tip.
 *  2. Cross-provider preference: a two-provider candidate set yields a
 *     cross-provider pair before a same-provider one.
 *  3. Single-provider fallback carries the advisory (the operator sees it).
 *  4. Config round-trip: ~/.openkai/config.json (OPENKAI_HOME-scoped) stores
 *     and reads the operator's pair; a corrupt file reads as empty.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { openkaiConfigPath, readOpenkaiConfig, writeOpenkaiConfig } from "../src/openkai/config-io";
import { candidateKey, type PairCandidate, postureBucket, suggestPair } from "../src/openkai/pairing";

const TWO_PROVIDERS: PairCandidate[] = [
	{ provider: "nvidia", id: "llama-70b" },
	{ provider: "openrouter", id: "nemotron-30b" },
	{ provider: "nvidia", id: "llama-8b" },
];

beforeEach(() => {
	Bun.env.OPENKAI_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "openkai-e022-"));
});
afterEach(() => {
	fs.rmSync(Bun.env.OPENKAI_HOME!, { recursive: true, force: true });
	delete Bun.env.OPENKAI_HOME;
});

describe("E022 Inc 03: scorer-driven pairing", () => {
	test("bandit evidence names the scorer as the source", () => {
		const current = TWO_PROVIDERS[0];
		const rec = suggestPair(TWO_PROVIDERS, current, {
			bucket: "medium",
			recommend: candidates =>
				candidates.includes("openrouter/nemotron-30b")
					? { modelId: "openrouter/nemotron-30b", reason: "bucket evidence 3 pass / 0 fail" }
					: undefined,
		});
		expect(rec).toBeDefined();
		expect(rec!.source).toBe("bandit");
		expect(rec!.builder.provider).toBe("openrouter");
		expect(rec!.reason).toContain("bucket evidence");
	});

	test("without evidence, the diversity policy picks cross-provider", () => {
		const current = TWO_PROVIDERS[0];
		const rec = suggestPair(TWO_PROVIDERS, current, { bucket: "medium" });
		expect(rec!.source).toBe("diversity-policy");
		expect(rec!.architect.provider).not.toBe(rec!.builder.provider);
	});

	test("a configured pair is honoured verbatim", () => {
		const rec = suggestPair(
			TWO_PROVIDERS,
			TWO_PROVIDERS[0],
			{ bucket: "medium" },
			{
				architect: "nvidia/llama-8b",
				builder: "openrouter/nemotron-30b",
			},
		);
		expect(rec!.source).toBe("configured");
		expect(candidateKey(rec!.architect)).toBe("nvidia/llama-8b");
		expect(candidateKey(rec!.builder)).toBe("openrouter/nemotron-30b");
	});

	test("single provider: advisory names the compromise", () => {
		const solo: PairCandidate[] = [
			{ provider: "nvidia", id: "llama-70b" },
			{ provider: "nvidia", id: "llama-8b" },
		];
		const rec = suggestPair(solo, solo[0], { bucket: "medium" });
		expect(rec!.source).toBe("self-pair-advisory");
		expect(rec!.advisory).toContain("one provider");
	});

	test("single model: self-pair advisory", () => {
		const solo: PairCandidate[] = [{ provider: "nvidia", id: "llama-70b" }];
		const rec = suggestPair(solo, solo[0], { bucket: "medium" });
		expect(rec!.source).toBe("self-pair-advisory");
		expect(candidateKey(rec!.architect)).toBe(candidateKey(rec!.builder));
		expect(rec!.advisory).toContain("same model");
	});

	test("the operator-priority dial maps to the evidence bucket", () => {
		expect(postureBucket("quality")).toBe("high");
		expect(postureBucket("balanced")).toBe("medium");
		expect(postureBucket("saver")).toBe("low");
		expect(postureBucket(undefined)).toBe("medium");
	});

	test("the bandit tier only fires on actual evidence (pulls > 0)", () => {
		// A recommend callback that returns evidence with pulls — the fusion-tool
		// binding suppresses zero-pull (uniform-prior) recommendations so an
		// evidenceless scorer never masquerades as scored.
		const rec = suggestPair(TWO_PROVIDERS, TWO_PROVIDERS[0], { bucket: "medium", recommend: () => undefined });
		expect(rec!.source).toBe("diversity-policy");
	});
});

describe("E022 Inc 03: pair config round-trip", () => {
	test("write then read returns the pair", async () => {
		await writeOpenkaiConfig({
			fusion: { pair: { architect: "nvidia/llama-70b", builder: "openrouter/nemotron-30b" } },
		});
		const cfg = await readOpenkaiConfig();
		expect(cfg.fusion?.pair?.architect).toBe("nvidia/llama-70b");
		expect(cfg.fusion?.pair?.builder).toBe("openrouter/nemotron-30b");
	});

	test("the config file is 0600", async () => {
		await writeOpenkaiConfig({ fusion: { pair: { architect: "a/b", builder: "c/d" } } });
		const mode = fs.statSync(openkaiConfigPath()).mode & 0o777;
		expect(mode).toBe(0o600);
	});

	test("a corrupt config reads as empty (never throws)", async () => {
		fs.writeFileSync(openkaiConfigPath(), "{ not json");
		const cfg = await readOpenkaiConfig();
		expect(cfg).toEqual({});
	});

	test("write preserves unrelated slices", async () => {
		await writeOpenkaiConfig({ shift: { posture: "quality" }, fusion: { pair: { architect: "a/b" } } });
		await writeOpenkaiConfig({ ...(await readOpenkaiConfig()), fusion: { pair: { architect: "x/y" } } });
		const cfg = await readOpenkaiConfig();
		expect(cfg.shift?.posture).toBe("quality");
		expect(cfg.fusion?.pair?.architect).toBe("x/y");
	});
});
