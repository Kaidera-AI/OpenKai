/**
 * openkai/floor-extension (E021 F3) — the deny floor on the fork: an
 * extension `tool_call` handler that blocks gated calls touching protected
 * paths (the DENY_FLOOR list) or escaping the working folder. Absolute: no
 * approval surface, no autonomy level, no yolo mode lifts it — the block
 * reason names the pattern and the rule.
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { registerProvider } from "../capability/index.js";
import { extensionModuleCapability } from "../capability/extension-module.js";
import { createSourceMeta } from "../discovery/helpers.js";
import type { ExtensionAPI } from "../extensibility/extensions/types.js";

import { floorMatchFor, outsideCwd } from "./gate-floor.js";

/** Tools whose args carry a path worth floor-checking. */
const PATH_ARG_KEYS = ["path", "file", "filePath", "target", "targetPath", "outputPath"] as const;

function pathsFromArgs(args: unknown): string[] {
  if (args === null || typeof args !== "object") return [];
  const out: string[] = [];
  for (const key of PATH_ARG_KEYS) {
    const value = (args as Record<string, unknown>)[key];
    if (typeof value === "string") out.push(value);
  }
  return out;
}

/** The extension factory — the runtime calls this with the API surface. */
export default function openkaiFloor(pi: ExtensionAPI): void {
  pi.on("tool_call", (event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    const input: unknown = "input" in event ? event.input : undefined;

    for (const target of pathsFromArgs(input)) {
      if (outsideCwd(cwd, target)) {
        return {
          block: true,
          reason: `openkai deny floor: ${target} is outside the working folder (${cwd}) — no approval surface can lift this`,
        };
      }
      const floor = floorMatchFor(cwd, target);
      if (floor !== undefined) {
        return {
          block: true,
          reason: `openkai deny floor: ${target} matches protected path "${floor}" — refused absolutely (never prompted)`,
        };
      }
    }
    return undefined;
  });
}

// Self-register as an extension module (the sanctioned seam).
const modulePath = fileURLToPath(import.meta.url);
registerProvider(extensionModuleCapability.id, {
  id: "openkai-floor",
  displayName: "OpenKai",
  description: "OpenKai deny floor (openkai/gate-floor layer)",
  priority: 95,
  load: () =>
    Promise.resolve({
      items: [
        {
          name: "openkai-floor",
          path: path.resolve(modulePath),
          level: "project" as const,
          _source: createSourceMeta("openkai-floor", path.resolve(modulePath), "project"),
        },
      ],
      warnings: [],
    }),
});
