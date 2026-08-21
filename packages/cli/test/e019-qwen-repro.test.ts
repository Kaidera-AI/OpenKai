/**
 * E019 qwen3.8-pro pass (handoff c0a3f80f) — executable reproducers for the
 * three behavioural findings salvaged from the killed codex run 15d214bd:
 *
 *   S1: a turn that settles with stopReason "error" must NOT render the
 *       green "✓ settled" row — a failed turn reading as success is a trust
 *       defect (app.ts turn_end renders the row unconditionally).
 *   S2: click-to-cursor computes the editor cursor column in GRAPHEME units,
 *       but pi-tui's Editor state.cursorCol is a UTF-16 code-unit offset
 *       (every slice/length in editor.js is code-unit arithmetic). Wide
 *       cells (CJK) and multi-unit graphemes (emoji) land the cursor in the
 *       wrong place — including INSIDE a surrogate pair, which corrupts the
 *       line on the next insert.
 *   S3: on a managed channel (brew/bun/npm) runUpgrade dispatches the real
 *       package-manager upgrade BEFORE consulting --check/--rollback, so the
 *       read-only flag mutates the install and the recovery flag forward-
 *       upgrades. Proven on the npm lane (the injectable one); the brew/bun
 *       branches share the identical early-dispatch shape.
 *
 * Each test asserts the CORRECT behaviour: at 2618bfc all three FAIL (that
 * run is the reproducer evidence); after the fixes they pass.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai/providers/faux";
import type { TUI } from "@earendil-works/pi-tui";

import { InProcessTransport, SessionStore } from "@kaidera/openkai-core";
import { buildTuiApp, type TuiApp } from "../dist/tui/app.js";
import { Composer } from "../dist/tui/composer.js";
import { runUpgrade, type UpgradeDeps } from "../dist/upgrade.js";

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

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── S1: a failed turn must not render as success ────────────────────────────

test("S1: stopReason=error turn renders a failure row, not the green ✓ settled", async () => {
  const faux = fauxProvider({});
  faux.setResponses([
    fauxAssistantMessage([fauxText("partial output before the failure")], {
      stopReason: "error",
      errorMessage: "provider exploded mid-turn",
    }),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);

  const sessionId = "01TESTE019QWEN0S01";
  const transport = new InProcessTransport({
    sessionId,
    modelId: "faux-1",
    models,
    provider: "faux",
    tools: [],
    cwd: process.cwd(),
  });
  // mkdtemp: unique root per run so concurrent worktrees can't collide on
  // the /tmp/ok-tui-<sessionId> lock (the session id constant is asserted on).
  const sessionsRoot = await mkdtemp(path.join(tmpdir(), "ok-tui-"));
  const store = new SessionStore({ root: sessionsRoot, sessionId });
  await store.ensure();

  const app: TuiApp = buildTuiApp(headlessTui(24), {
    transport,
    modelId: "faux-1",
    sessionId,
    persistMode: "local",
    store,
    sessionsRoot,
  });

  try {
  await app.controller.submit("do the thing");
  await transport.close();
  await app.controller.consume();

  const frame = app.root.render(80).map(stripAnsi).join("\n");

  // Control: the error event itself rendered (danger row carries the message).
  assert.ok(
    frame.includes("provider exploded mid-turn"),
    "the provider error message must appear in the transcript",
  );
  // The defect: turn_end follows the error event in the same batch
  // (core events.ts emits [error, turn_end]), and app.ts renders the green
  // settled row unconditionally — a failed turn must not read as success.
  assert.ok(
    !frame.includes("✓ settled"),
    `a turn that settled as an error must not render "✓ settled" — frame:\n${frame}`,
  );
  assert.ok(
    /✗ failed in \d/.test(frame),
    "the settle row for a failed turn must state the failure (✗ failed in Ns)",
  );
  } finally {
    await rm(sessionsRoot, { recursive: true, force: true });
  }
});

// ── S2: click-to-cursor must produce UTF-16 offsets, not grapheme counts ────

test("S2: positionCursorAt maps clicked cells to UTF-16 cursor offsets (emoji + CJK)", () => {
  const tui = headlessTui();
  const composer = new Composer(tui, { onSubmit: () => undefined });
  try {
    // "😀😀x": cells [😀:0-1][😀:2-3][x:4] — UTF-16 offsets 😀=0..1, 😀=2..3, x=4.
    // Clicking on 'x' (content cell col 4) must set cursorCol=4 (code units).
    // Grapheme arithmetic yields 3 = the MIDDLE of the second surrogate pair.
    composer.editor.setText("😀😀x");
    composer.positionCursorAt(0, 4);
    assert.equal(
      composer.editor.getCursor().col,
      4,
      "click on 'x' after two emoji: cursorCol must be the UTF-16 offset 4",
    );
    composer.editor.handleInput("Z");
    assert.equal(
      composer.editor.getLines()[0],
      "😀😀Zx",
      "inserting at the clicked point must not split a surrogate pair",
    );

    // "你好x": cells [你:0-1][好:2-3][x:4] — UTF-16 offsets 你=0, 好=1, x=2.
    // Clicking on 'x' (cell col 4) must set cursorCol=2; treating cells as
    // grapheme/code-unit counts lands past the end instead.
    composer.editor.setText("你好x");
    composer.positionCursorAt(0, 4);
    assert.equal(
      composer.editor.getCursor().col,
      2,
      "click on 'x' after two CJK cells: cursorCol must be the UTF-16 offset 2",
    );
    composer.editor.handleInput("Z");
    assert.equal(
      composer.editor.getLines()[0],
      "你好Zx",
      "the insert must land before 'x', where the operator clicked",
    );

    // Click far past the end of an emoji line: clamp to the line's UTF-16
    // length (4), never to its grapheme length (2 = mid surrogate pair).
    composer.editor.setText("😀😀");
    composer.positionCursorAt(0, 40);
    assert.equal(
      composer.editor.getCursor().col,
      4,
      "past-end click on an emoji line must clamp to the UTF-16 line length",
    );
  } finally {
    clearInterval((composer as unknown as { shimmerTimer: NodeJS.Timeout }).shimmerTimer);
  }
});

// ── S3: --check/--rollback must gate managed-channel dispatch ───────────────

test("S3: --check and --rollback never dispatch the package manager on the npm-managed channel", async () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const deps: UpgradeDeps = {
    fetchManifest: async () => {
      throw new Error("managed-channel check/rollback must not fetch a manifest");
    },
    download: async () => {
      throw new Error("managed-channel check/rollback must not download");
    },
    runExternal: async (cmd, args) => {
      calls.push({ cmd, args });
      return { code: 0, output: "ok" };
    },
    readFile: async () => {
      throw new Error("no file reads expected");
    },
    writeFile: async () => {
      throw new Error("no file writes expected");
    },
    rename: async () => {
      throw new Error("no renames expected");
    },
    copyFile: async () => {
      throw new Error("no copies expected");
    },
    chmod: async () => {},
    stat: async () => ({ isFile: true }),
  };
  // currentBinary pins the brew/bun detection off (those branches are
  // execPath-sniffed); OPENKAI_CHANNEL=npm selects the npm-managed lane,
  // which shares the same dispatch-before-flags shape as brew/bun.
  const common = {
    env: { OPENKAI_CHANNEL: "npm" },
    deps,
    currentBinary: "/tmp/fake-openkai-binary",
  };

  const checked = await runUpgrade({ ...common, check: true });
  assert.deepEqual(
    calls,
    [],
    `--check is advertised read-only; it dispatched: ${JSON.stringify(calls)}`,
  );
  assert.equal(checked.exitCode, 0, "--check on a managed channel reports, exit 0");

  const rolled = await runUpgrade({ ...common, rollback: true });
  assert.deepEqual(
    calls,
    [],
    `--rollback must never forward-upgrade; it dispatched: ${JSON.stringify(calls)}`,
  );
  assert.notEqual(
    rolled.exitCode,
    0,
    "--rollback on a managed channel refuses (the package manager owns history)",
  );
});
