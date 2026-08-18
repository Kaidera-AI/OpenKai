/**
 * E017 S1 — TUI visibility slice tests (OK-9.7 trust surface).
 *
 * Frame-level coverage for the five surfaces in the slice:
 *  1. the tier chip in the status line (lights on tier-aware routing events,
 *     flashes `eff▸cap` on a transition, silent on reaffirmation);
 *  2. fusion role pills + the failed-role surface;
 *  3. gate outcome notices (pass / halt / weak-gate / refused);
 *  4. `/shift` — the session routing ledger over `.openkai/activity.jsonl`
 *     (redact-on-read, malformed rows skipped);
 *  5. `/diff` — the shadow-snapshot diff overlay (scroll, footer, sanitise).
 *
 * Convention: headless TUI stub + faux provider transport, render the layout
 * root to a frame, strip ANSI for content assertions (tui.test.ts's shape).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai/providers/faux";
import type { TUI } from "@earendil-works/pi-tui";

import {
  InProcessTransport,
  SessionStore,
  ShadowGit,
  type FuseResult,
  type RoutingEvent,
} from "@kaidera/openkai-core";
import { buildTuiApp, type TuiApp } from "../dist/tui/app.js";
import { SLASH_COMMANDS, buildPaletteItems, helpText } from "../dist/tui/commands.js";
import { DiffOverlay, tintDiffLine } from "../dist/tui/diff.js";
import { OVERLAY_FOOTER } from "../dist/tui/theme.js";

// ── Test fixtures ────────────────────────────────────────────────────────────

/** A headless TUI stub that also captures the shown overlay (for /diff). */
function headlessTui(rows = 24): TUI & { shownOverlay: unknown; overlayHidden: boolean } {
  const noop = (): void => {};
  const stub = {
    terminal: { rows, columns: 80 },
    mode: "fullscreen" as const,
    children: [] as unknown[],
    addChild: noop,
    getShowHardwareCursor: () => false,
    setFocus: noop,
    showOverlay(component: unknown) {
      stub.shownOverlay = component;
      stub.overlayHidden = false;
    },
    hideOverlay() {
      stub.overlayHidden = true;
    },
    hasOverlay: () => !stub.overlayHidden && stub.shownOverlay !== undefined,
    start: noop,
    stop: noop,
    requestRender: noop,
    addInputListener: (() => () => {}) as unknown,
    invalidate: noop,
    render: () => [],
    shownOverlay: undefined as unknown,
    overlayHidden: false,
  };
  return stub as unknown as TUI & { shownOverlay: unknown; overlayHidden: boolean };
}

/** Build a faux-backed transport + TUI app rooted at a fresh tmp project dir. */
async function buildVisibilityApp(opts: {
  sessionId: string;
  runFusion?: (task: string) => Promise<FuseResult>;
}): Promise<{ app: TuiApp; tui: TUI & { shownOverlay: unknown; overlayHidden: boolean }; cwd: string }> {
  const faux = fauxProvider({});
  faux.setResponses([fauxAssistantMessage([fauxText("ok")])]);
  const models = createModels();
  models.setProvider(faux.provider);

  // A fresh tmp project root: the /shift ledger and /diff shadow repo live
  // under <cwd>/.openkai — never the repo's own state.
  const cwd = mkdtempSync(path.join(tmpdir(), `ok-vis-${opts.sessionId}-`));

  const transport = new InProcessTransport({
    sessionId: opts.sessionId,
    modelId: "faux-1",
    models,
    provider: "faux",
    tools: [],
    cwd,
  });
  const store = new SessionStore({ root: path.join(cwd, ".openkai", "sessions"), sessionId: opts.sessionId });
  await store.ensure();

  const tui = headlessTui(24);
  const app = buildTuiApp(tui, {
    transport,
    modelId: "faux-1",
    sessionId: opts.sessionId,
    persistMode: "local",
    store,
    cwd,
    runFusion: opts.runFusion,
  });
  return { app, tui, cwd };
}

/** Render the layout root to a frame (joined lines), optionally ANSI-stripped. */
function renderFrame(app: TuiApp, width = 80, strip = true): string {
  const lines = app.root.render(width);
  const joined = lines.join("\n");
  return strip ? joined.replace(/\x1b\[[0-9;]*m/g, "") : joined;
}

/** A fabrication helper for the /fuse result — the wire shape, filled sanely. */
function makeFuseResult(overrides: {
  gate: FuseResult["gate"];
  gateRuns?: FuseResult["gateRuns"];
  roleError?: string;
}): FuseResult {
  return {
    runId: "run-1",
    outputs: [
      { role: "architect", modelId: "arch-model", text: "Plan first.", usage: undefined, latencyMs: 10 },
      {
        role: "builder",
        modelId: "build-model",
        text: "Build it.",
        usage: undefined,
        latencyMs: 20,
        ...(overrides.roleError !== undefined ? { error: overrides.roleError } : {}),
      },
    ],
    synthesis: {
      consensus: ["ship it"],
      divergences: [],
      discarded: [],
      blindSpots: [],
      raw: "{}",
      modelId: "judge-model",
      usage: undefined,
    },
    gate: overrides.gate,
    gateRuns: overrides.gateRuns ?? [],
    record: {
      runId: "run-1",
      ts: new Date().toISOString(),
      task: "t",
      gated: true,
      roles: [],
      synthesis: undefined,
      gate: overrides.gate,
      wallMs: 1,
    },
  };
}

function routing(overrides: Partial<RoutingEvent>): RoutingEvent {
  return { kind: "routing", stage: "build", model: "m1", provider: "faux", ...overrides };
}

// ── 1. Tier chip ─────────────────────────────────────────────────────────────

test("tier chip: absent before any routing event, lights on the first tier decision", async () => {
  const { app } = await buildVisibilityApp({ sessionId: "chip1" });
  assert.equal(app.status.currentState.tier, undefined);
  assert.ok(!renderFrame(app).includes("t:cap"), "no tier chip before routing");

  app.controller.applyRoutingEvent(routing({ tier: "capable", source: "fall_open" }));
  assert.equal(app.status.currentState.tier, "capable");
  assert.ok(renderFrame(app).includes("t:cap"), "chip shows the routed tier");
});

test("tier chip: a flip flashes eff▸cap and logs a transition notice with the source", async () => {
  const { app } = await buildVisibilityApp({ sessionId: "chip2" });
  app.controller.applyRoutingEvent(routing({ tier: "capable", source: "fall_open" }));
  app.controller.applyRoutingEvent(routing({ tier: "efficient", source: "tests_passed" }));

  const state = app.status.currentState;
  assert.equal(state.tier, "efficient");
  assert.equal(state.tierFrom, "capable");
  const frame = renderFrame(app);
  assert.ok(frame.includes("t:cap▸eff"), "chip shows the transition");
  assert.ok(
    frame.includes("tier: capable → efficient · build stage · source: tests_passed"),
    "transition notice names stage + source",
  );

  // The acceptance path: an override escalation (critical error / compaction)
  // flips back up and flashes in the other direction.
  app.controller.applyRoutingEvent(routing({ tier: "capable", source: "override" }));
  const escalated = renderFrame(app);
  assert.ok(escalated.includes("t:eff▸cap"), "override escalation flashes on the chip");
  assert.ok(escalated.includes("tier: efficient → capable · build stage · source: override"), "override source is named");
});

test("tier chip: reaffirmation is silent; a tierless route is quiet", async () => {
  const { app } = await buildVisibilityApp({ sessionId: "chip3" });
  app.controller.applyRoutingEvent(routing({ tier: "capable", source: "override" }));
  const noticesAfterFirst = app.transcript.blockCounts()["notice"] ?? 0;

  app.controller.applyRoutingEvent(routing({ tier: "capable", source: "dimensions" }));
  assert.equal(app.transcript.blockCounts()["notice"], noticesAfterFirst, "no notice on reaffirmation");
  assert.equal(app.status.currentState.tierFrom, undefined, "no flash on reaffirmation");

  app.controller.applyRoutingEvent(routing({ tier: undefined, source: undefined }));
  assert.equal(app.transcript.blockCounts()["notice"], noticesAfterFirst, "tierless route stays quiet");
});

test("routing events: fallback renders a notice; routing_error renders sanitised danger", async () => {
  const { app } = await buildVisibilityApp({ sessionId: "chip4" });
  app.controller.applyRoutingEvent(
    routing({ kind: "fallback", model: "m2", attempt: 1, tier: undefined }),
  );
  let frame = renderFrame(app);
  assert.ok(frame.includes("fallback: build → m2 (faux, attempt 1)"), "fallback notice renders");

  app.controller.applyRoutingEvent({
    kind: "routing_error",
    stage: "build",
    reason: "provider exploded \x1b]0;pwned\x07 done",
  });
  frame = renderFrame(app);
  assert.ok(frame.includes("routing: provider exploded"), "routing_error surfaces");
  assert.ok(!renderFrame(app, 80, false).includes("\x1b]0;"), "OSC sequence stripped at the boundary");
  assert.ok(!frame.includes("pwned"), "OSC payload removed whole");
});

// ── 2 + 3. Fusion role pills + gate outcome notices ──────────────────────────

test("fusion: role outputs render with identity pills; gate pass is a quiet notice", async () => {
  const { app } = await buildVisibilityApp({
    sessionId: "fuse1",
    runFusion: async () => makeFuseResult({ gate: { rounds: 1, outcome: "pass" } }),
  });
  await app.controller.dispatchCommand("fuse", "build the thing");
  const frame = renderFrame(app);
  assert.ok(frame.includes("[ARCHITECT]"), "architect pill renders");
  assert.ok(frame.includes("[BUILDER]"), "builder pill renders");
  assert.ok(frame.includes("synthesis"), "attributed merge block renders");
  assert.ok(frame.includes("gate: pass ✓ (1 evaluation round(s))"), "gate pass notice renders");
});

test("fusion: gate halt is a danger notice naming the failing checks", async () => {
  const { app } = await buildVisibilityApp({
    sessionId: "fuse2",
    runFusion: async () =>
      makeFuseResult({
        gate: { rounds: 3, outcome: "halt" },
        gateRuns: [
          {
            purpose: "evaluation",
            pass: false,
            results: [
              { check: { name: "tests pass", command: "npm test" }, exitCode: 1, output: "fail", timedOut: false, pass: false },
            ],
          },
        ],
      }),
  });
  await app.controller.dispatchCommand("fuse", "build the thing");
  const frame = renderFrame(app);
  assert.ok(frame.includes("gate: HALT after 3 evaluation round(s)"), "halt notice renders");
  assert.ok(frame.includes("✗ tests pass"), "the failing check is named");
});

test("fusion: weak-gate and refused verdicts render their own notices", async () => {
  const { app } = await buildVisibilityApp({
    sessionId: "fuse3",
    runFusion: async () => makeFuseResult({ gate: { rounds: 0, outcome: "weak-gate" } }),
  });
  await app.controller.dispatchCommand("fuse", "build the thing");
  assert.ok(renderFrame(app).includes("gate: weak-gate"), "weak-gate notice renders");

  const refused = await buildVisibilityApp({
    sessionId: "fuse4",
    runFusion: async () => makeFuseResult({ gate: { rounds: 0, outcome: "refused" } }),
  });
  await refused.app.controller.dispatchCommand("fuse", "build the thing");
  assert.ok(renderFrame(refused.app).includes("gate: refused"), "refused notice renders");
});

test("fusion: a failed role keeps its pill and shows the attributed error", async () => {
  const { app } = await buildVisibilityApp({
    sessionId: "fuse5",
    runFusion: async () => makeFuseResult({ gate: { rounds: 0, outcome: "not-run" }, roleError: "stream died" }),
  });
  await app.controller.dispatchCommand("fuse", "build the thing");
  const frame = renderFrame(app);
  assert.ok(frame.includes("[BUILDER]"), "failed role keeps its pill");
  assert.ok(frame.includes("✗ role failed: stream died"), "the role's error is visible");
});

// ── 4. /shift — the routing ledger ───────────────────────────────────────────

test("/shift: renders recent routing decisions with tier + source, redacted on read", async () => {
  const { app, cwd } = await buildVisibilityApp({ sessionId: "shift1" });
  const dir = path.join(cwd, ".openkai");
  mkdirSync(dir, { recursive: true });
  const rows = [
    { ts: "2026-08-19T10:00:00.000Z", kind: "tool_call", toolName: "bash" },
    {
      ts: "2026-08-19T10:00:01.000Z",
      kind: "routing",
      stage: "build",
      model: "fast-model",
      provider: "faux",
      tier: "efficient",
      source: "fall_open",
      reason: "no signal",
    },
    {
      ts: "2026-08-19T10:00:02.000Z",
      kind: "routing",
      stage: "build",
      model: "big-model",
      provider: "faux",
      tier: "capable",
      source: "override",
      reason: "critical error: auth failed with sk-livekey0123456789",
    },
    { ts: "2026-08-19T10:00:03.000Z", kind: "routing_error", stage: "review", reason: "chain exhausted" },
  ];
  writeFileSync(path.join(dir, "activity.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");

  await app.controller.dispatchCommand("shift", "");
  const frame = renderFrame(app);
  assert.ok(frame.includes("/shift — recent routing decisions (3 total"), "ledger header renders");
  assert.ok(frame.includes("⇄ build → fast-model (faux) [efficient · fall_open]"), "tier + source render");
  assert.ok(frame.includes("[capable · override]"), "override decision renders");
  assert.ok(!frame.includes("bash"), "non-routing rows are excluded");
  assert.ok(!frame.includes("sk-livekey0123456789"), "secrets are redacted on read");
  assert.ok(frame.includes("[redacted-secret]"), "the redaction marker shows instead");
  assert.ok(frame.includes("✗ routing: chain exhausted"), "routing errors render");
});

test("/shift: empty feed and missing feed are friendly notices", async () => {
  const { app, cwd } = await buildVisibilityApp({ sessionId: "shift2" });
  await app.controller.dispatchCommand("shift", "");
  assert.ok(renderFrame(app).includes("no activity feed yet"), "missing file notice");

  mkdirSync(path.join(cwd, ".openkai"), { recursive: true });
  writeFileSync(path.join(cwd, ".openkai", "activity.jsonl"), '{"ts":"2026-08-19T10:00:00.000Z","kind":"connected"}\nnot json\n', "utf-8");
  await app.controller.dispatchCommand("shift", "");
  assert.ok(renderFrame(app).includes("no routing decisions on the feed yet"), "no-routing notice; malformed rows skipped");
});

// ── 5. /diff — the shadow snapshot overlay ───────────────────────────────────

test("/diff: no snapshots yet is a notice, not an error", async () => {
  const { app } = await buildVisibilityApp({ sessionId: "diff1" });
  await app.controller.dispatchCommand("diff", "");
  assert.ok(renderFrame(app).includes("/diff — no snapshots yet"), "empty-shadow notice renders");
});

test("/diff: a clean tree reports clean against the snapshot", async () => {
  const { app, cwd } = await buildVisibilityApp({ sessionId: "diff2" });
  writeFileSync(path.join(cwd, "a.txt"), "hello\n", "utf-8");
  await new ShadowGit(cwd).snapshot("test snapshot");
  await app.controller.dispatchCommand("diff", "");
  assert.ok(renderFrame(app).includes("work tree clean against snapshot"), "clean notice renders");
});

test("/diff: modifications + untracked files render in a scrollable overlay with the canonical footer", async () => {
  const { app, tui, cwd } = await buildVisibilityApp({ sessionId: "diff3" });
  writeFileSync(path.join(cwd, "a.txt"), "hello\n", "utf-8");
  await new ShadowGit(cwd).snapshot("test snapshot");
  writeFileSync(path.join(cwd, "a.txt"), "hello world\n", "utf-8");
  writeFileSync(path.join(cwd, "b.txt"), "new file\n", "utf-8");

  await app.controller.dispatchCommand("diff", "");
  const overlay = tui.shownOverlay as DiffOverlay | undefined;
  assert.ok(overlay instanceof DiffOverlay, "the diff overlay opened");
  const body = overlay.render(80).join("\n").replace(/\x1b\[[0-9;]*m/g, "");
  assert.ok(body.includes("+hello world"), "the added line renders");
  assert.ok(body.includes("-hello"), "the removed line renders");
  assert.ok(body.includes("? b.txt"), "untracked files are listed");
  assert.ok(body.includes("diff — snapshot"), "the title names the base");
  assert.ok(body.includes(OVERLAY_FOOTER), "canonical footer grammar");

  overlay.handleInput("\x1b"); // Esc closes
  assert.ok(tui.overlayHidden, "Esc closes the overlay");
});

test("diff overlay: scroll clamps at both ends; content is sanitised at construction", () => {
  const lines = Array.from({ length: 40 }, (_, i) => ` line ${i}`);
  lines[5] = "\x1b[2K+hostile"; // a screen-clear escape embedded in file content
  let closed = false;
  const overlay = new DiffOverlay("t", lines, () => {
    closed = true;
  }, 10);

  overlay.handleInput("\x1b[B"); // down
  overlay.handleInput("\x1b[6~"); // pageDown
  assert.equal(overlay.scrollOffset, 11, "line + page scroll accumulate");
  overlay.handleInput("\x1b[6~");
  overlay.handleInput("\x1b[6~");
  overlay.handleInput("\x1b[6~");
  assert.equal(overlay.scrollOffset, 30, "scroll clamps at the last page");
  overlay.handleInput("\x1b[H"); // home
  assert.equal(overlay.scrollOffset, 0, "home jumps to the top");
  overlay.handleInput("\x1b[A"); // up past the top
  assert.equal(overlay.scrollOffset, 0, "scroll clamps at the top");

  const raw = overlay.render(80).join("\n");
  assert.ok(!raw.includes("\x1b[2K"), "embedded escape sequences are stripped");
  overlay.handleInput("\x1b");
  assert.ok(closed, "Esc invokes onClose");
});

test("diff tinting: additions, deletions, and hunk headers take theme tokens", () => {
  assert.ok(tintDiffLine("+added").includes("\x1b["), "addition tinted");
  assert.ok(tintDiffLine("-removed").includes("\x1b["), "deletion tinted");
  assert.ok(tintDiffLine("@@ -1 +1 @@").includes("\x1b["), "hunk header tinted");
  assert.notEqual(tintDiffLine("+added"), tintDiffLine("-removed"), "add/delete read differently");
});

// ── 6. Command registration ──────────────────────────────────────────────────

test("registration: /shift and /diff are commands, in help, and in the palette", () => {
  const names = SLASH_COMMANDS.map((c) => c.name);
  assert.ok(names.includes("shift"), "/shift registered");
  assert.ok(names.includes("diff"), "/diff registered");

  const help = helpText().join("\n");
  assert.ok(help.includes("/shift"), "help lists /shift");
  assert.ok(help.includes("/diff"), "help lists /diff");

  const palette = buildPaletteItems({}).map((i) => i.value);
  assert.ok(palette.includes("shift"), "palette lists shift");
  assert.ok(palette.includes("diff"), "palette lists diff");
});
