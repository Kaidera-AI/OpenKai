/**
 * Headless TUI host tests (OK-10 inc 11.2): the served host boots a real
 * TuiController against a virtual terminal, replays a settled frame on
 * attach (S3), accepts input through the same seam (S2), and emits
 * structured state beside the frames (S6).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { HostedTui } from "../dist/tui/headless-host.js";
import type { TuiApp } from "../dist/tui/app.js";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { createModels, type MutableModels } from "@earendil-works/pi-ai";
import { visibleWidth, type Component, type OverlayOptions } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const WAVE0_VIEWPORTS = [
  [40, 12],
  [60, 18],
  [80, 24],
  [120, 30],
  [160, 40],
  [200, 60],
] as const;

const echoTool = {
  name: "echo",
  label: "Echo",
  description: "echo",
  parameters: Type.Object({ msg: Type.String() }),
  async execute(_id: string, params: { msg: string }) {
    return { content: [{ type: "text", text: params.msg }], details: params };
  },
};

function fixture(models: MutableModels, text: string): void {
  const faux = fauxProvider({});
  faux.setResponses([fauxAssistantMessage([fauxText(text)])]);
  models.setProvider(faux.provider);
}

async function startHost(scriptedText: string) {
  const cwd = mkdtempSync(path.join(tmpdir(), "openkai-host-"));
  const models = createModels();
  fixture(models, scriptedText);
  const frames: string[] = [];
  const host = await HostedTui.start({
    cwd,
    modelId: "faux-1",
    provider: "faux",
    models,
    fps: 60,
    onFrame: (f) => frames.push(f),
  });
  return { host, frames, cwd };
}

test("headless host: attach hello replays the settled boot frame (S3)", async () => {
  const { host, cwd } = await startHost("hello");
  try {
    const frame = host.settledFrame(80);
    assert.ok(frame.includes("OpenKai"), "the boot brand mark renders");
    assert.ok(frame.includes("faux-1"), "the status chrome renders the model id");
  } finally {
    await host.close();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("headless host: input drives the composer through the seam (S2)", async () => {
  const { host, frames, cwd } = await startHost("pong!");
  try {
    // Type a prompt character-by-character and submit.
    for (const ch of "ping") host.input(ch);
    host.input("\r");
    // The pump emits frames as the turn streams; wait for settlement by
    // polling the settled frame for the scripted answer.
    const deadline = Date.now() + 5000;
    let settled = "";
    while (Date.now() < deadline) {
      settled = host.settledFrame(80);
      if (settled.includes("pong!")) break;
      const { promise, resolve } = Promise.withResolvers<void>();
      setTimeout(resolve, 25);
      await promise;
    }
    assert.ok(settled.includes("ping"), "the user prompt renders");
    assert.ok(settled.includes("pong!"), "the assistant answer renders");
    assert.ok(frames.length > 0, "the pump emitted frames");
  } finally {
    await host.close();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("headless host: state frames carry busy/model/session (S6)", async () => {
  const { host, cwd } = await startHost("hi");
  try {
    const state = host.state();
    assert.equal(state.model, "faux-1");
    assert.equal(state.sessionId, host.sessionId);
    assert.equal(state.plan, false);
    assert.equal(typeof state.busy, "boolean");
  } finally {
    await host.close();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("headless host: Wave 0 viewport matrix keeps composer and status inside every frame", async () => {
  const { host, cwd } = await startHost("unused");
  try {
    for (const ch of "wave0-draft") host.input(ch);

    for (const [columns, rows] of WAVE0_VIEWPORTS) {
      host.resize(columns, rows);
      const frame = host.settledFrame();
      const lines = frame.split("\n");
      assert.equal(lines.length, rows, `${columns}x${rows} renders exactly the viewport height`);
      assert.ok(
        lines.every((line) => visibleWidth(line) <= columns),
        `${columns}x${rows} never computes or emits an over-wide row`,
      );
      assert.ok(frame.includes("wave0-draft"), `${columns}x${rows} keeps the composer visible`);
      assert.ok(frame.includes("idle"), `${columns}x${rows} keeps status visible`);
      if (columns === 40) {
        assert.ok(!frame.includes("tip:"), "compact mode drops boot extras before operational chrome");
      }
    }
  } finally {
    await host.close();
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("headless host: breakpoint resizes preserve draft, selection, scroll anchor, focus, and overlay state", async () => {
  const { host, cwd } = await startHost("unused");
  try {
    const internals = host as unknown as {
      app: TuiApp;
      virtual: {
        focusedComponent: Component | undefined;
        topOverlay(): { component: Component; options?: OverlayOptions } | undefined;
      };
    };
    const { app, virtual } = internals;
    const draft = Array.from({ length: 18 }, (_, index) => `draft line ${index}`).join("\n");
    app.composer.editor.setText(draft);

    // Keep enough transcript behind every tested viewport that scrollTop=12
    // remains a valid semantic anchor even at 200x60.
    for (let index = 0; index < 180; index += 1) {
      app.transcript.addNotice(`anchor row ${index}`);
    }
    host.resize(80, 24);
    host.settledFrame();
    app.scroll.scrollTo(12, { disableFollow: true });
    assert.equal(app.scroll.scrollTop, 12, "fixture establishes a non-tail scroll anchor");

    const hub = app.controller.openModelsHub();
    host.input("\t");
    host.input("\x1b[B");
    host.input("\x1b[B");
    const selection = hub.selectionState();
    const focused = virtual.focusedComponent;
    assert.equal(selection.focus, "model", "fixture establishes model-list focus");
    assert.ok(selection.selectedModel, "fixture establishes a selected model row");
    assert.equal(focused, hub, "fixture establishes overlay focus intent");

    for (const [columns, rows] of WAVE0_VIEWPORTS) {
      host.resize(columns, rows);
      let frame = "";
      assert.doesNotThrow(() => {
        frame = host.settledFrame();
      }, `${columns}x${rows} resize renders without throwing`);
      assert.ok(
        frame.split("\n").every((line) => visibleWidth(line) <= columns),
        `${columns}x${rows} models hub never emits an over-wide row`,
      );
      assert.equal(app.composer.text, draft, `${columns}x${rows} preserves the draft`);
      assert.equal(app.scroll.scrollTop, 12, `${columns}x${rows} preserves the scroll anchor`);
      assert.deepEqual(hub.selectionState(), selection, `${columns}x${rows} preserves the selected row and pane`);
      assert.equal(virtual.focusedComponent, focused, `${columns}x${rows} preserves overlay focus intent`);

      const options = virtual.topOverlay()?.options;
      assert.ok(options, "models hub remains open across resize");
      assert.equal(options.width, columns === 40 ? "100%" : "80%", `${columns}x${rows} resolves overlay width live`);
      assert.equal(options.maxHeight, columns === 40 ? "100%" : "80%", `${columns}x${rows} resolves overlay height live`);
    }

    host.resize(40, 12);
    assert.ok(app.composer.editor.render(40).length <= 4, "short terminals cap the composer at four rows");
    assert.equal(app.composer.text, draft, "composer row clipping never mutates the draft");
  } finally {
    await host.close();
    rmSync(cwd, { recursive: true, force: true });
  }
});
