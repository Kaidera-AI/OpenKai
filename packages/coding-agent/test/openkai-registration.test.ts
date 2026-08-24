/**
 * E021 F1 registration gate — importing the fork's discovery index must
 * self-register the OpenKai layer on the tool capability: the fusion tool
 * always, the Cortex memory tools when CORTEX_PROJECT is set.
 */

import { describe, expect, test } from "bun:test";

import { loadCapability } from "../src/capability/index.js";
import { toolCapability } from "../src/capability/tool.js";
import type { CustomTool } from "../src/extensibility/custom-tools/types.js";

describe("E021 F1: OpenKai layer registration", () => {
  test("the fusion tool self-registers via the tool capability", async () => {
    await import("../src/discovery/index.js");
    const result = await loadCapability<CustomTool>(toolCapability.id, { cwd: process.cwd(), includeInvalid: true } as never);
    const names = result.items.map((t: CustomTool) => t.name);
    expect(names).toContain("fusion");
  });

  test("the cortex tools register in managed mode and stay out in local mode", async () => {
    const managed = process.env.CORTEX_PROJECT !== undefined;
    await import("../src/discovery/index.js");
    const result = await loadCapability<CustomTool>(toolCapability.id, { cwd: process.cwd(), includeInvalid: true } as never);
    const names = result.items.map((t: CustomTool) => t.name);
    if (managed) {
      expect(names).toContain("cortex_search");
      expect(names).toContain("cortex_record");
    } else {
      expect(names).not.toContain("cortex_search");
      expect(names).not.toContain("cortex_record");
    }
  });
});
