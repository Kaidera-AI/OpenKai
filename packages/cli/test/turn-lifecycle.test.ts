/**
 * Turn lifecycle surface (E019 inc 04/05) — the aliveness contract:
 *
 *  1. The boot card collapses to a compact line on the first prompt.
 *  2. A turn with no thinking deltas leaves NO thinking row (lazy creation).
 *  3. A thinking turn pulses while live and settles at turn_end.
 *  4. The settled row (✓ elapsed · tokens · tok/s) closes every turn.
 *  5. A gated-tool denial names the tool, the target, and the remediation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxThinking } from "@earendil-works/pi-ai/providers/faux";
import { InProcessTransport, SessionStore } from "@kaidera/openkai-core";
import type { TUI } from "@earendil-works/pi-tui";

import { buildTuiApp, type TuiApp } from "../dist/tui/app.js";

function headlessTui(rows = 30): TUI {
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

async function buildApp(opts: { sessionId: string; thinking?: string }): Promise<{ app: TuiApp; transport: InProcessTransport }> {
  const faux = fauxProvider({});
  faux.setResponses([
    fauxAssistantMessage([
      ...(opts.thinking !== undefined ? [fauxThinking(opts.thinking)] : []),
      fauxText("The answer."),
    ]),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  const transport = new InProcessTransport({
    sessionId: opts.sessionId,
    modelId: "faux-1",
    models,
    provider: "faux",
    cwd: process.cwd(),
  });
  // mkdtemp: unique root per run. A fixed /tmp/ok-lifecycle-<sessionId> collides between
  // concurrent worktrees and raises SessionLockError -- a false-red gate, not a
  // real failure. Session ID constants are kept verbatim; only the ROOT varies.
  // ponytail: root only, no cleanup -- the lock is pid-liveness-checked so stale
  // dirs are inert; add a finally-rm if /tmp pressure ever matters.
  const sessionsRoot = await mkdtemp(path.join(tmpdir(), "ok-lifecycle-"));
  const store = new SessionStore({ root: sessionsRoot, sessionId: opts.sessionId });
  await store.ensure();
  const app = buildTuiApp(headlessTui(), {
    transport,
    modelId: "faux-1",
    sessionId: opts.sessionId,
    persistMode: "local",
    store,
    sessionsRoot,
  });
  return { app, transport };
}

test("boot card collapses on first submit; settled row closes the turn", async () => {
  const { app, transport } = await buildApp({ sessionId: "cycle-collapse" });
  const before = app.transcript.blockTexts().join("\n");
  assert.ok(before.includes("providers"), "boot capability row present before the first prompt");

  const consumePromise = app.controller.consume().catch(() => undefined);
  await app.controller.submit("hello");
  await transport.close();
  await consumePromise;

  const after = app.transcript.blockTexts().join("\n");
  assert.ok(!after.includes("providers"), "boot chrome gone after the first prompt");
  assert.ok(after.includes("OpenKai") && after.includes("Kaidera"), "the compact brand line remains");
  assert.ok(/✓ settled in \d+\.\ds/.test(after), "the settled row closes the turn");
  assert.ok(!app.transcript.blockKinds().includes("thinking"), "no thinking deltas → no thinking row");
});

test("thinking row pulses while live and settles at turn_end", async () => {
  const { app, transport } = await buildApp({ sessionId: "cycle-pulse", thinking: "reasoning here" });
  const consumePromise = app.controller.consume().catch(() => undefined);
  await app.controller.submit("q");
  await transport.close();
  await consumePromise;

  const kinds = app.transcript.blockKinds();
  assert.ok(kinds.includes("thinking"), "thinking row exists when deltas arrived");
  const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
  const frame = app.root.render(80).map(strip).join("\n");
  assert.ok(frame.includes("⤷ thinking… 14 chars"), "settled static summary at turn end");
  assert.ok(!/✻|✼|❉|❊/.test(frame), "no live pulse glyph after settle");
});

test("a denied tool result surfaces tool, target, and remediation to the operator", async () => {
  const { app, transport } = await buildApp({ sessionId: "cycle-denied" });
  app.controller.applyEvent({
    kind: "tool_call",
    toolCallId: "tc-1",
    toolName: "bash",
    args: { command: "rm -rf /tmp/x" },
  } as never);
  app.controller.applyEvent({
    kind: "tool_result",
    toolCallId: "tc-1",
    toolName: "bash",
    result: {
      content: [{ type: "text", text: "Permission denied: deny — path outside working directory" }],
      details: { command: "rm -rf /tmp/x", denied: true },
    },
    isError: true,
  } as never);
  const text = app.transcript.blockTexts().join("\n");
  assert.ok(text.includes("permission denied: bash"), "the denial names the tool");
  assert.ok(text.includes("rm -rf /tmp/x"), "the denial names the target");
  assert.ok(text.includes("path outside working directory"), "the denial carries the reason");
  assert.ok(text.includes("/autonomy"), "the denial names the remediation surface");
  await transport.close();
});
