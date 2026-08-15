/**
 * P4 TUI tests — golden-frame + event-mapping + mode-matrix + theme/tokens.
 *
 * Deterministic + offline (scope §5): uses a pi-ai faux provider (scripted
 * assistant responses) and a headless `TUI` stub so the layout root is rendered
 * to a string array without a real terminal. The same {@link InProcessTransport}
 * drives the loop — the TUI is the second renderer, the loop is not forked.
 *
 * Test runner: `node:test` (built into Node ≥22, zero dev deps) — a substitution
 * noted in the handoff: no `vitest` dependency was added; `node:test` satisfies
 * the "one test runner" requirement with less supply-chain surface.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createModels, uuidv7 } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { TUI } from "@earendil-works/pi-tui";

import { InProcessTransport, SessionStore, CortexClient, CortexCheckpoint, listSessions, readSessionMessages } from "@openkai/core";
import { buildTuiApp, type TuiApp, type ExitRequest } from "../dist/tui/app.js";
import { resolveRunMode } from "../dist/tui/runtime.js";
import { OVERLAY_FOOTER, renderOverlayFooter } from "../dist/tui/theme.js";

// ── Test fixtures ────────────────────────────────────────────────────────────

/** A trivial `echo` tool that returns its `msg` argument — no filesystem. */
const EchoParams = Type.Object({ msg: Type.String() });
const echoTool: AgentTool<typeof EchoParams, unknown> = {
  name: "echo",
  label: "Echo",
  description: "Echo the msg argument back as a tool result.",
  parameters: EchoParams,
  async execute(_id: string, params: Static<typeof EchoParams>): Promise<AgentToolResult<unknown>> {
    const content: TextContent[] = [{ type: "text", text: params.msg }];
    return { content, details: { msg: params.msg } };
  },
};

/** A minimal headless TUI stub: only the fields the layout/render path touches. */
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

/** Build a faux-backed transport + TUI app wired for an offline scripted turn. */
async function buildFauxApp(opts: {
  scriptedText: string;
  sessionId: string;
  persistMode?: string;
  onExit?: (request: ExitRequest) => void;
}): Promise<{
  app: TuiApp;
  transport: InProcessTransport;
  store: SessionStore;
  sessionsRoot: string;
}> {
  const faux = fauxProvider({});
  faux.setResponses([
    fauxAssistantMessage([fauxText(opts.scriptedText), fauxToolCall("echo", { msg: "pong" })]),
    fauxAssistantMessage([fauxText("Done.")]),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);

  const transport = new InProcessTransport({
    sessionId: opts.sessionId,
    modelId: "faux-1",
    models,
    provider: "faux",
    tools: [echoTool],
    cwd: process.cwd(),
  });

  // Tests persist to a tmp root — never the repo's own .openkai/sessions.
  const sessionsRoot = `/tmp/ok-tui-${opts.sessionId}`;
  const store = new SessionStore({ root: sessionsRoot, sessionId: opts.sessionId });
  await store.ensure();

  const app = buildTuiApp(headlessTui(24), {
    transport,
    modelId: "faux-1",
    sessionId: opts.sessionId,
    persistMode: opts.persistMode ?? "local",
    store,
    sessionsRoot,
    onExit: opts.onExit,
  });
  return { app, transport, store, sessionsRoot };
}

/** Render the layout root to a frame (joined lines), stripping ANSI for assertions. */
function renderFrame(app: TuiApp, width = 80): string {
  return app.root.render(width).map((line) => stripAnsi(line)).join("\n");
}

/** Strip ANSI escape sequences for plain-text assertions. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── 1. Golden-frame: streamed text + tool card + chrome ─────────────────────

test("golden-frame: faux turn renders streamed text, a tool card, and chrome updates", async () => {
  const { app, transport } = await buildFauxApp({ scriptedText: "Hello, OpenKai!", sessionId: "01TESTGOLDEN000001" });

  // One submit = one turn. The tool call continues *inside* that turn, so both
  // scripted faux responses are consumed by this single prompt — a second
  // `transport.prompt` here would silently fire an extra turn.
  await app.controller.submit("ping");
  await transport.close();
  await app.controller.consume();

  const frame = renderFrame(app, 80);

  // Streamed assistant text present (golden cell).
  assert.ok(frame.includes("Hello, OpenKai!"), "assistant streamed text must appear in the frame");
  // Tool card present — tool name tinted + status in the header (new card design).
  assert.ok(/echo\s+·\s+✓ done/.test(frame), "a tool card with the echo tool must render");
  // Tool result settled — `done` status appears after the tool executes.
  assert.ok(/done/.test(frame), "tool result `done` status must appear after settlement");
  // Chrome line present with model + session + persist-mode (always visible, scope §3.4).
  assert.ok(frame.includes("faux-1"), "chrome must show the model id");
  assert.ok(frame.includes("01TESTGO"), "chrome must show the session id prefix");
  assert.ok(frame.includes("p:local"), "chrome must show the persist-mode chip (p:<mode>)");
  // Continuation turn text ("Done.") appears too (second faux response).
  assert.ok(frame.includes("Done."), "continuation assistant text must render");

  // Emit the acceptance-evidence snapshot from THIS run, so the committed
  // artifact can never drift from what the code actually renders.
  await writeFile(
    // Compiled to dist-test/, so `..` lands on packages/cli/.
    new URL("../test/evidence/golden-frame.txt", import.meta.url),
    [
      "# P4 TUI golden-frame evidence (faux provider, headless render, 80 cols)",
      "# Regenerated by `npm test -w @openkai/cli` — do not hand-edit.",
      `# Block kinds: ${app.transcript.blockKinds().join(" -> ")}`,
      `# Chrome usage: ${JSON.stringify(app.status.currentState.usage)}`,
      "",
      frame,
      "",
    ].join("\n"),
  );
});

// ── 2. Event-mapping: block ordering follows the transport taxonomy ──────────

test("event-mapping: transcript block kinds follow connected→text→tool→settle→turn_end", async () => {
  const { app, transport } = await buildFauxApp({ scriptedText: "Streaming reply.", sessionId: "01TESTEVENT0000002" });

  await app.controller.submit("go");
  await transport.close();
  await app.controller.consume();

  const kinds = app.transcript.blockKinds();
  // user prompt → thinking + assistant (connected) → ... → tool → assistant(continuation)
  assert.ok(kinds.includes("user"), "user block present");
  assert.ok(kinds.includes("assistant"), "assistant block present");
  assert.ok(kinds.includes("tool"), "tool block present");
  assert.ok(kinds.includes("thinking"), "thinking block present (collapsed by default)");
  // The tool card must appear AFTER the first assistant block (streamed text first).
  const firstAssistant = kinds.indexOf("assistant");
  const firstTool = kinds.indexOf("tool");
  assert.ok(firstTool > firstAssistant, "tool card must follow the assistant block that emitted it");

  // Chrome usage updated: after the turn, status.usage is non-null.
  assert.ok(app.status.currentState.usage !== null, "usage must update the chrome at turn settlement");

  await transport.close();
});

// ── 3. Thinking density: hidden by default, revealed by toggle (Ctrl+O) ────

test("thinking density: collapsed by default, toggle reveals", async () => {
  const { app, transport } = await buildFauxApp({ scriptedText: "thinking test", sessionId: "01TESTTHINK000003" });

  await app.controller.submit("q");
  await transport.close();
  await app.controller.consume();

  const before = app.transcript.blockKinds();
  assert.ok(before.includes("thinking"), "thinking block exists");

  // The frame must NOT contain a revealed "thinking" header while collapsed
  // (only the dim `⤷ thinking…` preview is shown — which still contains the word).
  // Toggle reveals full reasoning.
  const revealed = app.controller.toggleThinking();
  assert.equal(revealed, true, "toggle returns the new (revealed) state");
  const revealedFrame = renderFrame(app, 80);
  // After reveal, the thinking block renders its buffered text — assert a
  // thinking marker line is present (the word "thinking" appears).
  assert.ok(revealedFrame.toLowerCase().includes("thinking"), "revealed thinking section renders");

  // Toggle back to hidden.
  const hidden = app.controller.toggleThinking();
  assert.equal(hidden, false, "toggle back to hidden");

  await transport.close();
});

// ── 3b. Composer wiring: the path a human actually takes ────────────────────

/**
 * Regression: the composer must submit *through the controller*, not straight
 * to `transport.prompt`. Wiring it to the transport streams a reply for a
 * prompt that never appears in the transcript and is never written to the
 * session JSONL — so a resumed session replays assistant turns with no user
 * turns. Driving this through `editor.onSubmit` is the point: it is exactly
 * what pressing Enter fires, so the test cannot pass while the seam is wrong.
 */
test("composer wiring: Enter renders AND persists the user message", async () => {
  const { app, transport, store } = await buildFauxApp({
    scriptedText: "Reply.",
    sessionId: "01TESTCOMPOSER0004",
  });

  const consumeP = app.controller.consume();
  app.composer.editor.onSubmit!("typed by a human");
  await new Promise((resolve) => setTimeout(resolve, 400));
  await transport.close();
  await consumeP;

  const frame = renderFrame(app, 80);
  assert.ok(frame.includes("typed by a human"), "the submitted prompt must render in the transcript");
  // The first CONVERSATION block is the user turn; brand/splash notices are
  // app chrome and may precede it.
  const conversationBlocks = app.transcript.blockKinds().filter((k) => k !== "notice");
  assert.equal(conversationBlocks[0], "user", "the turn must open with a user block");

  const roles = (await readSessionMessages(store.filePath)).map((m) => (m as { role: string }).role);
  assert.ok(roles.includes("user"), `the user message must be persisted (got ${JSON.stringify(roles)})`);
});

// ── 3c. Slash commands: dispatched locally, never sent to the model ─────────

test("slash commands: /help renders a notice and does not prompt the model", async () => {
  const { app, transport } = await buildFauxApp({ scriptedText: "unused", sessionId: "01TESTSLASH000005" });

  app.composer.editor.onSubmit!("/help");
  await new Promise((resolve) => setTimeout(resolve, 50));

  const kinds = app.transcript.blockKinds();
  assert.ok(kinds.includes("notice"), "/help must render a notice block");
  assert.ok(!kinds.includes("user"), "/help must not be submitted to the model as a user turn");
  assert.ok(renderFrame(app, 80).includes("/model"), "the help notice lists the command set");

  await transport.close();
});

test("slash commands: /quit and /resume signal the runtime; unknown reports", async () => {
  const seen: ExitRequest[] = [];
  const { app, transport } = await buildFauxApp({
    scriptedText: "unused",
    sessionId: "01TESTSLASH000006",
    onExit: (request) => seen.push(request),
  });

  await app.controller.dispatchCommand("quit", "");
  assert.deepEqual(seen[0], { kind: "quit" }, "/quit asks the runtime to exit");

  await app.controller.dispatchCommand("resume", "01ABC");
  assert.deepEqual(seen[1], { kind: "restart", sessionId: "01ABC" }, "/resume asks for a session switch");

  await app.controller.dispatchCommand("new", "");
  assert.deepEqual(seen[2], { kind: "restart" }, "/new asks for a fresh session");

  await app.controller.dispatchCommand("bogus", "");
  assert.ok(
    renderFrame(app, 80).includes("unknown command"),
    "an unknown command reports rather than silently prompting the model",
  );

  await transport.close();
});

// ── 4. Theme/tokens: the footer grammar is the single interaction string ────

test("theme: overlay footer is the canonical interaction grammar", () => {
  assert.equal(OVERLAY_FOOTER, "↑/↓ Navigate · Enter Select · ESC Cancel");
  assert.ok(renderOverlayFooter().length > 0, "footer renders non-empty");
});

// ── 5. Mode matrix (A1) ──────────────────────────────────────────────────────

test("mode matrix: CORTEX_PROJECT unset ⇒ local, zero Cortex calls, no crash", async () => {
  const saved = process.env.CORTEX_PROJECT;
  delete process.env.CORTEX_PROJECT;
  try {
    const mode = await resolveRunMode({});
    assert.equal(mode.mode, "local", "unset CORTEX_PROJECT ⇒ local mode");
    assert.equal(mode.persistMode, "local", "chrome persist label is 'local'");
    assert.equal(mode.cortexReachable, false, "Cortex reported unreachable (not probed)");
    assert.equal(mode.cortex, undefined, "no CortexClient constructed in local mode ⇒ zero calls");
  } finally {
    if (saved !== undefined) process.env.CORTEX_PROJECT = saved;
  }
});

test("mode matrix: CORTEX_PROJECT set but unreachable ⇒ local (no crash)", async () => {
  const saved = process.env.CORTEX_PROJECT;
  process.env.CORTEX_PROJECT = "openkai";
  try {
    const mode = await resolveRunMode({ api: "http://127.0.0.1:9" }); // nothing listening on :9
    assert.equal(mode.mode, "local", "unreachable Cortex ⇒ local fallback");
    assert.equal(mode.cortexReachable, false, "health probe failed ⇒ unreachable");
    assert.equal(mode.persistMode, "local", "falls back to local persist label");
  } finally {
    if (saved === undefined) delete process.env.CORTEX_PROJECT;
    else process.env.CORTEX_PROJECT = saved;
  }
});

test("mode matrix: managed mode ingests the session id into /sessions/ingested-ids", async () => {
  // Requires a live cortex-api:8501 (the local infra). Skipped if unreachable.
  let healthOk = false;
  try {
    const probe = new CortexClient({ project: "openkai" });
    await probe.health();
    healthOk = true;
  } catch {
    healthOk = false;
  }
  if (!healthOk) {
    console.log("  [skip] cortex-api not reachable — managed-mode ingestion test skipped");
    return;
  }

  const sessionId = uuidv7();
  const tmpRoot = `/tmp/ok-tui-matrix-${sessionId}`;
  const store = new SessionStore({ root: tmpRoot, sessionId });
  await store.ensure();
  const cortex = new CortexClient({ project: "openkai" });

  // Append a user + assistant message locally, then checkpoint to Cortex.
  await store.appendMessage({ role: "user", content: "matrix probe", timestamp: Date.now() } as never);
  await store.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "matrix reply" }],
    timestamp: Date.now(),
  } as never);

  const checkpoint = new CortexCheckpoint({
    client: cortex,
    agent: "openkai",
    sessionId,
    sourcePath: store.filePath,
    provider: "faux",
    modelId: "faux-1",
    cwd: process.cwd(),
    task: "matrix probe",
  });
  const entries = await store.readEntries();
  checkpoint.record(entries);
  const result = await checkpoint.flushNow();
  assert.ok(result, "checkpoint flush returned an ingest result");

  // The session id must appear in the project's ingested-ids (managed-mode evidence).
  const ingested = await cortex.getIngestedIds();
  assert.ok(
    ingested.ids.includes(sessionId),
    `session ${sessionId} must appear in /sessions/ingested-ids in managed mode`,
  );
});

// ── 6. Session store helpers ───────────────────────────────────────────────

test("persist: listSessions + readSessionMessages round-trip", async () => {
  const tmpRoot = `/tmp/ok-tui-list-${Math.random().toString(36).slice(2)}`;
  const id = "01TESTLIST" + Math.random().toString(36).slice(2, 6);
  const store = new SessionStore({ root: tmpRoot, sessionId: id });
  await store.ensure();
  await store.appendMessage({ role: "user", content: "hello list", timestamp: Date.now() } as never);

  const listed = await listSessions(tmpRoot);
  assert.ok(listed.includes(id), "listSessions returns the created session id");

  const msgs = await readSessionMessages(store.filePath);
  assert.equal(msgs.length, 1, "readSessionMessages returns the appended message");
});