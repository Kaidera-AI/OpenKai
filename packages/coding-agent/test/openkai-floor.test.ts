/**
 * E021 F3 gate — the deny floor extension: protected paths and out-of-folder
 * writes block absolutely, with the pattern named; clean calls pass through.
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadCapability } from "../src/capability/index.js";
import { extensionModuleCapability } from "../src/capability/extension-module.js";
import type { ExtensionAPI } from "../src/extensibility/extensions/types.js";

await import("../src/discovery/index.js");
const { default: openkaiFloor } = await import("../src/openkai/floor-extension.js");
import { floorMatchFor, outsideCwd } from "../src/openkai/gate-floor.js";

describe("E021 F3: the deny floor on the fork", () => {
  test("registers as an extension module", async () => {
    const result = await loadCapability(extensionModuleCapability.id, {
      cwd: process.cwd(),
      includeInvalid: true,
    } as never);
    const names = (result.items as Array<{ name: string }>).map((e) => e.name);
    expect(names).toContain("openkai-floor");
  });

  test("floor matcher: protected node + its contents + clean paths", () => {
    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "ok-floor-")));
    expect(floorMatchFor(cwd, ".env")).toBeDefined();
    expect(floorMatchFor(cwd, "secrets/id_ed25519_sk")).toBeDefined();
    expect(floorMatchFor(cwd, ".ssh")).toBeDefined(); // the node itself (F10)
    expect(floorMatchFor(cwd, ".ssh/config")).toBeDefined();
    expect(floorMatchFor(cwd, "src/app.ts")).toBeUndefined();
    expect(outsideCwd(cwd, "src/app.ts")).toBe(false);
    expect(outsideCwd(cwd, "../outside.ts")).toBe(true);
  });

  test("the handler blocks floor + outside-cwd, passes clean, and names the reason", async () => {
    const handlers: Array<(event: never, ctx: never) => unknown> = [];
    const pi = {
      logger: { info: () => undefined },
      on: (_event: string, handler: (event: never, ctx: never) => unknown) => handlers.push(handler),
    } as unknown as ExtensionAPI;
    openkaiFloor(pi);

    const cwd = realpathSync(mkdtempSync(path.join(tmpdir(), "ok-floor-run-")));
    const ctx = { cwd };
    const fire = (input: unknown) => handlers[0]!({ toolName: "write", input } as never, ctx as never) as { block?: boolean; reason?: string } | undefined;

    const floorHit = fire({ path: ".env" }) as { block?: boolean; reason?: string };
    expect(floorHit?.block).toBe(true);
    expect(floorHit?.reason).toContain("deny floor");

    const outside = fire({ path: "../somewhere-else/x.txt" }) as { block?: boolean; reason?: string };
    expect(outside?.block).toBe(true);
    expect(outside?.reason).toContain("outside the working folder");

    const clean = fire({ path: "src/app.ts" });
    expect(clean).toBeUndefined();
  });
});
