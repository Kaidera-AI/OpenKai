/**
 * P4b TUI tests — the six scope-§1 features (scope §3 verify).
 *
 * Deterministic + offline: palette/attention/frecency/stash are exercised as
 * pure functions + headless components (no real terminal). `/btw` and `/undo`
 * use the controller with a headless TUI stub + a stubbed `onUndo`. All colour
 * decisions are in theme.ts — no ad-hoc literals. Test runner: node:test.
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
import { buildTuiApp } from "../dist/tui/app.js";
import { CommandPalette, type PaletteItem } from "../dist/tui/palette.js";
import { StatusLine, defaultStatusState } from "../dist/tui/status.js";
import { Transcript } from "../dist/tui/transcript.js";
import {
  OVERLAY_FOOTER,
  renderOverlayFooter,
  roleColour,
  rolePill,
  roleLabel,
} from "../dist/tui/theme.js";
import { AttentionNotifier, isFocusIn, isFocusOut } from "../dist/tui/attention.js";
import {
  PromptStash,
  FrecencyHistory,
  frecencyScore,
  rankFrecency,
  type FrecencyEntry,
} from "../dist/tui/stash.js";

/** Strip ANSI escape sequences for plain-text assertions. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** A capturing writer for the attention notifier (records raw output). */
class CaptureWriter {
  readonly out: string[] = [];
  write(data: string): void {
    this.out.push(data);
  }
}

/** A minimal headless TUI stub (same shape as tui.test.ts). */
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

/** A faux-backed transport (no network) — only constructed, never consumed here. */
function fauxTransport(sessionId: string): InProcessTransport {
  const faux = fauxProvider({});
  const models = createModels();
  models.setProvider(faux.provider);
  return new InProcessTransport({
    sessionId,
    modelId: "faux-1",
    models,
    provider: "faux",
    cwd: process.cwd(),
  });
}

/** Palette items for the frame/filter test (a representative subset). */
function samplePaletteItems(): PaletteItem[] {
  return [
    { value: "help", label: "Help", description: "Show commands and keybindings", keys: "/help" },
    { value: "btw", label: "BTW", description: "Ask a side question (system block)", keys: "/btw" },
    { value: "undo", label: "Undo mutation", description: "Undo the last gated mutation", keys: "/undo" },
    { value: "toggle-thinking", label: "Toggle thinking", description: "Hide/reveal reasoning", keys: "Ctrl+O" },
  ];
}

// ── 1. Command palette frame + canonical footer (scope §1.3 + §3.2) ────────

test("palette: render carries the canonical overlay footer grammar", () => {
  const palette = new CommandPalette({
    items: samplePaletteItems(),
    onSelect: () => undefined,
    onCancel: () => undefined,
  });
  const frame = palette.render(80).map(stripAnsi).join("\n");
  assert.ok(frame.includes("↑/↓ Navigate · Enter Select · ESC Cancel"), "palette footer must carry the canonical grammar");
  assert.equal(renderOverlayFooter().replace(/\x1b\[[0-9;]*m/g, ""), OVERLAY_FOOTER);
  assert.ok(frame.includes("Help") || frame.includes("BTW"), "an item label must render");
});

test("palette: typing narrows the list (fuzzy filter)", () => {
  const palette = new CommandPalette({
    items: samplePaletteItems(),
    onSelect: () => undefined,
    onCancel: () => undefined,
  });
  assert.equal(palette.filteredItems().length, 4, "empty query shows all items");
  palette.handleInput("u");
  palette.handleInput("n");
  palette.handleInput("d");
  const matched = palette.filteredItems();
  assert.equal(matched.length, 1, "only the undo item matches 'und'");
  assert.equal(matched[0]!.value, "undo");
  palette.handleInput("\x7f"); // backspace widens again
  assert.ok(palette.filteredItems().length > 1, "backspace widens the filter");
});

// ── 2. Attention chrome state + focus-aware notifier (scope §1.1) ──────────

test("attention chrome: amber glyph renders when attention && !busy/awaiting", () => {
  const state = defaultStatusState("faux-1", "01ATTENT", "local");
  state.attention = true;
  const status = new StatusLine(state);
  const plain = status.render(80).map(stripAnsi).join("\n");
  assert.ok(plain.includes("attention"), "attention glyph must render when attention is set");
});

test("attention chrome: busy + awaiting take priority over attention", () => {
  const state = defaultStatusState("faux-1", "01ATTENT2", "local");
  state.attention = true;
  state.busy = true;
  const status = new StatusLine(state);
  const plain = status.render(80).map(stripAnsi).join("\n");
  assert.ok(/working|thinking|writing/.test(plain), "busy shows the animated activity chip");
  assert.ok(!plain.includes("attention"), "attention glyph is suppressed while busy");

  state.busy = false;
  state.awaitingApproval = true;
  status.update(state);
  const plain2 = status.render(80).map(stripAnsi).join("\n");
  assert.ok(plain2.includes("waiting"), "awaiting must show over attention");
  assert.ok(!plain2.includes("attention"), "attention glyph is suppressed while awaiting");
});

test("attention notifier: default focused=true (quiet at launch), bell+OSC only after focus-out", () => {
  const writer = new CaptureWriter();
  const notifier = new AttentionNotifier(writer);
  // Scope §1.1: default focused=true — DEC 1004 reports only on CHANGE, so a
  // terminal focused at launch never sends focus-in. Defaulting to focused
  // means the first turn_end does NOT ring the bell while the operator watches.
  assert.ok(notifier.isFocused, "notifier defaults to focused=true (quiet)");
  notifier.notify("Turn complete");
  assert.equal(writer.out.length, 0, "no notification at default focus (operator is watching)");

  notifier.setFocused(false);
  notifier.notify("Turn complete");
  const seqs = writer.out.join("");
  assert.ok(seqs.includes("\x07"), "a bell must fire when unfocused");
  assert.ok(seqs.includes("\x1b]9;"), "OSC 9 must fire when unfocused");
  assert.ok(seqs.includes("\x1b]777;notify;"), "OSC 777 must fire when unfocused");

  writer.out.length = 0;
  notifier.setFocused(true);
  notifier.notify("Turn complete");
  assert.equal(writer.out.length, 0, "no notification must fire when focused (again)");

  notifier.setFocused(false);
  notifier.notify("Permission required: write_file");
  assert.ok(writer.out.length > 0, "notifications resume after focus-out");
});

test("focus events: isFocusIn / isFocusOut detect DEC 1004 payloads", () => {
  assert.ok(isFocusIn("\x1b[I"), "focus-in detected");
  assert.ok(isFocusOut("\x1b[O"), "focus-out detected");
  assert.ok(!isFocusIn("\x1b[O"), "focus-in not confused with focus-out");
});

// ── 3. Frecency ranking (pure, no TUI) — scope §1.4 ─────────────────────────

test("frecency score: count / (1 + ageHours)", () => {
  const now = 10 * 3_600_000; // 10h in ms
  const fresh = frecencyScore({ text: "a", count: 5, lastUsed: now }, now);
  const old = frecencyScore({ text: "b", count: 5, lastUsed: 0 }, now);
  assert.ok(fresh > old, "a just-used prompt outscores an equally-frequent old one");
  assert.equal(frecencyScore({ text: "c", count: 3, lastUsed: now }, now), 3, "age=0 ⇒ score = count");
});

test("frecency ranking: best first, ties break on lastUsed then text", () => {
  const now = 1_000_000;
  const entries: FrecencyEntry[] = [
    { text: "rare-old", count: 1, lastUsed: now - 100 * 3_600_000 },
    { text: "hot", count: 10, lastUsed: now - 1000 },
    { text: "warm", count: 5, lastUsed: now - 2000 },
  ];
  const ranked = rankFrecency(entries, now);
  assert.equal(ranked[0]!.text, "hot");
  assert.equal(ranked[1]!.text, "warm");
  assert.equal(ranked[2]!.text, "rare-old");
  assert.equal(entries[0]!.text, "rare-old", "input untouched (pure)");
});

test("frecency history: load → record → save → reload round-trip", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ok-frecency-"));
  try {
    const file = path.join(dir, "history.json");
    const h1 = new FrecencyHistory(file);
    h1.record("hello", 1000);
    h1.record("world", 2000);
    h1.record("hello", 3000); // count 2
    await h1.save();

    const h2 = new FrecencyHistory(file);
    await h2.load();
    const ranked = h2.ranked(4000);
    assert.equal(ranked.length, 2);
    assert.equal(ranked[0]!.text, "hello");
    assert.equal(ranked[0]!.count, 2);

    const h3 = new FrecencyHistory(path.join(dir, "nope.json"));
    await h3.load();
    assert.equal(h3.ranked(0).length, 0, "missing file ⇒ empty, no throw");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test("frecency seeding: most-frecent entry is recalled first (history[0] = best)", async () => {
  // The rework defect: seedHistory() iterated ranked best-first calling
  // addToHistory, but pi-tui editor unshifts (prepends) and navigateHistory
  // reads history[0], so the LAST added (least-frecent) was recalled first.
  // The fix: seed in reverse (worst-first) so the best entry lands at
  // history[0]. This test checks the editor's internal history array directly.
  const dir = await mkdtemp(path.join(tmpdir(), "ok-seed-"));
  try {
    const file = path.join(dir, "history.json");
    const history = new FrecencyHistory(file);
    // "best" has the highest frecency (count 10, used most recently).
    history.record("worst", 1_000);      // count 1, very old
    history.record("middle", 2_000);     // count 1, less old
    history.record("best", 3_000);       // count 1, most recent
    await history.save();

    const sessionId = "01SEEDORDER00008";
    const faux = fauxProvider({});
    const models = createModels();
    models.setProvider(faux.provider);
    const transport = new InProcessTransport({
      sessionId,
      modelId: "faux-1",
      models,
      provider: "faux",
      cwd: process.cwd(),
    });
    const store = new SessionStore({ root: dir, sessionId });
    await store.ensure();
    const app = buildTuiApp(headlessTui(24), {
      transport,
      modelId: "faux-1",
      sessionId,
      persistMode: "local",
      store,
      sessionsRoot: dir,
      history,
    });

    await app.controller.seedHistory();

    // The editor's history is private at the TS level, but accessible at
    // runtime. history[0] is what up-arrow recalls first.
    const editorHistory = (app.composer.editor as unknown as { history: string[] }).history;
    assert.equal(editorHistory[0], "best", "most-frecent entry must be at history[0] (recalled first on up-arrow)");
    assert.equal(editorHistory[1], "middle", "second-frecent entry at history[1]");
    assert.equal(editorHistory[2], "worst", "least-frecent entry at history[2] (recalled last)");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// ── 4. Prompt stash (pure) — scope §1.4 ─────────────────────────────────────

test("stash: LIFO push/pop, empty drafts ignored", () => {
  const stash = new PromptStash();
  assert.ok(stash.isEmpty);
  stash.push("");
  assert.equal(stash.size, 0, "empty drafts are ignored");
  stash.push("draft one");
  stash.push("draft two");
  assert.equal(stash.size, 2);
  assert.equal(stash.peek(), "draft two");
  assert.equal(stash.pop(), "draft two");
  assert.equal(stash.pop(), "draft one");
  assert.equal(stash.pop(), undefined);
  assert.ok(stash.isEmpty);
});

// ── 5. /btw side channel — system block, never a user turn (scope §1.5) ────

test("btw: answer streams into a btw block, not a user/assistant turn", () => {
  const t = new Transcript("openkai");
  t.beginBtwTurn("what version is this?");
  t.applyEvent({ kind: "connected" });
  t.applyEvent({ kind: "delta", field: "text", delta: "It is v0.1.0." });
  t.applyEvent({ kind: "turn_end" });

  const kinds = t.blockKinds();
  assert.ok(kinds.includes("btw"), "a btw block must exist");
  assert.ok(!kinds.includes("user"), "the side question must NOT render as a user turn");
  assert.ok(!kinds.includes("assistant"), "the side answer must NOT render as an assistant block");
  assert.equal(t.lastAssistantText(), "", "lastAssistantText is empty ⇒ persistTurn is a no-op");

  const frame = t.render(80).map(stripAnsi).join("\n");
  assert.ok(frame.includes("what version is this?"), "the btw question header renders");
  assert.ok(frame.includes("It is v0.1.0."), "the btw answer streams into the block");
});


test("btw (controller): does NOT re-persist the prior assistant turn at turn_end (scope §1.5)", async () => {
  // The rework defect: turn_end called persistTurn() unconditionally; with a
  // prior assistant block in the transcript, lastAssistantText() returned
  // that block's text, so every /btw appended a duplicate assistant message
  // to the session JSONL. The fix: a btwTurn flag skips persistTurn for btw
  // turns. This test proves the fix with a prior assistant block present.
  const sessionId = "01BTWPERSIST0007";
  const faux = fauxProvider({});
  faux.setResponses([fauxAssistantMessage([fauxText("Side answer.")])]);
  const models = createModels();
  models.setProvider(faux.provider);
  const transport = new InProcessTransport({
    sessionId,
    modelId: "faux-1",
    models,
    provider: "faux",
    cwd: process.cwd(),
  });
  const dir = await mkdtemp(path.join(tmpdir(), "ok-btw-persist-"));
  try {
    const store = new SessionStore({ root: dir, sessionId });
    await store.ensure();
    const app = buildTuiApp(headlessTui(24), {
      transport,
      modelId: "faux-1",
      sessionId,
      persistMode: "local",
      store,
      sessionsRoot: dir,
    });

    // Simulate a prior normal turn that was persisted: a user message + an
    // assistant message in the store, and a matching assistant block in the
    // transcript so lastAssistantText() returns non-empty.
    await store.appendMessage({ role: "user", content: "first question", timestamp: 1 } as never);
    await store.appendMessage({ role: "assistant", content: [{ type: "text", text: "Answer one." }], timestamp: 2 } as never);
    app.transcript.replayAssistant("Answer one.");

    // Drive a /btw side-channel turn through the controller.
    await app.controller.btw("side question");
    await transport.close();
    await app.controller.consume();

    // The store must NOT have gained a duplicate assistant message.
    const entries = await store.readEntries();
    const messages = entries.filter((e) => e.type === "message");
    const assistantCount = messages.filter(
      (e) => (e as { message: { role: string } }).message.role === "assistant",
    ).length;
    assert.equal(assistantCount, 1, "btw turn_end must NOT re-persist the prior assistant block");

    // The btw block must exist in the transcript (the side answer streamed in).
    const kinds = app.transcript.blockKinds();
    assert.ok(kinds.includes("btw"), "the btw block rendered");
    assert.ok(!kinds.includes("user"), "the side question never rendered as a user turn");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
// ── 6. /undo surface — wired to onUndo (scope §1.6) ───────────────────────

async function buildControllerWithUndo(onUndo?: () => Promise<string>) {
  const sessionId = "01UNDOTEST000009";
  const transport = fauxTransport(sessionId);
  const dir = await mkdtemp(path.join(tmpdir(), "ok-undo-"));
  const store = new SessionStore({ root: dir, sessionId });
  await store.ensure();
  const app = buildTuiApp(headlessTui(24), {
    transport,
    modelId: "faux-1",
    sessionId,
    persistMode: "local",
    store,
    sessionsRoot: dir,
    onUndo,
  });
  return { app, dir };
}

test("undo: restores and renders the snapshot sha as a system notice", async () => {
  const { app, dir } = await buildControllerWithUndo(async () => "abc123def4567890");
  try {
    await app.controller.undo();
    const frame = app.transcript.render(80).map(stripAnsi).join("\n");
    assert.ok(frame.includes("restored to snapshot abc123def4"), "the restored sha (truncated) renders");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("undo: reports unavailable when the gate is not wired", async () => {
  const { app, dir } = await buildControllerWithUndo(undefined);
  try {
    await app.controller.undo();
    const frame = app.transcript.render(80).map(stripAnsi).join("\n");
    assert.ok(frame.includes("unavailable"), "/undo reports unavailable without onUndo");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("undo: surfaces errors from onUndo (e.g. nothing to undo)", async () => {
  const { app, dir } = await buildControllerWithUndo(async () => {
    throw new Error("nothing to undo");
  });
  try {
    await app.controller.undo();
    const frame = app.transcript.render(80).map(stripAnsi).join("\n");
    assert.ok(frame.includes("nothing to undo"), "the onUndo error message renders");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── 7. Per-agent identity (scope §1.2) — stable colour + pill ──────────────

test("identity: roleColour is stable + distinct across roles", () => {
  const a = roleColour("architect");
  const b = roleColour("builder");
  assert.equal(roleColour("architect"), a, "same role ⇒ same colour (stable)");
  assert.notEqual(a, b, "different roles differ in colour");
});

test("identity: pill is a bracketed uppercased label; long roles truncate", () => {
  const pill = stripAnsi(rolePill("openkai"));
  assert.ok(/^\[.*\]$/.test(pill), "pill is bracketed");
  assert.ok(pill.includes("OPENKAI"), "pill label is uppercased");
  assert.ok(roleLabel("a-very-long-role-name").length <= 10, "label truncates to ≤10");
});
