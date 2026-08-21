/**
 * E017 deep-review regression tests — one per release-blocking finding.
 *
 *  1. VirtualTui.hideOverlay restores focus (an rw attach's input must not
 *     die after a permission decision).
 *  2. resize() clamps geometry (an unbounded width was a one-frame hub
 *     kill through the render padding).
 *  3. Hub shutdown completes with an attach still open (upgraded sockets
 *     used to pin the event loop forever).
 *  4. Attach taps are removed on socket close (dead taps stringified every
 *     frame forever).
 *  5. detectThemeAsync is TUI-safe: restores the prior raw-mode state and
 *     never pauses a shared stdin (the "auto" theme application killed TUI
 *     keyboard input mid-session).
 *  6. noteGateOutcome credits the models that SERVED the attempt, not the
 *     orchestrator's advisory pick (phantom bandit arms).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { createModels } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai/providers/faux";
import { Orchestrator, type CastConfig } from "@kaidera/openkai-core";

import { HostedTui } from "../dist/tui/headless-host.js";
import { runHub } from "../dist/hub.js";
import { detectThemeAsync } from "../dist/tui/theme.js";
import { handshakeResponseHeaders } from "../dist/ws.js";
import { connect } from "node:net";
import { randomBytes } from "node:crypto";

const CASTS: CastConfig = {
  defaultCast: "strong",
  casts: [
    {
      id: "strong",
      tier: "frontier",
      provider: "nvidia",
      architectModel: "strong-arch",
      builderModel: "strong-build",
      judgeModel: "strong-judge",
      label: "Strong",
    },
  ],
};

function fauxModels(): ReturnType<typeof createModels> {
  const models = createModels();
  const faux = fauxProvider({});
  faux.setResponses([fauxAssistantMessage([fauxText("ok")])]);
  models.setProvider(faux.provider);
  return models;
}

// ── 1. focus restore after hideOverlay ─────────────────────────────────────

test("headless host: a permission decision restores focus to the composer", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "openkai-e017-focus-"));
  const host = await HostedTui.start({
    cwd,
    modelId: "faux-1",
    provider: "faux",
    models: fauxModels(),
    fps: 60,
    onFrame: () => undefined,
  });
  try {
    const virtual = (host as unknown as { virtual: { focusedComponent: unknown; hasOverlay(): boolean } }).virtual;
    const app = (host as unknown as { app: { composer: { editor: unknown }; controller: { showPermission(req: unknown): void } } }).app;
    assert.equal(virtual.focusedComponent, app.composer.editor, "boot focus is the composer");

    app.controller.showPermission({
      requestId: "req-focus",
      toolName: "write_file",
      rule: "write_file **",
      preview: { path: "x.txt", before: "", after: "hello" },
    });
    assert.ok(virtual.hasOverlay(), "permission overlay is up");

    host.input("\r"); // allow once
    assert.equal(virtual.hasOverlay(), false, "overlay popped on decision");
    assert.equal(
      virtual.focusedComponent,
      app.composer.editor,
      "focus returns to the composer — before the fix the popped overlay kept it",
    );

    host.input("h");
    host.input("i");
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.ok(host.settledFrame(80).includes("hi"), "typed text lands in the composer");
  } finally {
    await host.close();
  }
});

// ── 2. resize clamp ────────────────────────────────────────────────────────

test("headless host: resize clamps geometry instead of crashing the next frame", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "openkai-e017-resize-"));
  const host = await HostedTui.start({
    cwd,
    modelId: "faux-1",
    provider: "faux",
    models: fauxModels(),
    fps: 60,
    onFrame: () => undefined,
  });
  try {
    host.resize(3_000_000_000, 30); // the exact abuse frame from the review
    const frame = host.settledFrame(500); // must not throw
    assert.ok(frame.length > 0);
    const terminal = (host as unknown as { virtual: { terminal: { columns: number; rows: number } } }).virtual.terminal;
    assert.equal(terminal.columns, 500, "columns clamped to the cap");
    assert.equal(terminal.rows, 30);
    host.resize(1, 1);
    assert.equal(terminal.columns, 20, "columns clamped to the floor");
    assert.equal(terminal.rows, 4, "rows clamped to the floor");
  } finally {
    await host.close();
  }
});

// ── 3+4. hub shutdown with an open attach + tap removal ───────────────────

test("hub: shutdown completes with an attach open and removes its tap on close", async () => {
  process.env.OPENKAI_HUB_TOKEN = "t";
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "dummy";
  const port = 18995;
  const controller = new AbortController();

  // Count tap add/remove across the host class (the leak was a discarded remover).
  const added: number[] = [0];
  const removed: number[] = [0];
  const originalAddTap = HostedTui.prototype.addTap;
  HostedTui.prototype.addTap = function (this: HostedTui, onFrame, onState) {
    added[0]! += 1;
    const remover = originalAddTap.call(this, onFrame, onState);
    return () => {
      removed[0]! += 1;
      remover();
    };
  } as typeof originalAddTap;

  try {
    const hubPromise = runHub({ port, host: "127.0.0.1", signal: controller.signal });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i += 1) {
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/health`)).status === 200;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    assert.ok(ready, "hub is listening");

    const created = await fetch(`http://127.0.0.1:${port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ model: "nvidia/nemotron-3-nano-30b-a3b:free" }),
    });
    assert.equal(created.status, 200);
    const { sessionId } = (await created.json()) as { sessionId: string };

    // Open a raw WS attach and read the hello.
    const key = randomBytes(16).toString("base64");
    const socket = connect(port, "127.0.0.1", () => {
      socket.write(
        `GET /attach/${sessionId}?mode=ro&width=80 HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nAuthorization: Bearer t\r\n\r\n`,
      );
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("data", (chunk) => {
        if (chunk.toString("latin1").includes("101")) resolve();
        else reject(new Error("upgrade refused"));
      });
      socket.on("error", reject);
    });
    assert.equal(added[0], 1, "one tap added for the attach");

    // Shutdown with the attach OPEN — the hub used to hang here forever.
    controller.abort();
    const finished = await Promise.race([
      hubPromise.then(() => "resolved"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 4000)),
    ]);
    assert.equal(finished, "resolved", "runHub resolves with an attach still open");
    socket.destroy();

    // A second hub round-trip: attach, close the socket, watch the tap go.
    const controller2 = new AbortController();
    const hub2 = runHub({ port, host: "127.0.0.1", signal: controller2.signal });
    for (let i = 0; i < 100; i += 1) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/health`)).status === 200) break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    const created2 = await fetch(`http://127.0.0.1:${port}/sessions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ model: "nvidia/nemotron-3-nano-30b-a3b:free" }),
    });
    const { sessionId: sessionId2 } = (await created2.json()) as { sessionId: string };
    const key2 = randomBytes(16).toString("base64");
    const socket2 = connect(port, "127.0.0.1", () => {
      socket2.write(
        `GET /attach/${sessionId2}?mode=ro&width=80 HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key2}\r\nSec-WebSocket-Version: 13\r\nAuthorization: Bearer t\r\n\r\n`,
      );
    });
    await new Promise<void>((resolve) => {
      socket2.once("data", () => resolve());
    });
    socket2.destroy(); // client goes away without a close handshake
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal((removed[0] ?? 0) >= 1, true, "closing the socket removed its tap (no permanent leak)");
    controller2.abort();
    await hub2;
  } finally {
    HostedTui.prototype.addTap = originalAddTap;
    delete process.env.OPENKAI_HUB_TOKEN;
  }
});

// ── 5. theme detection TUI-safety ─────────────────────────────────────────

test("detectThemeAsync restores the prior raw mode and never pauses a shared stdin", async () => {
  const calls: string[] = [];
  const priorTerm = process.env.TERM;
  process.env.TERM = "xterm-256color";
  const fakeStdin = new EventEmitter() as NodeJS.ReadStream;
  (fakeStdin as unknown as { isTTY: boolean }).isTTY = true;
  (fakeStdin as unknown as { isRaw: boolean }).isRaw = true; // a running TUI owns it
  fakeStdin.setRawMode = ((value: boolean) => {
    calls.push(`setRawMode(${value})`);
    (fakeStdin as unknown as { isRaw: boolean }).isRaw = value;
    return fakeStdin;
  }) as NodeJS.ReadStream["setRawMode"];
  fakeStdin.resume = (() => {
    calls.push("resume()");
    return fakeStdin;
  }) as NodeJS.ReadStream["resume"];
  fakeStdin.pause = (() => {
    calls.push("pause()");
    return fakeStdin;
  }) as NodeJS.ReadStream["pause"];
  // The TUI's own data listener stays attached across the detection.
  fakeStdin.on("data", () => undefined);

  const realStdin = process.stdin;
  const realStdout = process.stdout;
  Object.defineProperty(process, "stdin", { value: fakeStdin, configurable: true });
  Object.defineProperty(process, "stdout", {
    value: { isTTY: true, write: () => true },
    configurable: true,
  });
  try {
    const detected = detectThemeAsync();
    fakeStdin.emit("data", Buffer.from("\x1b]11;rgb:1a1a/1a1a/1a1a\x07"));
    const theme = await detected;
    assert.equal(theme, "dark");
  } finally {
    Object.defineProperty(process, "stdin", { value: realStdin, configurable: true });
    Object.defineProperty(process, "stdout", { value: realStdout, configurable: true });
    if (priorTerm === undefined) delete process.env.TERM;
    else process.env.TERM = priorTerm;
  }

  assert.ok(calls.includes("setRawMode(true)"), "raw mode asserted for the query");
  assert.deepEqual(
    calls[calls.length - 1],
    "setRawMode(true)",
    "raw mode RESTORED to true (the TUI's state) — not forced false",
  );
  assert.ok(!calls.includes("pause()"), "a stdin with live data listeners is never paused");
});

// ── 6. noteGateOutcome credits the serving panel ──────────────────────────

test("noteGateOutcome rewards the served models, not the advisory pick", () => {
  const orch = new Orchestrator({ cwd: "/tmp", castConfig: CASTS });
  // The advisory decision picks the cast's stage model…
  orch.decide({ prompt: "implement the handler" }, { signals: [], turnDepth: 0, compacted: false });
  // …but the panel served two DIFFERENT models (operator overrides).
  orch.noteGateOutcome("fail", "bucket-x", ["actual-arch", "actual-build"]);

  const phantom = orch.banditArm("bucket-x", "strong-build");
  const archArm = orch.banditArm("bucket-x", "actual-arch");
  const buildArm = orch.banditArm("bucket-x", "actual-build");
  // Beta posterior, prior {1,1}; a fail bumps beta.
  assert.deepEqual(phantom, { alpha: 1, beta: 1 }, "the advisory pick is untouched — no phantom training");
  assert.deepEqual(archArm, { alpha: 1, beta: 2 }, "fail recorded against the serving architect");
  assert.deepEqual(buildArm, { alpha: 1, beta: 2 }, "fail recorded against the serving builder");
});

// Reference for the handshake import (kept so the codec stays in the graph).
void handshakeResponseHeaders;
