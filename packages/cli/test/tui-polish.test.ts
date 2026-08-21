/**
 * E017 TUI polish tests — the dossier cherry-picks' observable contracts:
 * steer-while-busy, word-level diff pairing, bracketed-paste decode,
 * atomic-token backspace, session search query language, fork picker flow,
 * /export HTML shape, task progress rows, history-search highlight + age
 * labels. Deterministic + offline: pure functions, headless components, and
 * a faux-backed controller (no real terminal, no network). Runner: node:test.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxProvider } from "@earendil-works/pi-ai/providers/faux";
import type { TUI } from "@earendil-works/pi-tui";

import { InProcessTransport, SessionStore } from "@kaidera/openkai-core";
import { buildTuiApp, type ExitRequest } from "../dist/tui/app.js";
import { Transcript, extractTaskProgress } from "../dist/tui/transcript.js";
import { renderDiff, renderIntraLineDiff, diffWordsPure, DiffOverlay } from "../dist/tui/diff.js";
import {
  decodeReencodedPasteControls,
  sanitizePastedText,
  decodePastedChunk,
  atomicTokenAt,
} from "../dist/tui/paste.js";
import {
  parseSearchQuery,
  filterAndSortSessions,
  sessionNameFromEntries,
  readSessionSearchRows,
  type SessionSearchRow,
} from "../dist/tui/session-search.js";
import { exportSessionToHtml, xterm256ToHex } from "../dist/tui/export-html.js";
import { highlightTokens, queryTokens, relativeTime } from "../dist/tui/history-search.js";

/** Strip ANSI escape sequences for plain-text assertions. */
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** A minimal headless TUI stub that captures the shown overlay. */
function headlessTui(rows = 24): { tui: TUI; shown: () => unknown; hidden: () => number } {
  const noop = (): void => {};
  let overlay: unknown;
  let hideCount = 0;
  const tui = {
    terminal: { rows, columns: 80 } as TUI["terminal"],
    mode: "fullscreen" as const,
    children: [] as unknown as TUI["children"],
    addChild: noop as unknown as TUI["addChild"],
    getShowHardwareCursor: () => false,
    setFocus: noop as unknown as TUI["setFocus"],
    showOverlay: ((c: unknown) => {
      overlay = c;
    }) as unknown as TUI["showOverlay"],
    hideOverlay: (() => {
      hideCount += 1;
    }) as unknown as TUI["hideOverlay"],
    hasOverlay: () => overlay !== undefined,
    start: noop,
    stop: noop as unknown as TUI["stop"],
    requestRender: noop,
    addInputListener: (() => () => {}) as unknown as TUI["addInputListener"],
    invalidate: noop,
    render: () => [],
  } as unknown as TUI;
  return { tui, shown: () => overlay, hidden: () => hideCount };
}

/** A faux-backed transport (no network) — the agent exists but never runs. */
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

// ── Steer-while-busy (pick 2) ──────────────────────────────────────────────

test("steer: submitting mid-turn steers, renders → steering, and persists", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ok-polish-steer-"));
  try {
    const sessionId = "01STEERTEST000001";
    const transport = fauxTransport(sessionId);
    const steered: string[] = [];
    const steer = transport.steer.bind(transport);
    transport.steer = (text: string): void => {
      steered.push(text);
      steer(text);
    };
    const store = new SessionStore({ root, sessionId });
    await store.ensure();
    const { tui } = headlessTui();
    const app = buildTuiApp(tui, {
      transport,
      modelId: "faux-1",
      sessionId,
      persistMode: "local",
      store,
      sessionsRoot: root,
    });

    // A turn connects → the controller is busy.
    app.controller.applyEvent({ sessionId, seq: 1, kind: "connected" });
    await app.controller.submit("actually use the auth flow");

    assert.deepEqual(steered, ["actually use the auth flow"], "busy submit routes to transport.steer");
    const frame = stripAnsi(app.transcript.render(80).join("\n"));
    assert.ok(frame.includes("→ steering"), "steered message renders the dim steering suffix");
    assert.ok(!frame.includes("wait for it to settle"), "the old rejection notice is gone");
    const entries = await store.readEntries();
    const persisted = entries.filter((e) => e.type === "message");
    assert.equal(persisted.length, 1, "the steered message persists as a user entry");
    assert.ok(persisted[0]!.type === "message" && "role" in persisted[0]!.message && persisted[0]!.message.role === "user");
    // Settle the turn so the busy-tick interval clears (keeps node --test exit clean).
    app.controller.applyEvent({ sessionId, seq: 2, kind: "turn_end" });
    await store.close();
    await transport.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ── Word-level diff (pick 3) ───────────────────────────────────────────────

test("word diff: paired -/+ rows inverse-highlight only the changed words", () => {
  const rendered = renderDiff([
    "diff --git a/f.ts b/f.ts",
    "@@ -1,2 +1,2 @@",
    " const one = 1;",
    "-const two = 2;",
    "+const two = 3;",
  ]);
  const del = rendered.find((l) => l.includes("-const two"))!;
  const add = rendered.find((l) => l.includes("+const two"))!;
  assert.ok(del.includes("\x1b[7m2\x1b[27m"), "the removed word is inverse-highlighted");
  assert.ok(!del.includes("\x1b[7mconst\x1b[27m"), "unchanged words stay flat");
  assert.ok(add.includes("\x1b[7m3\x1b[27m"), "the added word is inverse-highlighted");
  // Stable ≥3-digit gutter; the pair's repeated number blanks on the + row.
  assert.ok(stripAnsi(del).startsWith("  2 │ "), "del row carries the 3-digit gutter");
  assert.ok(!stripAnsi(add).includes("│"), "the pair's repeated gutter is blanked on the + row");
  assert.ok(/^\s+\+/.test(stripAnsi(add)), "the blanked gutter is pure whitespace");
  // Hunk header keeps its own tint, no gutter.
  const hunk = rendered.find((l) => l.includes("@@"))!;
  assert.ok(!hunk.includes("│"), "hunk header has no gutter");
});

test("word diff: multi-line change runs fall back to whole-line tint", () => {
  const rendered = renderDiff(["@@ -1,2 +1 @@", "-alpha", "-beta", "+gamma"]);
  assert.ok(rendered.every((l) => !l.includes("\x1b[7m")), "no inverse highlight on unpaired runs");
  assert.ok(rendered.some((l) => l.includes("-alpha")), "whole-line tint still renders");
});

test("word diff: diffWordsPure pairs tokens (pure-JS, no diff package)", () => {
  const parts = diffWordsPure("const a = old_value;", "const a = new_value;");
  const removed = parts.filter((p) => p.removed).map((p) => p.value).join("");
  const added = parts.filter((p) => p.added).map((p) => p.value).join("");
  assert.equal(removed, "old_value", "snake_case is one word token");
  assert.equal(added, "new_value");
  const equal = parts.filter((p) => !p.removed && !p.added).map((p) => p.value).join("");
  assert.ok(equal.includes("const a = "), "shared tokens pass through as equal");
  // renderIntraLineDiff keeps leading whitespace flat.
  const { removedLine } = renderIntraLineDiff("    call(old)", "    call(new)");
  assert.ok(!removedLine.startsWith("\x1b[7m"), "indentation is never inversed");
});

test("word diff: the overlay keeps its scroll mechanics over rendered rows", () => {
  const overlay = new DiffOverlay("t", Array.from({ length: 30 }, (_, i) => ` line ${i + 1}`), () => undefined, 10);
  assert.equal(overlay.lineCount, 30);
  overlay.handleInput("\x1b[B"); // down
  assert.equal(overlay.scrollOffset, 1);
  overlay.handleInput("\x1b[6~"); // pageDown
  assert.equal(overlay.scrollOffset, 11);
  overlay.handleInput("\x1b[H"); // home
  assert.equal(overlay.scrollOffset, 0);
});

// ── Bracketed-paste decode (pick 4) ────────────────────────────────────────

test("paste decode: both re-encoded control-byte formats decode", () => {
  assert.equal(decodeReencodedPasteControls("\x1b[106;5u"), "\n", "csi-u Ctrl+J → newline");
  assert.equal(decodeReencodedPasteControls("\x1b[27;5;106~"), "\n", "xterm Ctrl+J → newline");
  assert.equal(decodeReencodedPasteControls("\x1b[97;5u"), "\x01", "a → Ctrl+A");
  assert.equal(decodeReencodedPasteControls("\x1b[65;5u"), "\x01", "A → Ctrl+A");
  assert.equal(decodeReencodedPasteControls("\x1b[50;5u"), "\x1b[50;5u", "non-letter codes pass through");
  assert.equal(decodeReencodedPasteControls("plain text"), "plain text", "ordinary input untouched");
});

test("paste decode: sanitiser NFC-normalises (macOS NFD drag-drop)", () => {
  assert.equal(sanitizePastedText("é"), "é", "NFD composing pair → NFC");
  assert.equal(sanitizePastedText("\x1b[27;5;106~"), "\n", "decode + normalise compose");
});

test("paste decode: chunk transform covers spans and stray sequences", () => {
  const chunk = decodePastedChunk("\x1b[200~café\x1b[201~");
  assert.ok(chunk.includes("café"), "complete paste span is NFC-normalised");
  assert.equal(decodePastedChunk("abc"), "abc", "no escapes → identity");
});

test("paste decode: the composer decodes xterm-format pastes before the editor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ok-polish-paste-"));
  try {
    const sessionId = "01PASTETEST000001";
    const transport = fauxTransport(sessionId);
    const store = new SessionStore({ root, sessionId });
    await store.ensure();
    const { tui } = headlessTui();
    const app = buildTuiApp(tui, {
      transport,
      modelId: "faux-1",
      sessionId,
      persistMode: "local",
      store,
      sessionsRoot: root,
    });
    // tmux/kitty xterm-format re-encoded newline inside a bracketed paste.
    app.composer.editor.handleInput("\x1b[200~line1\x1b[27;5;106~line2\x1b[201~");
    const text = app.composer.editor.getText();
    assert.equal(text, "line1\nline2", "the re-encoded newline lands as a newline");
    assert.ok(!text.includes("[27;5"), "no printable escape tail leaks into the buffer");
    await store.close();
    await transport.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ── Atomic-token backspace (pick 5) ────────────────────────────────────────

test("atomic backspace: helper finds the token span containing a column", () => {
  const line = "ab [paste #1 +2 lines] cd";
  const start = 3;
  const end = 3 + "[paste #1 +2 lines]".length;
  assert.equal(atomicTokenAt(line, 2), undefined, "before the token → no hit");
  assert.deepEqual(atomicTokenAt(line, 3), { start, end }, "first column inside");
  assert.deepEqual(atomicTokenAt(line, end - 1), { start, end }, "last column inside");
  assert.equal(atomicTokenAt(line, end), undefined, "one past the token → no hit");
  assert.equal(atomicTokenAt("no markers here", 3), undefined, "no token on the line");
});

test("atomic backspace: cursor inside an unregistered marker deletes it whole", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ok-polish-atomic-"));
  try {
    const sessionId = "01ATOMICTEST00001";
    const transport = fauxTransport(sessionId);
    const store = new SessionStore({ root, sessionId });
    await store.ensure();
    const { tui } = headlessTui();
    const app = buildTuiApp(tui, {
      transport,
      modelId: "faux-1",
      sessionId,
      persistMode: "local",
      store,
      sessionsRoot: root,
    });
    // A restored draft: setText leaves the paste registry empty, so the
    // vendored editor would eat the marker one character at a time.
    const marker = "[paste #1 +2 lines]";
    app.composer.editor.setText(`x ${marker} y`);
    const endCol = 2 + marker.length + 2; // "x " + marker + " y"
    // Step the cursor into the middle of the marker (col 10).
    for (let i = endCol; i > 10; i -= 1) app.composer.editor.handleInput("\x1b[D");
    assert.equal(app.composer.editor.getCursor().col, 10);
    app.composer.editor.handleInput("\x7f");
    assert.equal(app.composer.editor.getText(), "x  y", "one backspace deletes the whole marker");
    assert.equal(app.composer.editor.getCursor().col, 2, "cursor lands at the marker's start");
    await store.close();
    await transport.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ── Session search query language (pick 5) ─────────────────────────────────

function searchRow(over: Partial<SessionSearchRow>): SessionSearchRow {
  return {
    id: "01SESSION0000000001",
    firstUserMessage: "",
    allMessagesText: "",
    cwd: "/tmp/project",
    modified: 1000,
    messageCount: 2,
    ...over,
  };
}

test("search parsing: re: regex, quoted phrases, fuzzy tokens, graceful fallback", () => {
  const regex = parseSearchQuery("re:auth.*flow");
  assert.equal(regex.mode, "regex");
  assert.ok(regex.regex!.test("the auth login flow"), "compiled case-insensitive regex");

  assert.equal(parseSearchQuery("re:").error, "Empty regex");
  assert.ok(parseSearchQuery("re:[").error !== undefined, "bad regex reports an error");

  const quoted = parseSearchQuery('foo "node cve" bar');
  assert.deepEqual(
    quoted.tokens,
    [
      { kind: "fuzzy", value: "foo" },
      { kind: "phrase", value: "node cve" },
      { kind: "fuzzy", value: "bar" },
    ],
    "quotes produce phrase tokens",
  );

  const unbalanced = parseSearchQuery('foo "unclosed');
  assert.ok(unbalanced.tokens.every((t) => t.kind === "fuzzy"), "unbalanced quotes degrade to whitespace tokens");
  assert.equal(unbalanced.tokens.length, 2);

  assert.deepEqual(parseSearchQuery("").tokens, [], "empty query matches everything");
});

test("search: relevance ordering, recency tie-break, regex + error paths", () => {
  const rows = [
    searchRow({ id: "01AAAA", allMessagesText: "padding padding auth fix", modified: 100 }),
    searchRow({ id: "01BBBB", allMessagesText: "auth fix immediately", modified: 200 }),
    searchRow({ id: "01CCCC", allMessagesText: "unrelated content", modified: 300 }),
  ];
  const hits = filterAndSortSessions(rows, "auth", "relevance");
  assert.deepEqual(
    hits.map((r) => r.id),
    ["01BBBB", "01AAAA"],
    "earlier match scores better; non-matches drop out",
  );

  const phrase = filterAndSortSessions(rows, '"auth fix"', "relevance");
  assert.equal(phrase.length, 2, "quoted phrase matches the substring");

  const regexed = filterAndSortSessions(rows, "re:fix im", "relevance");
  assert.deepEqual(regexed.map((r) => r.id), ["01BBBB"], "regex mode matches anywhere in the corpus");

  assert.deepEqual(filterAndSortSessions(rows, "re:[", "relevance"), [], "a parse error matches nothing");

  const recent = filterAndSortSessions(rows, "auth", "recent");
  assert.deepEqual(
    recent.map((r) => r.id),
    ["01AAAA", "01BBBB"],
    "recent mode filters only, keeping incoming order",
  );
});

// ── Fork picker flow (contract #2 consumer) ────────────────────────────────

test("fork picker: picking a past message forks there, prefills, and switches session", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ok-polish-fork-"));
  try {
    const sessionId = "01FORKTEST0000001";
    const transport = fauxTransport(sessionId);
    const store = new SessionStore({ root, sessionId });
    await store.ensure();
    await store.appendMessage({ role: "user", content: "first prompt", timestamp: Date.now() });
    await store.appendMessage({ role: "user", content: "second prompt", timestamp: Date.now() });
    const exited = Promise.withResolvers<ExitRequest>();
    const { tui, shown } = headlessTui();
    const app = buildTuiApp(tui, {
      transport,
      modelId: "faux-1",
      sessionId,
      persistMode: "local",
      store,
      sessionsRoot: root,
      // forkAt() fires onExit as its LAST step — awaiting this promise is
      // awaiting the fork itself (no wall-clock guessing).
      onExit: (request) => exited.resolve(request),
    });

    await app.controller.dispatchCommand("fork", "");
    const picker = shown() as { handleInput: (d: string) => void; render: (w: number) => string[] };
    assert.ok(picker !== undefined && typeof picker.handleInput === "function", "the fork overlay opens");
    const frame = stripAnsi(picker.render(80).join("\n"));
    assert.ok(frame.includes("second prompt"), "the newest message rows first");
    assert.ok(frame.includes("message 2 of 2"), "position metadata renders");

    picker.handleInput("\r"); // Enter on the newest message
    const exit = await exited.promise;
    assert.ok(exit.kind === "restart", "switching reuses the /resume restart mechanics");
    if (exit.kind === "restart") {
      assert.ok(exit.sessionId !== undefined && exit.sessionId !== sessionId, "a NEW session id");
      assert.equal(exit.prefill, "second prompt", "the picked text rides the restart as prefill");
      // The fork holds the root→picked path: both user messages.
      const forkStore = new SessionStore({ root, sessionId: exit.sessionId });
      const forkEntries = await forkStore.readEntries();
      assert.equal(forkEntries.filter((e) => e.type === "message").length, 2, "the fork carries the path to the pick");
      await forkStore.close();
    }
    assert.equal(app.composer.editor.getText(), "second prompt", "the picked text lands in the composer");
    await store.close();
    await transport.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ── /export (pick 8) ───────────────────────────────────────────────────────

test("export: self-contained HTML with theme colours, escaped content, no externals", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ok-polish-export-"));
  try {
    const sessionId = "01EXPORTTEST00001";
    const store = new SessionStore({ root, sessionId });
    await store.ensure();
    await store.appendMessage({ role: "user", content: "hello <b>world</b>", timestamp: Date.now() });
    await store.appendCustom("session_name", { name: "export me" });
    const entries = await store.readEntries();
    assert.equal(sessionNameFromEntries(entries), "export me", "the /name entry reads back");

    const html = exportSessionToHtml({ sessionId, name: sessionNameFromEntries(entries), entries, exportedAt: 0 });
    assert.ok(html.startsWith("<!DOCTYPE html>"), "a full document");
    assert.ok(html.includes("<style>"), "inline CSS");
    assert.ok(!html.includes("<script"), "no scripts");
    assert.ok(!/src="http|href="http/.test(html), "no external references");
    assert.ok(html.includes(sessionId), "the session id renders");
    assert.ok(html.includes("export me"), "the display name renders");
    assert.ok(html.includes("hello &lt;b&gt;world&lt;/b&gt;"), "model/user text is HTML-escaped");
    assert.ok(!html.includes("hello <b>world</b>"), "no raw markup survives");
    assert.ok(html.includes("#b0e1cd"), "HTML uses exact Kaidera mint rather than the terminal fallback");
    assert.ok(!html.includes("#afd7d7"), "xterm index 152 stays a terminal-only fallback");
    await store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("export: /export command writes the file", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ok-polish-expcmd-"));
  try {
    const sessionId = "01EXPCMDTEST00001";
    const transport = fauxTransport(sessionId);
    const store = new SessionStore({ root, sessionId });
    await store.ensure();
    await store.appendMessage({ role: "user", content: "export this session", timestamp: Date.now() });
    const { tui } = headlessTui();
    const app = buildTuiApp(tui, {
      transport,
      modelId: "faux-1",
      sessionId,
      persistMode: "local",
      store,
      sessionsRoot: root,
      cwd: root,
    });
    const target = path.join(root, "out.html");
    await app.controller.dispatchCommand("export", target);
    const written = await readFile(target, "utf-8");
    assert.ok(written.includes("export this session"), "the transcript content lands in the file");
    assert.ok(written.startsWith("<!DOCTYPE html>"), "the file is the HTML document");
    await store.close();
    await transport.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("export: xterm256ToHex covers base16, cube, and greyscale", () => {
  assert.equal(xterm256ToHex(0), "#000000");
  assert.equal(xterm256ToHex(15), "#ffffff");
  assert.equal(xterm256ToHex(39), "#00afff", "representative colour-cube index");
  assert.equal(xterm256ToHex(152), "#afd7d7", "Kaidera mint's deterministic 256-colour fallback");
  assert.equal(xterm256ToHex(234), "#1c1c1c", "greyscale ramp (the panel background)");
});

// ── Task progress rows (contract #3 consumer) ──────────────────────────────

test("task rows: live progress renders prompt · tools · current tool; settled keeps stats", () => {
  const transcript = new Transcript("tester");
  transcript.applyEvent({ kind: "tool_call", toolCallId: "c1", toolName: "task", args: { prompt: "fix the auth flow" } });
  transcript.applyEvent({
    kind: "tool_update",
    toolCallId: "c1",
    toolName: "task",
    partial: {
      content: [],
      details: { status: "running", currentTool: "bash", toolCount: 12, turnDepth: 2, sessionId: "child1", elapsedMs: 4200 },
    },
  });
  const live = stripAnsi(transcript.render(80).join("\n"));
  assert.ok(live.includes("●"), "the running dot renders");
  assert.ok(live.includes("task: fix the auth flow"), "the prompt preview renders");
  assert.ok(live.includes("12 tools"), "the tool count renders");
  assert.ok(live.includes("bash"), "the current tool trails the stats");

  transcript.applyEvent({
    kind: "tool_result",
    toolCallId: "c1",
    toolName: "task",
    result: { content: [{ type: "text", text: "auth flow fixed" }] },
    isError: false,
  });
  const settled = stripAnsi(transcript.render(80).join("\n"));
  assert.ok(settled.includes("12 tools"), "the settled card keeps the stats line");
  assert.ok(settled.includes("4.2s"), "elapsed time renders");
  assert.ok(settled.includes("auth flow fixed"), "the result text renders");
});

test("task rows: extractTaskProgress narrows partials defensively", () => {
  assert.equal(extractTaskProgress(undefined), undefined);
  assert.equal(extractTaskProgress({}), undefined);
  assert.equal(extractTaskProgress({ details: { status: "running" } }), undefined, "missing numeric fields reject");
  const good = extractTaskProgress({
    content: [],
    details: { status: "running", toolCount: 1, turnDepth: 0, sessionId: "s", elapsedMs: 10 },
  });
  assert.equal(good?.toolCount, 1);
});

// ── History search extras (pick 6) ─────────────────────────────────────────

test("history search: token highlighting merges overlapping ranges", () => {
  const tokens = queryTokens("aa aa");
  assert.deepEqual(tokens, ["aa", "aa"], "the query tokenises per word");
  const out = highlightTokens("aaxx", tokens);
  assert.equal(stripAnsi(out), "aaxx", "plain text is preserved");
  const wraps = out.match(/\x1b\[38;5;152m/g) ?? [];
  assert.equal(wraps.length, 1, "duplicate token ranges collapse into one highlight");
  const twice = highlightTokens("the quick brown quick", ["quick"]);
  assert.equal((twice.match(/\x1b\[38;5;152m/g) ?? []).length, 2, "both occurrences highlight");
  assert.equal(highlightTokens("nothing here", ["zzz"]), "nothing here", "no match → untouched");
});

test("history search: relative-time ladder", () => {
  const now = 1_000_000_000_000;
  assert.equal(relativeTime(now - 5_000, now), "now");
  assert.equal(relativeTime(now - 5 * 60_000, now), "5m");
  assert.equal(relativeTime(now - 2 * 3_600_000, now), "2h");
  assert.equal(relativeTime(now - 3 * 86_400_000, now), "3d");
  assert.equal(relativeTime(now - 14 * 86_400_000, now), "2w");
  assert.equal(relativeTime(now - 180 * 86_400_000, now), "6mo");
  assert.equal(relativeTime(now - 400 * 86_400_000, now), "1y");
});

// ── readSessionSearchRows: name + corpus read-back ─────────────────────────

test("session rows: the reader surfaces names, parents, and the search corpus", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ok-polish-rows-"));
  try {
    const store = new SessionStore({ root, sessionId: "01ROWTEST00000001" });
    await store.ensure();
    await store.appendMessage({ role: "user", content: "searchable unique phrase", timestamp: Date.now() });
    await store.appendCustom("session_name", { name: "named session" });
    await store.close();

    const rows = await readSessionSearchRows(root);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "named session", "the /name entry surfaces");
    assert.ok(rows[0]!.allMessagesText.includes("searchable unique phrase"), "the corpus is joined");
    assert.equal(rows[0]!.messageCount, 1);

    const hits = filterAndSortSessions(rows, "searchable", "relevance");
    assert.equal(hits.length, 1, "the corpus drives search hits");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
