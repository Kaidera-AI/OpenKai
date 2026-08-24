/**
 * openkai/cortex-memory (E021 F1) — the Cortex memory seam for the fork.
 * Owns the CortexClient + the FusionRunRecord artifact export surface
 * (fusion/telemetry.ts points here). The capability provider that exposes
 * cortex_search/cortex_record to the agent lands with the hook registration.
 */

import { Type } from "@oh-my-pi/omptype/typebox";
import { Text } from "@oh-my-pi/pi-tui";

import { registerProvider } from "../capability/index.js";
import { toolCapability } from "../capability/tool.js";
import { createSourceMeta } from "../discovery/helpers.js";
import type { CustomTool } from "../extensibility/custom-tools/types.js";

import { CortexClient } from "./cortex/client.js";

export type { CortexClient };

/** Resolve the Cortex client for this session, or undefined in local mode. */
export function cortexClientForSession(): CortexClient | undefined {
  const project = process.env.CORTEX_PROJECT;
  if (!project) return undefined;
  const baseUrl = process.env.CORTEX_API_URL ?? "http://localhost:8501";
  return new CortexClient({
    baseUrl,
    project,
    agent: process.env.OPENKAI_AGENT ?? "openkai",
  });
}

/** Whether the session runs Cortex-managed (managed mode, mirroring 0.1.9). */
export function cortexManaged(): boolean {
  return process.env.CORTEX_PROJECT !== undefined;
}

// ── The memory tools (registered only in managed mode) ─────────────────────

const SearchParams = Type.Object({
  query: Type.String({ description: "What to look for in the project memory." }),
  limit: Type.Optional(Type.Number({ description: "Max results (default 5)." })),
});

const cortexSearchBase: CustomTool<typeof SearchParams> = {
  name: "cortex_search",
  label: "Cortex Search",
  description:
    "Search the shared project memory (Cortex) — past decisions, learnings, " +
    "handoffs, and work products from every agent on this project. Use before " +
    "re-deriving anything the project may already know.",
  parameters: SearchParams,
  loadMode: "discoverable",
  approval: "read",
  async execute(_id, params, _onUpdate, _ctx) {
    const client = cortexClientForSession();
    if (client === undefined) {
      return { content: [{ type: "text", text: "cortex_search: local mode (no CORTEX_PROJECT) — nothing to search" }] };
    }
    try {
      const results = await client.search(params.query, params.limit ?? 5);
      if (results.length === 0) {
        return { content: [{ type: "text", text: `cortex: no memory for "${params.query}"` }] };
      }
      const body = results
        .map((r, i) => `${i + 1}. [${r.source}] ${r.text.slice(0, 400)}`)
        .join("\n\n");
      return {
        content: [{ type: "text", text: `cortex memory (${results.length}):\n${body}` }],
        details: { count: results.length },
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `cortex_search failed: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
  renderResult: (result, _options, theme) =>
    new Text(theme.fg("accent", "◆ cortex memory") + "\n" + theme.fg("muted", "searched project memory"), 1, 0),
};

const RecordParams = Type.Object({
  learning: Type.String({ description: "The learning to record — one sentence, specific, durable." }),
});

const cortexRecordBase: CustomTool<typeof RecordParams> = {
  name: "cortex_record",
  label: "Cortex Record",
  description:
    "Record a durable learning into the shared project memory (Cortex) — " +
    "decisions, gotchas, and findings other agents should not rediscover. " +
    "Record when you learn something that cost you time.",
  parameters: RecordParams,
  loadMode: "discoverable",
  approval: "write",
  async execute(_id, params, _onUpdate, _ctx) {
    const client = cortexClientForSession();
    if (client === undefined) {
      return { content: [{ type: "text", text: "cortex_record: local mode (no CORTEX_PROJECT) — learning NOT recorded" }], isError: true };
    }
    try {
      await client.recordLearning(params.learning);
      return { content: [{ type: "text", text: "cortex: learning recorded to the project memory ✓" }] };
    } catch (error) {
      return {
        content: [{ type: "text", text: `cortex_record failed: ${error instanceof Error ? error.message : String(error)}` }],
        isError: true,
      };
    }
  },
  renderResult: (_result, _options, theme) =>
    new Text(theme.fg("success", "◆ cortex recorded"), 1, 0),
};

// Provenance paths the capability validator reads (loader-provided for user
// tools; built-ins declare their own).
const cortexSearch = Object.assign(cortexSearchBase, {
  path: "builtin:openkai/cortex-search",
  _source: createSourceMeta("openkai-cortex-memory", "builtin:openkai/cortex-search", "native" as never),
});
const cortexRecord = Object.assign(cortexRecordBase, {
  path: "builtin:openkai/cortex-record",
  _source: createSourceMeta("openkai-cortex-memory", "builtin:openkai/cortex-record", "native" as never),
});

// Self-register only when the session is Cortex-managed — in local mode the
// tools would exist purely to say no, so they stay out of the tool set.
if (cortexManaged()) {
  registerProvider(toolCapability.id, {
    id: "openkai-cortex-memory",
    displayName: "OpenKai",
    description: "OpenKai Cortex memory tools (openkai/cortex-memory layer)",
    priority: 90,
    load: () => Promise.resolve({ items: [cortexSearch, cortexRecord], warnings: [] }),
  });
}
