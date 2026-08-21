/**
 * Ultra-turn routing (E017 UK round 4) — the app-level contract:
 *
 *  1. ultrathink routes to the fusion panel with the hidden notice in the
 *     TASK payload; the transcript + store carry the text AS TYPED (the
 *     notice is hidden, OMP-style).
 *  2. Without a fusion runner the turn falls back to transport.prompt with
 *     the notice attached — never into the transcript echo.
 *  3. ultrareview refuses cleanly when the shadow has no diff.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai/providers/faux";
import { InProcessTransport, SessionStore } from "@kaidera/openkai-core";
import type { TUI } from "@earendil-works/pi-tui";

import { buildTuiApp, type TuiApp } from "../dist/tui/app.js";
import type { FuseResult } from "@kaidera/openkai-core";

function headlessTui(rows = 24): TUI {
  const noop = (): void => {};
  return {
    terminal: { rows, columns: 80 } as TUI["terminal"],
    mode: "fullscreen" as const,
    children: [] as unknown as TUI["children"],
    addChild: noop as unknown as TUI["addChild"],
    getShowHardwareCursor: () => false,
    setFocus: noop as unknown as TUI["setFocus"],
    showOverlay: noop as unknown as TUI["showOverlay"],
    hideOverlay: noop as unknown as TUI["hideOverlay"],
    hasOverlay: () => false,
    start: noop,
    stop: noop as unknown as TUI["stop"],
    requestRender: noop,
    addInputListener: (() => () => {}) as unknown as TUI["addInputListener"],
    invalidate: noop,
    render: () => [],
  } as unknown as TUI;
}

async function buildUltraApp(opts: {
  sessionId: string;
  runFusion?: (task: string) => Promise<FuseResult>;
  cwd?: string;
}): Promise<{ app: TuiApp; transport: InProcessTransport; store: SessionStore }> {
  const faux = fauxProvider({});
  faux.setResponses([fauxAssistantMessage([fauxText("deep answer")])]);
  const models = createModels();
  models.setProvider(faux.provider);
  const transport = new InProcessTransport({
    sessionId: opts.sessionId,
    modelId: "faux-1",
    models,
    provider: "faux",
    cwd: opts.cwd ?? process.cwd(),
  });
  // mkdtemp: unique root per run. A fixed /tmp/ok-ultra-<sessionId> collides between
  // concurrent worktrees and raises SessionLockError -- a false-red gate, not a
  // real failure. Session ID constants are kept verbatim; only the ROOT varies.
  // ponytail: root only, no cleanup -- the lock is pid-liveness-checked so stale
  // dirs are inert; add a finally-rm if /tmp pressure ever matters.
  const sessionsRoot = await mkdtemp(path.join(tmpdir(), "ok-ultra-"));
  const store = new SessionStore({ root: sessionsRoot, sessionId: opts.sessionId });
  await store.ensure();
  const app = buildTuiApp(headlessTui(24), {
    transport,
    modelId: "faux-1",
    sessionId: opts.sessionId,
    persistMode: "local",
    store,
    sessionsRoot,
    ...(opts.runFusion !== undefined ? { runFusion: opts.runFusion } : {}),
    ...(opts.cwd !== undefined ? { cwd: opts.cwd } : {}),
  });
  return { app, transport, store };
}

/** Minimal FuseResult fixture — one output + consensus synthesis, no gate. */
function fakeFusionResult(): FuseResult {
  return {
    runId: "run-ultra",
    outputs: [
      { role: "architect", modelId: "m-a", provider: "p", text: "think A", usage: undefined, latencyMs: 1 },
    ],
    synthesis: {
      consensus: ["combined verdict"],
      divergences: [],
      discarded: [],
      blindSpots: [],
      raw: "combined verdict",
      modelId: "m-j",
      usage: undefined,
    },
    gate: { outcome: "not-run", rounds: 0 },
    gateRuns: [],
    record: {} as unknown as FuseResult["record"],
  } as unknown as FuseResult;
}

test("ultrathink routes to the fusion panel; notice stays out of the transcript", async () => {
  const tasks: string[] = [];
  const { app, store, transport } = await buildUltraApp({
    sessionId: "ultra-think",
    runFusion: async (task) => {
      tasks.push(task);
      return fakeFusionResult();
    },
  });

  await app.controller.runUltraTurn("ultrathink about the cache invalidation", ["ultrathink"]);

  assert.equal(tasks.length, 1, "the fusion panel ran once");
  assert.ok(tasks[0]!.includes("ultrathink about the cache invalidation"), "the prompt is the task");
  assert.ok(tasks[0]!.includes("Multi-step reasoning"), "the hidden notice rides the payload");

  const entries = await store.readEntries();
  const userEntries = entries.filter((e) => e.type === "message" && (e as { message?: { role?: string } }).message?.role === "user");
  const lastUser = userEntries.at(-1) as { message: { content: unknown } } | undefined;
  const persisted = JSON.stringify(lastUser?.message.content ?? "");
  assert.ok(persisted.includes("ultrathink about the cache invalidation"), "visible text persisted");
  assert.ok(!persisted.includes("Multi-step reasoning"), "the notice NEVER persists — OMP semantics");

  const transcriptText = app.transcript.blockTexts().join("\n");
  assert.ok(!transcriptText.includes("Multi-step reasoning"), "the notice never renders");
  assert.ok(transcriptText.includes("combined verdict"), "the panel synthesis renders");
  await transport.close();
});

test("ultrathink without a fusion runner falls back to transport.prompt with the notice", async () => {
  const { app, transport } = await buildUltraApp({ sessionId: "ultra-fallback" });
  const prompts: string[] = [];
  const original = transport.prompt.bind(transport);
  transport.prompt = async (text: string) => {
    prompts.push(text);
    return original(text);
  };

  await app.controller.runUltraTurn("ultrathink through the retry storm", ["ultrathink"]);
  // Settle the scripted turn: close first, then drain (tui.test.ts pattern).
  await transport.close();
  await app.controller.consume().catch(() => undefined);

  assert.equal(prompts.length, 1, "single-model pass ran");
  assert.ok(prompts[0]!.includes("Multi-step reasoning"), "notice attached to the model payload");
  assert.ok(prompts[0]!.startsWith("ultrathink through the retry storm"), "visible text intact");
});

test("ultrareview refuses cleanly when the shadow has no diff", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const cwd = mkdtempSync(path.join(tmpdir(), "ok-ultra-review-"));
  const fusionCalls: string[] = [];
  const { app, transport } = await buildUltraApp({
    sessionId: "ultra-review",
    cwd,
    runFusion: async (task) => {
      fusionCalls.push(task);
      return fakeFusionResult();
    },
  });

  await app.controller.runUltraTurn("ultrareview my changes", ["ultrareview"]);

  assert.equal(fusionCalls.length, 0, "no panel run without a diff");
  const transcriptText = app.transcript.blockTexts().join("\n");
  assert.ok(transcriptText.includes("nothing to review"), "honest refusal renders");
  await transport.close();
});
