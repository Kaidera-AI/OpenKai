/**
 * E021 F3 — magic keywords gate: before_agent_start detects the keywords in
 * standalone prose and returns the hidden fusion-routing message; plain text
 * and code-span mentions stay untouched.
 */

import { describe, expect, test } from "bun:test";

import { loadCapability } from "../src/capability/index.js";
import { extensionModuleCapability } from "../src/capability/extension-module.js";
import type { ExtensionAPI } from "../src/extensibility/extensions/types.js";

await import("../src/discovery/index.js");
const { default: openkaiKeywords } = await import("../src/openkai/keywords-extension.js");

describe("E021 F3: magic keywords → fusion routing", () => {
  test("registers as an extension module", async () => {
    const result = await loadCapability(extensionModuleCapability.id, {
      cwd: process.cwd(),
      includeInvalid: true,
    } as never);
    const names = (result.items as unknown as Array<{ name: string }>).map((e) => e.name);
    expect(names).toContain("openkai-keywords");
  });

  test("ultrathink routes to the fusion tool; ultrareview to the diff review; prose discipline holds", async () => {
    const handlers: Array<(event: never, ctx: never) => unknown> = [];
    const pi = {
      logger: { info: () => undefined },
      on: (_event: string, handler: (event: never, ctx: never) => unknown) => handlers.push(handler),
    } as unknown as ExtensionAPI;
    openkaiKeywords(pi);
    const fire = (prompt: string) => handlers[0]!({ prompt } as never, {} as never) as { message?: { content: string } } | undefined;

    const think = fire("ultrathink about the retry policy");
    expect(think?.message?.content).toContain("fusion tool");

    const review = fire("ultrareview my last change");
    expect(review?.message?.content).toContain("ADVERSARIAL");

    expect(fire("tell me about ultrathink.ts")).toBeUndefined();
    expect(fire("Ultrathink is a proper noun here")).toBeUndefined();
    expect(fire("a plain prompt")).toBeUndefined();
  });
});
