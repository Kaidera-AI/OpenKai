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
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { createModels, type MutableModels } from "@earendil-works/pi-ai";
import { Type } from "typebox";

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
