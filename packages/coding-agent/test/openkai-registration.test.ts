/**
 * E021 registration gate (rewired): the OpenKai layer attaches through
 * sdk.ts's inlineExtensions seam — the live session's tool/extension set,
 * not the file-discovery surface. Assert the layer's live shape directly.
 */

import { describe, expect, test } from "bun:test";

import { openkaiBuiltinTools, openkaiFloor, openkaiKeywords, openkaiShift } from "../src/openkai/index.js";

describe("E021: the OpenKai layer's live surface", () => {
  test("the built-in tool set: fusion + RLM always; cortex iff managed", () => {
    const tools = openkaiBuiltinTools();
    const names = tools.map((t) => t.name);
    expect(names).toContain("fusion");
    expect(names).toContain("rlm_spawn");
    expect(names).toContain("rlm_collect");
    const managed = process.env.CORTEX_PROJECT !== undefined;
    expect(names.includes("cortex_search")).toBe(managed);
    expect(names.includes("cortex_record")).toBe(managed);
    // Every tool carries the loader's provenance field.
    for (const tool of tools) {
      expect(typeof (tool as { path?: string }).path).toBe("string");
    }
  });

  test("the three extension factories are functions (attach via inlineExtensions)", () => {
    expect(typeof openkaiShift).toBe("function");
    expect(typeof openkaiFloor).toBe("function");
    expect(typeof openkaiKeywords).toBe("function");
  });
});
