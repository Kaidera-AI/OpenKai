/**
 * E019 consolidation folds — the two research-ledger items designated for 0.1.9:
 *
 *  1. doom-loop guard (opencode permission pattern, p4b §7 deferred): the same
 *     gated call 3× consecutively forces the ask path — through autonomy high,
 *     a persisted allow policy, and the session always-cache.
 *  2. Session-log invariant (OK-11 folding plan Phase 0): model-visible means
 *     logged — every user message, assistant content, tool call and tool result
 *     of a scripted turn appears in the session entries.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { SessionPermissionGate, type PushPermissionEvent } from "@kaidera/openkai-core";
import { createModels } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { InProcessTransport, SessionStore } from "@kaidera/openkai-core";
import { Type, type Static } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";

// ── 1. doom-loop guard ──────────────────────────────────────────────────────

function buildGate(cwd: string, requests: Array<{ requestId: string; rule?: string }>): SessionPermissionGate {
  const pushEvent: PushPermissionEvent = (event) => {
    requests.push({ requestId: event.requestId, rule: event.rule });
  };
  const gate = new SessionPermissionGate({ cwd, pushEvent });
  gate.setAutonomy("high"); // the guard must hold even at full access
  return gate;
}

const preview = () => ({ kind: "command" as const, command: "npm test", cwd: "/proj" });

test("doom loop: the third identical gated call forces the ask path", async () => {
  const requests: Array<{ requestId: string; rule?: string }> = [];
  const gate = buildGate("/proj", requests);
  const args = { command: "npm test" };

  // autonomy high — calls 1 and 2 auto-approve.
  const first = await gate.request("bash", "tc-1", args, preview);
  assert.equal(first.decision, "approve", "first call auto-approves at autonomy high");
  const second = await gate.request("bash", "tc-2", args, preview);
  assert.equal(second.decision, "approve", "second call auto-approves");
  assert.equal(requests.length, 0, "no prompts yet");

  // Third identical call: doomed — the ask path fires and blocks.
  const third = gate.request("bash", "tc-3", args, preview);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(requests.length, 1, "the doom prompt fired");
  assert.match(requests[0]!.rule ?? "", /doom loop/);
  gate.respond(requests[0]!.requestId, "reject");
  const outcome = await third;
  assert.equal(outcome.decision, "reject", "operator refusal settles the loop");
});

test("doom loop: a different call resets the run", async () => {
  const requests: Array<{ requestId: string; rule?: string }> = [];
  const gate = buildGate("/proj", requests);
  await gate.request("bash", "tc-1", { command: "npm test" }, preview);
  await gate.request("bash", "tc-2", { command: "npm test" }, preview);
  await gate.request("bash", "tc-3", { command: "npm run build" }, preview); // different — resets
  const fourth = await gate.request("bash", "tc-4", { command: "npm run build" }, preview);
  assert.equal(fourth.decision, "approve", "no doom after a reset");
  assert.equal(requests.length, 0);
});

// ── 2. session-log invariant (OK-11 Phase 0) ────────────────────────────────

const EchoParams = Type.Object({ msg: Type.String() });
const echoTool: AgentTool = {
  name: "echo",
  label: "Echo",
  description: "Echo the msg argument back.",
  parameters: EchoParams,
  async execute(_id: string, params: unknown): Promise<AgentToolResult<unknown>> {
    const msg = (params as Static<typeof EchoParams>).msg;
    const content: TextContent[] = [{ type: "text", text: msg }];
    return { content, details: { msg } };
  },
};

test("session-log invariant: every model-visible piece of the turn is logged", async () => {
  const { buildTuiApp } = await import("../dist/tui/app.js");
  const faux = fauxProvider({});
  faux.setResponses([
    fauxAssistantMessage([fauxText("Calling echo."), fauxToolCall("echo", { msg: "marker-7" })]),
    fauxAssistantMessage([fauxText("Echo returned marker-7.")]),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  const transport = new InProcessTransport({
    sessionId: "log-invariant",
    modelId: "faux-1",
    models,
    provider: "faux",
    tools: [echoTool],
    cwd: process.cwd(),
  });
  const root = "/tmp/ok-log-invariant";
  const store = new SessionStore({ root, sessionId: "log-invariant" });
  await store.ensure();
  const noop = (): void => {};
  const tui = {
    terminal: { rows: 30, columns: 80 },
    mode: "fullscreen",
    children: [],
    addChild: noop,
    getShowHardwareCursor: () => false,
    setFocus: noop,
    showOverlay: noop,
    hideOverlay: noop,
    hasOverlay: () => false,
    start: noop,
    stop: noop,
    requestRender: noop,
    addInputListener: () => () => {},
    invalidate: noop,
    render: () => [],
  } as unknown as import("@earendil-works/pi-tui").TUI;
  const app = buildTuiApp(tui, {
    transport,
    modelId: "faux-1",
    sessionId: "log-invariant",
    persistMode: "local",
    store,
    sessionsRoot: root,
  });

  const consume = app.controller.consume().catch(() => undefined);
  await app.controller.submit("run echo please");
  await transport.close();
  await consume;
  // persistTurn is fire-and-forget at turn_end — let it land.
  await new Promise((resolve) => setTimeout(resolve, 300));

  const entries = await store.readEntries();
  const serialised = JSON.stringify(entries);
  assert.ok(serialised.includes("run echo please"), "the user message is logged");
  assert.ok(serialised.includes("Calling echo."), "the assistant text is logged");
  assert.ok(serialised.includes("marker-7"), "the tool call args + result content are logged");
  assert.ok(entries.some((e) => e.type === "message"), "message entries exist");
});
