/**
 * E021 F3 gate — the deny floor extension: protected paths and out-of-folder
 * writes block absolutely, with the pattern named; clean calls pass through.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "../src/extensibility/extensions/types.js";

await import("../src/discovery/index.js");
const { default: openkaiFloor } = await import("../src/openkai/floor-extension.js");

import { floorMatchFor, outsideCwd, resetTmpdirCacheForTest } from "../src/openkai/gate-floor.js";

describe("E021 F3: the deny floor on the fork", () => {
	test("the factory wires its handlers when attached", async () => {
		const handlers: Array<(event: never, ctx: never) => unknown> = [];
		const pi = {
			logger: { info: () => undefined },
			registerCommand: () => undefined,
			on: (_event: string, handler: (event: never, ctx: never) => unknown) => handlers.push(handler),
		} as unknown as ExtensionAPI;
		openkaiFloor(pi);
		expect(handlers.length).toBeGreaterThan(0);
	});

	test("floor matcher: protected node + its contents + clean paths", () => {
		const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "ok-floor-")));
		expect(floorMatchFor(cwd, ".env")).toBeDefined();
		expect(floorMatchFor(cwd, "secrets/id_ed25519_sk")).toBeDefined();
		expect(floorMatchFor(cwd, ".ssh")).toBeDefined(); // the node itself (F10)
		expect(floorMatchFor(cwd, ".ssh/config")).toBeDefined();
		expect(floorMatchFor(cwd, "src/app.ts")).toBeUndefined();
		expect(outsideCwd(cwd, "src/app.ts")).toBe(false);
		// E022 Inc 04/05: the system temp tree is exempt scratch (upstream SDK
		// sessions sandbox + relocate there) — escapes within temp pass
		// containment; DENY_FLOOR still guards secrets inside temp (above).
		expect(outsideCwd(cwd, "../outside.ts")).toBe(false);
		// Strict containment holds on real trees: an escape from a non-temp cwd
		// is still denied (cwd anchored on this repo's src directory).
		const realCwd = realpathSync(path.join(import.meta.dir, "..", "src"));
		expect(outsideCwd(realCwd, "../escape.txt")).toBe(true);
		expect(outsideCwd(realCwd, "/etc/passwd")).toBe(true);
		expect(outsideCwd(realCwd, "openkai/gate-floor.ts")).toBe(false);
	});

	test("the handler blocks floor patterns, passes clean and temp-scratch, and names the reason", async () => {
		const handlers: Array<(event: never, ctx: never) => unknown> = [];
		const pi = {
			logger: { info: () => undefined },
			on: (_event: string, handler: (event: never, ctx: never) => unknown) => handlers.push(handler),
		} as unknown as ExtensionAPI;
		openkaiFloor(pi);

		const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "ok-floor-run-")));
		const ctx = { cwd };
		const fire = (input: unknown) =>
			handlers[0]!({ toolName: "write", input } as never, ctx as never) as
				| { block?: boolean; reason?: string }
				| undefined;

		// DENY_FLOOR secret patterns block absolutely — inside temp too.
		const floorHit = fire({ path: ".env" }) as { block?: boolean; reason?: string };
		expect(floorHit?.block).toBe(true);
		expect(floorHit?.reason).toContain("deny floor");

		const secretInTmp = fire({ path: path.join(tmpdir(), "staging", "id_ed25519") }) as {
			block?: boolean;
			reason?: string;
		};
		expect(secretInTmp?.block).toBe(true);
		expect(secretInTmp?.reason).toContain("deny floor");

		// Clean write inside the working folder passes.
		const clean = fire({ path: "src/app.ts" });
		expect(clean).toBeUndefined();

		// Temp scratch passes containment (the upstream SDK sandbox contract).
		const scratch = fire({ path: path.join(tmpdir(), "ok-scratch", "x.txt") });
		expect(scratch).toBeUndefined();
	});
});

describe("E022 Inc 06 (REN-04): the temp exemption is bounded", () => {
	test("a broad TMPDIR (home as temp root) disables the exemption", () => {
		const realCwd = realpathSync(path.join(import.meta.dir, "..", "src"));
		const home = realpathSync(process.env.HOME ?? "");
		const saved = process.env.TMPDIR;
		process.env.TMPDIR = home;
		resetTmpdirCacheForTest();
		try {
			// Containment is back ON: a target outside the cwd under the home
			// is denied again — the exemption must not swallow the real tree.
			expect(outsideCwd(realCwd, path.join(home, "Documents", "secret-plans.md"))).toBe(true);
		} finally {
			if (saved === undefined) delete process.env.TMPDIR;
			else process.env.TMPDIR = saved;
			resetTmpdirCacheForTest();
		}
	});

	test("the platform temp root keeps the exemption (SDK sandbox contract)", () => {
		const realCwd = realpathSync(path.join(import.meta.dir, "..", "src"));
		resetTmpdirCacheForTest();
		expect(outsideCwd(realCwd, path.join(tmpdir(), "sdk-sandbox", "x.txt"))).toBe(false);
	});
});
