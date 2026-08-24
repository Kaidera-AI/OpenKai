/**
 * openkai/shift-extension (E021 F2) — switchyard routing on the fork: the
 * OpenKai Orchestrator reads tool/tool-call signals off the fork's event
 * stream, and when the tier flips, drives the session model through the
 * extension API. The tier chip lives in the status line via ui.setStatus.
 *
 * Self-registers on the extension-module capability (imported from
 * discovery/index.ts — the sanctioned touch-list entry).
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

import { registerProvider } from "../capability/index.js";
import { extensionModuleCapability } from "../capability/extension-module.js";
import { createSourceMeta } from "../discovery/helpers.js";
import type { ExtensionAPI } from "../extensibility/extensions/types.js";

import { Orchestrator, type ShiftPosture } from "./orchestrate.js";
import type { RoutingEvent } from "./shift/activity.js";
import type { TierInput } from "./shift/tier.js";

/** The tier → model-role mapping (fork roles: smol = efficient, slow = capable). */
const TIER_ROLE = { efficient: "smol", capable: "slow" } as const;

interface ShiftSettings {
  posture?: ShiftPosture;
  pins?: { floor?: Partial<Record<string, "efficient" | "capable">>; ceiling?: "efficient" | "capable"; never?: string[] };
  efficientModel?: string; // provider/id override for the efficient lane
  capableModel?: string; // provider/id override for the capable lane
}

function readShiftSettings(pi: ExtensionAPI): ShiftSettings {
  // The fork's settings surface: settings.get on a dotted path; our slice is
  // config["shift"] — same shape as the 0.84 line's config.json.
  const settings = (pi as unknown as { settings?: { get(key: string): unknown } }).settings;
  const raw = settings?.get("shift");
  if (typeof raw !== "object" || raw === null) return {};
  return raw as ShiftSettings;
}

/** The extension factory — the runtime calls this with the API surface. */
export default function openkaiShift(pi: ExtensionAPI): void {
  let orchestrator: Orchestrator | undefined;
  let lastTier: string | undefined;
  const signals: TierInput["signals"] = [];

  const flushTier = async (event: Pick<RoutingEvent, "tier" | "source" | "reason">, ctx: { ui: { setStatus(k: string, t: string | undefined): void }; models: { resolve(role: string): unknown }; model: { id: string } | undefined; setModel?: (m: unknown) => Promise<boolean> }): Promise<void> => {
    if (event.tier === lastTier) return;
    lastTier = event.tier;
    ctx.ui.setStatus("openkai-tier", `t:${event.tier === "capable" ? "cap" : "eff"}`);
    pi.logger.info?.(`openkai shift: tier=${event.tier} source=${event.source} — ${event.reason}`);
    // Drive the model when the flip names a lane the session isn't on.
    const role = TIER_ROLE[event.tier as keyof typeof TIER_ROLE];
    if (role === undefined) return;
    const target = ctx.models.resolve(role) ?? ctx.models.resolve("default");
    if (target !== undefined && ctx.model?.id !== (target as { id: string }).id && ctx.setModel !== undefined) {
      await ctx.setModel(target);
    }
  };

  pi.on("session_start", (_event, ctx) => {
    const cfg = readShiftSettings(pi);
    orchestrator = new Orchestrator({
      cwd: ctx.cwd ?? process.cwd(),
      castConfig: {},
      ...(cfg.posture !== undefined ? { posture: cfg.posture } : {}),
      ...(cfg.pins !== undefined ? { pins: cfg.pins } : {}),
      onActivity: (event) => {
        void flushTier(event, ctx);
      },
    });
    lastTier = undefined;
    signals.length = 0;
  });

  pi.on("tool_execution_start", (event) => {
    if (orchestrator === undefined) return;
    signals.push({ tool: event.toolName, resultText: "", isError: false });
    if (signals.length > 8) signals.shift();
  });

  pi.on("tool_result", (event, ctx) => {
    if (orchestrator === undefined) return;
    const resultText = "resultText" in event && typeof event.resultText === "string" ? event.resultText : "";
    signals.push({ tool: event.toolName, resultText: resultText.slice(0, 500), isError: event.isError === true });
    if (signals.length > 8) signals.shift();
    const decision = orchestrator.reevaluate({ signals: [...signals], turnDepth: 1, compacted: false });
    // reevaluate returns a decision only on a tier change.
    if (decision !== undefined) void flushTier(decision, ctx);
  });

  pi.on("turn_start", (_event, ctx) => {
    if (orchestrator === undefined) return;
    // First turn classification: no signals yet — the posture default decides.
    const decision = orchestrator.decide({ prompt: "" }, { signals: [], turnDepth: 0, compacted: false });
    void flushTier(decision, ctx);
  });
}

// Self-register as an extension module (the capability loader imports the
// path and calls the default export with the ExtensionAPI).
const modulePath = fileURLToPath(import.meta.url);
registerProvider(extensionModuleCapability.id, {
  id: "openkai-shift",
  displayName: "OpenKai",
  description: "OpenKai shift tier routing (openkai/shift layer)",
  priority: 90,
  load: () =>
    Promise.resolve({
      items: [
        {
          name: "openkai-shift",
          path: path.resolve(modulePath),
          level: "project" as const,
          _source: createSourceMeta("openkai-shift", path.resolve(modulePath), "project"),
        },
      ],
      warnings: [],
    }),
});
