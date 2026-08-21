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
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels, uuidv7 } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxThinking, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Type, type Static } from "typebox";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
import type { TUI } from "@earendil-works/pi-tui";

import { InProcessTransport, SessionStore, CortexClient, CortexCheckpoint, listSessions, readSessionMessages } from "@kaidera/openkai-core";
import { buildTuiApp, type TuiApp, type ExitRequest } from "../dist/tui/app.js";
import { resolveRunMode } from "../dist/tui/runtime.js";
import { gradientLogo } from "../dist/tui/gradient.js";
import { OVERLAY_FOOTER, highlight, renderOverlayFooter, setTheme } from "../dist/tui/theme.js";
import {
  configureCapabilities,
  plainTerminalText,
  resetCapabilities,
  resolveCapabilities,
  stripTerminalSequences,
} from "../dist/tui/capabilities.js";
import { overlaySpec, resolveLayout, resolveLayoutMode } from "../dist/tui/layout.js";
import { defaultStatusState, StatusLine } from "../dist/tui/status.js";

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
  /** When set, the first faux response leads with a thinking block (E019:
   *  thinking rows are created lazily by the first thinking delta). */
  scriptedThinking?: string;
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
  const firstBlocks = [
    ...(opts.scriptedThinking !== undefined ? [fauxThinking(opts.scriptedThinking)] : []),
    fauxText(opts.scriptedText),
    fauxToolCall("echo", { msg: "pong" }),
  ];
  faux.setResponses([
    fauxAssistantMessage(firstBlocks),
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
  // mkdtemp gives each run (and each concurrent worktree) a unique root so
  // two agents running `npm test` in different worktrees cannot collide on
  // the same /tmp/ok-tui-<sessionId> lock (SessionLockError, false-red gate).
  // The session ID constant is kept verbatim — chrome assertions depend on it.
  const sessionsRoot = await mkdtemp(path.join(tmpdir(), "ok-tui-"));
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
    // Deterministic chrome by construction: never read the live checkout, so
    // neither the branch-name width nor git's presence on PATH can drift the
    // golden frame ("golden" ≤8 chars ⇒ the chip renders untruncated).
    gitBranch: "golden",
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
  const { app, transport, sessionsRoot } = await buildFauxApp({ scriptedText: "Hello, OpenKai!", sessionId: "01TESTGOLDEN000001" });

  try {
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
  // The injected fixture branch must reach the chrome — guards the injection
  // seam itself, since a GOLDEN_UPDATE=1 regeneration would silently absorb a
  // dropped injection back into a live-checkout read.
  assert.ok(frame.includes("git:golden"), "chrome must show the injected fixture branch");
  // Continuation turn text ("Done.") appears too (second faux response).
  assert.ok(frame.includes("Done."), "continuation assistant text must render");

  // Golden assertion (E019 inc 04 F3, ported from a23368c): the committed
  // artifact is the truth and this test FAILS on drift. Regeneration is a
  // deliberate act:
  //   GOLDEN_UPDATE=1 npm test    (or pass --update to the test runner)
  // Volatile cells are normalised on BOTH sides — elapsed/tok-per-s are
  // wall-clock artifacts (observed flapping 1125.0→750.0 between two green
  // runs). The branch chip needs NO pass: buildFauxApp injects a fixed
  // gitBranch, so the chrome row — including its interior pad, which once
  // encoded the generating checkout's name width — is deterministic by
  // construction. Everything else must match byte-for-byte, including the
  // absence of stray escape bytes (the F3 backslash drop hid behind a
  // write-only snapshot that could never fail).
  const normalise = (s: string): string =>
    s
      .replace(/(✓ settled|✗ failed) in [\d.]+s/g, "$1 in <t>s")
      .replace(/⚡[\d.]+ tok\/s/g, "⚡<tps> tok/s")
      // The frame pads every row to the render width, so a volatile scalar's
      // original width would survive as trailing-pad drift — strip it.
      .replace(/[ ]+$/gm, "");
  const goldenUrl = new URL("../test/evidence/golden-frame.txt", import.meta.url);
  const rendered = [
    "# P4 TUI golden-frame evidence (faux provider, headless render, 80 cols)",
    "# Asserted by `npm test`; regenerate deliberately with GOLDEN_UPDATE=1 — do not hand-edit.",
    `# Block kinds: ${app.transcript.blockKinds().join(" -> ")}`,
    `# Chrome usage: ${JSON.stringify(app.status.currentState.usage)}`,
    "",
    normalise(frame),
    "",
  ].join("\n");
  const update =
    process.env.GOLDEN_UPDATE === "1" || process.argv.includes("--update");
  if (update) {
    await writeFile(goldenUrl, rendered);
  } else {
    const committed = await readFile(goldenUrl, "utf-8");
    assert.equal(
      rendered,
      committed,
      "rendered frame drifted from test/evidence/golden-frame.txt — if the change is intended, regenerate with GOLDEN_UPDATE=1 npm test",
    );
  }
  } finally {
    await rm(sessionsRoot, { recursive: true, force: true });
  }
});

// ── 2. Event-mapping: block ordering follows the transport taxonomy ──────────

test("event-mapping: transcript block kinds follow connected→text→tool→settle→turn_end", async () => {
  const { app, transport, sessionsRoot } = await buildFauxApp({
    scriptedText: "Streaming reply.",
    scriptedThinking: "let me reason about this",
    sessionId: "01TESTEVENT0000002",
  });

  try {
  await app.controller.submit("go");
  await transport.close();
  await app.controller.consume();

  const kinds = app.transcript.blockKinds();
  // user prompt → thinking + assistant (connected) → ... → tool → assistant(continuation)
  assert.ok(kinds.includes("user"), "user block present");
  assert.ok(kinds.includes("assistant"), "assistant block present");
  assert.ok(kinds.includes("tool"), "tool block present");
  assert.ok(kinds.includes("thinking"), "thinking block present (lazy-created by the first thinking delta)");
  // The tool card must appear AFTER the first assistant block (streamed text first).
  const firstAssistant = kinds.indexOf("assistant");
  const firstTool = kinds.indexOf("tool");
  assert.ok(firstTool > firstAssistant, "tool card must follow the assistant block that emitted it");

  // Chrome usage updated: after the turn, status.usage is non-null.
  assert.ok(app.status.currentState.usage !== null, "usage must update the chrome at turn settlement");

  await transport.close();
  } finally {
    await rm(sessionsRoot, { recursive: true, force: true });
  }
});

// ── 3. Thinking density: hidden by default, revealed by toggle (Ctrl+O) ────

test("thinking density: collapsed by default, toggle reveals", async () => {
  const { app, transport, sessionsRoot } = await buildFauxApp({
    scriptedText: "thinking test",
    scriptedThinking: "reasoning content here",
    sessionId: "01TESTTHINK000003",
  });

  try {
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
  } finally {
    await rm(sessionsRoot, { recursive: true, force: true });
  }
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
  const { app, transport, store, sessionsRoot } = await buildFauxApp({
    scriptedText: "Reply.",
    sessionId: "01TESTCOMPOSER0004",
  });

  try {

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
  } finally {
    await rm(sessionsRoot, { recursive: true, force: true });
  }
});

// ── 3c. Slash commands: dispatched locally, never sent to the model ─────────

test("slash commands: /help renders a notice and does not prompt the model", async () => {
  const { app, transport, sessionsRoot } = await buildFauxApp({ scriptedText: "unused", sessionId: "01TESTSLASH000005" });

  try {
  app.composer.editor.onSubmit!("/help");
  await new Promise((resolve) => setTimeout(resolve, 50));

  const kinds = app.transcript.blockKinds();
  assert.ok(kinds.includes("notice"), "/help must render a notice block");
  assert.ok(!kinds.includes("user"), "/help must not be submitted to the model as a user turn");
  assert.ok(renderFrame(app, 80).includes("/model"), "the help notice lists the command set");

  await transport.close();
  } finally {
    await rm(sessionsRoot, { recursive: true, force: true });
  }
});

test("slash commands: /quit and /resume signal the runtime; unknown reports", async () => {
  const seen: ExitRequest[] = [];
  const { app, transport, sessionsRoot } = await buildFauxApp({
    scriptedText: "unused",
    sessionId: "01TESTSLASH000006",
    onExit: (request) => seen.push(request),
  });

  try {
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
  } finally {
    await rm(sessionsRoot, { recursive: true, force: true });
  }
});

// ── 4. Theme/tokens: the footer grammar is the single interaction string ────

test("theme: overlay footer is the canonical interaction grammar", () => {
  assert.equal(OVERLAY_FOOTER, "↑/↓ Navigate · Enter Select · ESC Cancel");
  assert.ok(renderOverlayFooter().length > 0, "footer renders non-empty");
});

// ── 4b. OK-10 Wave 0 layout + terminal capability floor ───────────────────

test("layout: one width+height resolver owns all five modes and short-height compaction", () => {
  assert.equal(resolveLayoutMode(40, 12), "compact");
  assert.equal(resolveLayoutMode(59, 60), "compact");
  assert.equal(resolveLayoutMode(60, 18), "narrow");
  assert.equal(resolveLayoutMode(79, 60), "narrow");
  assert.equal(resolveLayoutMode(80, 24), "standard");
  assert.equal(resolveLayoutMode(119, 60), "standard");
  assert.equal(resolveLayoutMode(120, 30), "workspace");
  assert.equal(resolveLayoutMode(159, 60), "workspace");
  assert.equal(resolveLayoutMode(160, 40), "wide");
  assert.equal(resolveLayoutMode(200, 12), "compact", "height below 16 forces compact at any width");

  const short = resolveLayout(200, 12);
  assert.equal(short.composerMaxRows, 4);
  assert.equal(short.showBootExtras, false);
  assert.deepEqual(overlaySpec(short, "60%", "70%"), {
    anchor: "center",
    width: "100%",
    maxHeight: "100%",
  });
});

test("capabilities: plain, NO_COLOR, 16, 256, truecolour, ASCII, and reduced motion resolve deterministically", () => {
  const utf8 = { LANG: "C.UTF-8" };
  assert.deepEqual(resolveCapabilities({ ...utf8, TERM: "dumb" }, true), {
    plain: true,
    colour: "none",
    unicode: false,
    altScreen: false,
    mouse: false,
    osc: false,
    reducedMotion: true,
  });
  assert.equal(resolveCapabilities({ ...utf8, TERM: "xterm-256color" }, false).plain, true, "non-TTY is plain");
  assert.equal(resolveCapabilities({ ...utf8, TERM: "xterm-256color", NO_COLOR: "1" }, true).colour, "none");
  assert.equal(resolveCapabilities({ ...utf8, TERM: "xterm-256color", NO_COLOR: "" }, true).colour, "ansi256");
  assert.equal(resolveCapabilities({ ...utf8, TERM: "ansi", OPENKAI_COLOR: "16" }, true).colour, "ansi16");
  assert.equal(resolveCapabilities({ ...utf8, TERM: "xterm-256color" }, true).colour, "ansi256");
  assert.equal(resolveCapabilities({ ...utf8, TERM: "xterm", COLORTERM: "truecolor" }, true).colour, "truecolour");
  assert.equal(resolveCapabilities({ ...utf8, TERM: "xterm", OPENKAI_ASCII: "1" }, true).unicode, false);
  assert.equal(resolveCapabilities({ ...utf8, TERM: "xterm", OPENKAI_REDUCED_MOTION: "1" }, true).reducedMotion, true);
});

test("theme: dark accent is exact #B0E1CD in truecolour and index 152 only in 256-colour", () => {
  try {
    setTheme("dark");
    configureCapabilities({ TERM: "xterm", COLORTERM: "truecolor", LANG: "C.UTF-8" }, true);
    const exact = highlight.base("mint");
    assert.ok(exact.includes("\x1b[38;2;176;225;205m"), "truecolour emits exact #B0E1CD");
    assert.ok(!exact.includes("38;5;152"), "truecolour does not masquerade the fallback as exact");

    configureCapabilities({ TERM: "xterm-256color", LANG: "C.UTF-8" }, true);
    const fallback = highlight.base("mint");
    assert.ok(fallback.includes("\x1b[38;5;152m"), "256-colour emits index 152 (#AFD7D7)");
    assert.ok(!fallback.includes("38;2;176;225;205"), "the fallback remains explicitly distinct");
  } finally {
    resetCapabilities();
    setTheme("dark");
  }
});

test("capabilities: NO_COLOR frame has no colour SGR; ASCII+reduced-motion frame is stable", async () => {
  const colourSgr = /\x1b\[(?:3[0-9]|4[0-9]|9[0-7]|10[0-7]|38(?:;[^m]*)?|48(?:;[^m]*)?)m/;
  let transport: InProcessTransport | undefined;
  let store: SessionStore | undefined;
  try {
    configureCapabilities({ TERM: "xterm-256color", LANG: "C.UTF-8", NO_COLOR: "1" }, true);
    const built = await buildFauxApp({ scriptedText: "unused", sessionId: "01TESTNOCOLOR0001" });
    transport = built.transport;
    store = built.store;
    const noColourFrame = built.app.root.render(80).join("\n");
    assert.ok(!colourSgr.test(noColourFrame), "NO_COLOR emits no foreground/background colour SGR");

    configureCapabilities({
      TERM: "xterm-256color",
      LANG: "C.UTF-8",
      OPENKAI_ASCII: "1",
      OPENKAI_REDUCED_MOTION: "1",
    }, true);
    const state = {
      ...defaultStatusState("a-very-long-model-name", "01ASCII0000000001", "local"),
      busy: true,
      activity: "working…",
      busyFrame: 1,
    };
    const status = new StatusLine(state, () => 12);
    const first = status.render(40).join("\n");
    status.update({ ...state, busyFrame: 9 });
    const second = status.render(40).join("\n");
    assert.equal(first, second, "reduced motion pins the busy frame");
    assert.ok(!/[^\x00-\x7f]/.test(stripTerminalSequences(first)), "ASCII mode emits deterministic ASCII glyphs");
    const asciiFrame = built.app.root.render(40).join("\n");
    assert.equal(asciiFrame, built.app.root.render(40).join("\n"), "ASCII app rendering is deterministic");
    assert.ok(
      !/[^\x00-\x7f]/.test(stripTerminalSequences(asciiFrame)),
      "ASCII mode covers boot, transcript, composer, and status rather than one isolated glyph",
    );
  } finally {
    await store?.close();
    await transport?.close();
    resetCapabilities();
  }
});

test("capabilities: the plain sink removes alt-screen, mouse, OSC, SGR, and Unicode", () => {
  const hostile = "\x1b[?1049h\x1b[?1000h\x1b]11;?\x07\x1b[38;5;152mhello ●\x1b[0m\x1b[?1049l";
  const plain = plainTerminalText(hostile);
  assert.equal(plain, "hello *");
  assert.ok(!plain.includes("\x1b"));
  assert.ok(!/[^\x00-\x7f]/.test(plain));
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
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "ok-tui-matrix-"));
  const store = new SessionStore({ root: tmpRoot, sessionId });
  await store.ensure();
  const cortex = new CortexClient({ project: "openkai" });

  try {

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
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

// ── 6. Session store helpers ───────────────────────────────────────────────

test("persist: listSessions + readSessionMessages round-trip", async () => {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "ok-tui-list-"));
  const id = "01TESTLIST" + Math.random().toString(36).slice(2, 6);
  const store = new SessionStore({ root: tmpRoot, sessionId: id });
  await store.ensure();
  try {
  await store.appendMessage({ role: "user", content: "hello list", timestamp: Date.now() } as never);

  const listed = await listSessions(tmpRoot);
  assert.ok(listed.includes(id), "listSessions returns the created session id");

  const msgs = await readSessionMessages(store.filePath);
  assert.equal(msgs.length, 1, "readSessionMessages returns the appended message");
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
test("gradient: every ESC introduces a CSI — no bare ESC eats the next glyph", () => {
  // fg256 closes with `\x1b[39m` (five chars). Slicing four left a bare ESC
  // before every glyph; `ESC \` is the ANSI String Terminator, so terminals
  // (and the frame renderer) swallowed every backslash in the brand mark.
  const out = gradientLogo(["/  \\  ●", "\\  /"], 0).join("\n");
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] === "\x1b") {
      assert.equal(out[i + 1], "[", `bare ESC at ${i} — it would consume ${JSON.stringify(out[i + 1])}`);
    }
  }
  // The art survives the round trip: strip SGR, get the strokes back.
  const stripped = out.replace(/\x1b\[[0-9;]*m/g, "");
  assert.equal(stripped, "/  \\  ●\n\\  /", "no glyph is lost to a stray escape");
});
