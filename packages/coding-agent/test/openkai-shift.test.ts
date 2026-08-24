/**
 * E021 F2 gate — the shift extension: registers as an extension module, feeds
 * tool signals to the Orchestrator, flips drive setModel + the status chip.
 */

import { describe, expect, test } from "bun:test";

import { loadCapability } from "../src/capability/index.js";
import { extensionModuleCapability } from "../src/capability/extension-module.js";
import type { ExtensionModule } from "../src/capability/extension-module.js";
import type { ExtensionAPI } from "../src/extensibility/extensions/types.js";

// Pull the registration side effect in the same module graph as the test.
await import("../src/discovery/index.js");
const { default: openkaiShift } = await import("../src/openkai/shift-extension.js");

describe("E021 F2: shift extension on the fork", () => {
  test("self-registers as an extension module", async () => {
    const result = await loadCapability<ExtensionModule>(extensionModuleCapability.id, {
      cwd: process.cwd(),
      includeInvalid: true,
    } as never);
    const names = result.items.map((e: ExtensionModule) => e.name);
    expect(names).toContain("openkai-shift");
  });

  test("tool signals drive the orchestrator; a flip sets the status chip + the model", async () => {
    const handlers = new Map<string, Array<(event: never, ctx: never) => unknown>>();
    const statuses = new Map<string, string | undefined>();
    const setModelCalls: unknown[] = [];
    const smol = { id: "smol-model", provider: "mock" };
    const slow = { id: "slow-model", provider: "mock" };
    const pi = {
      logger: { info: () => undefined },
      on: (event: string, handler: (event: never, ctx: never) => unknown) => {
        const list = handlers.get(event) ?? [];
        list.push(handler);
        handlers.set(event, list);
      },
    } as unknown as ExtensionAPI;

    openkaiShift(pi);

    const ctx = {
      cwd: process.cwd(),
      ui: { setStatus: (k: string, t: string | undefined) => statuses.set(k, t) },
      models: { resolve: (role: string) => (role === "smol" ? smol : role === "slow" ? slow : undefined) },
      model: smol,
      setModel: async (m: unknown) => {
        setModelCalls.push(m);
        return true;
      },
    };

    for (const h of handlers.get("session_start") ?? []) await h({} as never, ctx as never);
    for (const h of handlers.get("turn_start") ?? []) await h({} as never, ctx as never);
    expect(statuses.get("openkai-tier")).toMatch(/^t:(cap|eff)$/);

    // Corroborated distress: hard errors spin the score past the threshold —
    // the flip must drive setModel to the slow (capable) lane.
    for (let i = 0; i < 3; i += 1) {
      for (const h of handlers.get("tool_result") ?? []) {
        await h(
          { toolName: "bash", isError: true, resultText: "FATAL: out of memory, killed process" } as never,
          ctx as never,
        );
      }
    }
    // Let the async flushTier chain settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(setModelCalls.length).toBeGreaterThan(0);
    expect((setModelCalls[0] as { id: string }).id).toBe("slow-model");
    expect(statuses.get("openkai-tier")).toBe("t:cap");
  });
});
