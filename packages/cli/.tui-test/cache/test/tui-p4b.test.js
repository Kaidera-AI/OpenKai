//# hash=dfcea94b68137955ed59111ce5c1c2a9
//# sourceMappingURL=tui-p4b.test.js.map

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
    try {
        var info = gen[key](arg);
        var value = info.value;
    } catch (error) {
        reject(error);
        return;
    }
    if (info.done) resolve(value);
    else Promise.resolve(value).then(_next, _throw);
}
function _async_to_generator(fn) {
    return function() {
        var self = this, args = arguments;
        return new Promise(function(resolve, reject) {
            var gen = fn.apply(self, args);
            function _next(value) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
            }
            function _throw(err) {
                asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
            }
            _next(undefined);
        });
    };
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
}
function _defineProperties(target, props) {
    for(var i = 0; i < props.length; i++){
        var descriptor = props[i];
        descriptor.enumerable = descriptor.enumerable || false;
        descriptor.configurable = true;
        if ("value" in descriptor) descriptor.writable = true;
        Object.defineProperty(target, descriptor.key, descriptor);
    }
}
function _create_class(Constructor, protoProps, staticProps) {
    if (protoProps) _defineProperties(Constructor.prototype, protoProps);
    if (staticProps) _defineProperties(Constructor, staticProps);
    return Constructor;
}
function _define_property(obj, key, value) {
    if (key in obj) {
        Object.defineProperty(obj, key, {
            value: value,
            enumerable: true,
            configurable: true,
            writable: true
        });
    } else obj[key] = value;
    return obj;
}
function _ts_generator(thisArg, body) {
    var f, y, t, _ = {
        label: 0,
        sent: function() {
            if (t[0] & 1) throw t[1];
            return t[1];
        },
        trys: [],
        ops: []
    }, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype), d = Object.defineProperty;
    return d(g, "next", {
        value: verb(0)
    }), d(g, "throw", {
        value: verb(1)
    }), d(g, "return", {
        value: verb(2)
    }), typeof Symbol === "function" && d(g, Symbol.iterator, {
        value: function() {
            return this;
        }
    }), g;
    function verb(n) {
        return function(v) {
            return step([
                n,
                v
            ]);
        };
    }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while(g && (g = 0, op[0] && (_ = 0)), _)try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [
                op[0] & 2,
                t.value
            ];
            switch(op[0]){
                case 0:
                case 1:
                    t = op;
                    break;
                case 4:
                    _.label++;
                    return {
                        value: op[1],
                        done: false
                    };
                case 5:
                    _.label++;
                    y = op[1];
                    op = [
                        0
                    ];
                    continue;
                case 7:
                    op = _.ops.pop();
                    _.trys.pop();
                    continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
                        _ = 0;
                        continue;
                    }
                    if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
                        _.label = op[1];
                        break;
                    }
                    if (op[0] === 6 && _.label < t[1]) {
                        _.label = t[1];
                        t = op;
                        break;
                    }
                    if (t && _.label < t[2]) {
                        _.label = t[2];
                        _.ops.push(op);
                        break;
                    }
                    if (t[2]) _.ops.pop();
                    _.trys.pop();
                    continue;
            }
            op = body.call(thisArg, _);
        } catch (e) {
            op = [
                6,
                e
            ];
            y = 0;
        } finally{
            f = t = 0;
        }
        if (op[0] & 5) throw op[1];
        return {
            value: op[0] ? op[1] : void 0,
            done: true
        };
    }
}
/**
 * P4b TUI tests — the six scope-§1 features (scope §3 verify).
 *
 * Deterministic + offline: palette/attention/frecency/stash are exercised as
 * pure functions + headless components (no real terminal). `/btw` and `/undo`
 * use the controller with a headless TUI stub + a stubbed `onUndo`. All colour
 * decisions are in theme.ts — no ad-hoc literals. Test runner: node:test.
 */ import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText } from "@earendil-works/pi-ai/providers/faux";
import { InProcessTransport, SessionStore } from "@openkai/core";
import { buildTuiApp } from "../dist/tui/app.js";
import { CommandPalette } from "../dist/tui/palette.js";
import { StatusLine, defaultStatusState } from "../dist/tui/status.js";
import { Transcript } from "../dist/tui/transcript.js";
import { OVERLAY_FOOTER, renderOverlayFooter, roleColour, rolePill, roleLabel } from "../dist/tui/theme.js";
import { AttentionNotifier, isFocusIn, isFocusOut } from "../dist/tui/attention.js";
import { PromptStash, FrecencyHistory, frecencyScore, rankFrecency } from "../dist/tui/stash.js";
/** Strip ANSI escape sequences for plain-text assertions. */ function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}
/** A capturing writer for the attention notifier (records raw output). */ var CaptureWriter = /*#__PURE__*/ function() {
    "use strict";
    function CaptureWriter() {
        _class_call_check(this, CaptureWriter);
        _define_property(this, "out", []);
    }
    _create_class(CaptureWriter, [
        {
            key: "write",
            value: function write(data) {
                this.out.push(data);
            }
        }
    ]);
    return CaptureWriter;
}();
/** A minimal headless TUI stub (same shape as tui.test.ts). */ function headlessTui() {
    var rows = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : 24;
    var noop = function noop() {};
    return {
        terminal: {
            rows: rows,
            columns: 80
        },
        mode: "fullscreen",
        children: [],
        addChild: noop,
        getShowHardwareCursor: function getShowHardwareCursor() {
            return false;
        },
        setFocus: noop,
        showOverlay: noop,
        hideOverlay: noop,
        hasOverlay: function hasOverlay() {
            return false;
        },
        start: noop,
        stop: noop,
        requestRender: noop,
        addInputListener: function addInputListener() {
            return function() {};
        },
        invalidate: noop,
        render: function render() {
            return [];
        }
    };
}
/** A faux-backed transport (no network) — only constructed, never consumed here. */ function fauxTransport(sessionId) {
    var faux = fauxProvider({});
    var models = createModels();
    models.setProvider(faux.provider);
    return new InProcessTransport({
        sessionId: sessionId,
        modelId: "faux-1",
        models: models,
        provider: "faux",
        cwd: process.cwd()
    });
}
/** Palette items for the frame/filter test (a representative subset). */ function samplePaletteItems() {
    return [
        {
            value: "help",
            label: "Help",
            description: "Show commands and keybindings",
            keys: "/help"
        },
        {
            value: "btw",
            label: "BTW",
            description: "Ask a side question (system block)",
            keys: "/btw"
        },
        {
            value: "undo",
            label: "Undo mutation",
            description: "Undo the last gated mutation",
            keys: "/undo"
        },
        {
            value: "toggle-thinking",
            label: "Toggle thinking",
            description: "Hide/reveal reasoning",
            keys: "Ctrl+O"
        }
    ];
}
// ── 1. Command palette frame + canonical footer (scope §1.3 + §3.2) ────────
test("palette: render carries the canonical overlay footer grammar", function() {
    var palette = new CommandPalette({
        items: samplePaletteItems(),
        onSelect: function onSelect() {
            return undefined;
        },
        onCancel: function onCancel() {
            return undefined;
        }
    });
    var frame = palette.render(80).map(stripAnsi).join("\n");
    assert.ok(frame.includes("↑/↓ Navigate · Enter Select · ESC Cancel"), "palette footer must carry the canonical grammar");
    assert.equal(renderOverlayFooter().replace(/\x1b\[[0-9;]*m/g, ""), OVERLAY_FOOTER);
    assert.ok(frame.includes("Help") || frame.includes("BTW"), "an item label must render");
});
test("palette: typing narrows the list (fuzzy filter)", function() {
    var palette = new CommandPalette({
        items: samplePaletteItems(),
        onSelect: function onSelect() {
            return undefined;
        },
        onCancel: function onCancel() {
            return undefined;
        }
    });
    assert.equal(palette.filteredItems().length, 4, "empty query shows all items");
    palette.handleInput("u");
    palette.handleInput("n");
    palette.handleInput("d");
    var matched = palette.filteredItems();
    assert.equal(matched.length, 1, "only the undo item matches 'und'");
    assert.equal(matched[0].value, "undo");
    palette.handleInput("\x7f"); // backspace widens again
    assert.ok(palette.filteredItems().length > 1, "backspace widens the filter");
});
// ── 2. Attention chrome state + focus-aware notifier (scope §1.1) ──────────
test("attention chrome: amber glyph renders when attention && !busy/awaiting", function() {
    var state = defaultStatusState("faux-1", "01ATTENT", "local");
    state.attention = true;
    var status = new StatusLine(state);
    var plain = status.render(80).map(stripAnsi).join("\n");
    assert.ok(plain.includes("attention"), "attention glyph must render when attention is set");
});
test("attention chrome: busy + awaiting take priority over attention", function() {
    var state = defaultStatusState("faux-1", "01ATTENT2", "local");
    state.attention = true;
    state.busy = true;
    var status = new StatusLine(state);
    var plain = status.render(80).map(stripAnsi).join("\n");
    assert.ok(plain.includes("busy"), "busy must show over attention");
    assert.ok(!plain.includes("attention"), "attention glyph is suppressed while busy");
    state.busy = false;
    state.awaitingApproval = true;
    status.update(state);
    var plain2 = status.render(80).map(stripAnsi).join("\n");
    assert.ok(plain2.includes("waiting"), "awaiting must show over attention");
    assert.ok(!plain2.includes("attention"), "attention glyph is suppressed while awaiting");
});
test("attention notifier: default focused=true (quiet at launch), bell+OSC only after focus-out", function() {
    var writer = new CaptureWriter();
    var notifier = new AttentionNotifier(writer);
    // Scope §1.1: default focused=true — DEC 1004 reports only on CHANGE, so a
    // terminal focused at launch never sends focus-in. Defaulting to focused
    // means the first turn_end does NOT ring the bell while the operator watches.
    assert.ok(notifier.isFocused, "notifier defaults to focused=true (quiet)");
    notifier.notify("Turn complete");
    assert.equal(writer.out.length, 0, "no notification at default focus (operator is watching)");
    notifier.setFocused(false);
    notifier.notify("Turn complete");
    var seqs = writer.out.join("");
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
test("focus events: isFocusIn / isFocusOut detect DEC 1004 payloads", function() {
    assert.ok(isFocusIn("\x1b[I"), "focus-in detected");
    assert.ok(isFocusOut("\x1b[O"), "focus-out detected");
    assert.ok(!isFocusIn("\x1b[O"), "focus-in not confused with focus-out");
});
// ── 3. Frecency ranking (pure, no TUI) — scope §1.4 ─────────────────────────
test("frecency score: count / (1 + ageHours)", function() {
    var now = 10 * 3600000; // 10h in ms
    var fresh = frecencyScore({
        text: "a",
        count: 5,
        lastUsed: now
    }, now);
    var old = frecencyScore({
        text: "b",
        count: 5,
        lastUsed: 0
    }, now);
    assert.ok(fresh > old, "a just-used prompt outscores an equally-frequent old one");
    assert.equal(frecencyScore({
        text: "c",
        count: 3,
        lastUsed: now
    }, now), 3, "age=0 ⇒ score = count");
});
test("frecency ranking: best first, ties break on lastUsed then text", function() {
    var now = 1000000;
    var entries = [
        {
            text: "rare-old",
            count: 1,
            lastUsed: now - 100 * 3600000
        },
        {
            text: "hot",
            count: 10,
            lastUsed: now - 1000
        },
        {
            text: "warm",
            count: 5,
            lastUsed: now - 2000
        }
    ];
    var ranked = rankFrecency(entries, now);
    assert.equal(ranked[0].text, "hot");
    assert.equal(ranked[1].text, "warm");
    assert.equal(ranked[2].text, "rare-old");
    assert.equal(entries[0].text, "rare-old", "input untouched (pure)");
});
test("frecency history: load → record → save → reload round-trip", function() {
    return _async_to_generator(function() {
        var dir, file, h1, h2, ranked, h3;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "ok-frecency-"))
                    ];
                case 1:
                    dir = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        6,
                        8
                    ]);
                    file = path.join(dir, "history.json");
                    h1 = new FrecencyHistory(file);
                    h1.record("hello", 1000);
                    h1.record("world", 2000);
                    h1.record("hello", 3000); // count 2
                    return [
                        4,
                        h1.save()
                    ];
                case 3:
                    _state.sent();
                    h2 = new FrecencyHistory(file);
                    return [
                        4,
                        h2.load()
                    ];
                case 4:
                    _state.sent();
                    ranked = h2.ranked(4000);
                    assert.equal(ranked.length, 2);
                    assert.equal(ranked[0].text, "hello");
                    assert.equal(ranked[0].count, 2);
                    h3 = new FrecencyHistory(path.join(dir, "nope.json"));
                    return [
                        4,
                        h3.load()
                    ];
                case 5:
                    _state.sent();
                    assert.equal(h3.ranked(0).length, 0, "missing file ⇒ empty, no throw");
                    return [
                        3,
                        8
                    ];
                case 6:
                    return [
                        4,
                        rm(dir, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 7:
                    _state.sent();
                    return [
                        7
                    ];
                case 8:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("frecency seeding: most-frecent entry is recalled first (history[0] = best)", function() {
    return _async_to_generator(function() {
        var dir, file, history, sessionId, faux, models, transport, store, app, editorHistory;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "ok-seed-"))
                    ];
                case 1:
                    dir = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        6,
                        8
                    ]);
                    file = path.join(dir, "history.json");
                    history = new FrecencyHistory(file);
                    // "best" has the highest frecency (count 10, used most recently).
                    history.record("worst", 1000); // count 1, very old
                    history.record("middle", 2000); // count 1, less old
                    history.record("best", 3000); // count 1, most recent
                    return [
                        4,
                        history.save()
                    ];
                case 3:
                    _state.sent();
                    sessionId = "01SEEDORDER00008";
                    faux = fauxProvider({});
                    models = createModels();
                    models.setProvider(faux.provider);
                    transport = new InProcessTransport({
                        sessionId: sessionId,
                        modelId: "faux-1",
                        models: models,
                        provider: "faux",
                        cwd: process.cwd()
                    });
                    store = new SessionStore({
                        root: dir,
                        sessionId: sessionId
                    });
                    return [
                        4,
                        store.ensure()
                    ];
                case 4:
                    _state.sent();
                    app = buildTuiApp(headlessTui(24), {
                        transport: transport,
                        modelId: "faux-1",
                        sessionId: sessionId,
                        persistMode: "local",
                        store: store,
                        sessionsRoot: dir,
                        history: history
                    });
                    return [
                        4,
                        app.controller.seedHistory()
                    ];
                case 5:
                    _state.sent();
                    // The editor's history is private at the TS level, but accessible at
                    // runtime. history[0] is what up-arrow recalls first.
                    editorHistory = app.composer.editor.history;
                    assert.equal(editorHistory[0], "best", "most-frecent entry must be at history[0] (recalled first on up-arrow)");
                    assert.equal(editorHistory[1], "middle", "second-frecent entry at history[1]");
                    assert.equal(editorHistory[2], "worst", "least-frecent entry at history[2] (recalled last)");
                    return [
                        3,
                        8
                    ];
                case 6:
                    return [
                        4,
                        rm(dir, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 7:
                    _state.sent();
                    return [
                        7
                    ];
                case 8:
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 4. Prompt stash (pure) — scope §1.4 ─────────────────────────────────────
test("stash: LIFO push/pop, empty drafts ignored", function() {
    var stash = new PromptStash();
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
test("btw: answer streams into a btw block, not a user/assistant turn", function() {
    var t = new Transcript("openkai");
    t.beginBtwTurn("what version is this?");
    t.applyEvent({
        kind: "connected"
    });
    t.applyEvent({
        kind: "delta",
        field: "text",
        delta: "It is v0.1.0."
    });
    t.applyEvent({
        kind: "turn_end"
    });
    var kinds = t.blockKinds();
    assert.ok(kinds.includes("btw"), "a btw block must exist");
    assert.ok(!kinds.includes("user"), "the side question must NOT render as a user turn");
    assert.ok(!kinds.includes("assistant"), "the side answer must NOT render as an assistant block");
    assert.equal(t.lastAssistantText(), "", "lastAssistantText is empty ⇒ persistTurn is a no-op");
    var frame = t.render(80).map(stripAnsi).join("\n");
    assert.ok(frame.includes("what version is this?"), "the btw question header renders");
    assert.ok(frame.includes("It is v0.1.0."), "the btw answer streams into the block");
});
test("btw (controller): does NOT re-persist the prior assistant turn at turn_end (scope §1.5)", function() {
    return _async_to_generator(function() {
        var sessionId, faux, models, transport, dir, store, app, entries, messages, assistantCount, kinds;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    // The rework defect: turn_end called persistTurn() unconditionally; with a
                    // prior assistant block in the transcript, lastAssistantText() returned
                    // that block's text, so every /btw appended a duplicate assistant message
                    // to the session JSONL. The fix: a btwTurn flag skips persistTurn for btw
                    // turns. This test proves the fix with a prior assistant block present.
                    sessionId = "01BTWPERSIST0007";
                    faux = fauxProvider({});
                    faux.setResponses([
                        fauxAssistantMessage([
                            fauxText("Side answer.")
                        ])
                    ]);
                    models = createModels();
                    models.setProvider(faux.provider);
                    transport = new InProcessTransport({
                        sessionId: sessionId,
                        modelId: "faux-1",
                        models: models,
                        provider: "faux",
                        cwd: process.cwd()
                    });
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "ok-btw-persist-"))
                    ];
                case 1:
                    dir = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        10,
                        12
                    ]);
                    store = new SessionStore({
                        root: dir,
                        sessionId: sessionId
                    });
                    return [
                        4,
                        store.ensure()
                    ];
                case 3:
                    _state.sent();
                    app = buildTuiApp(headlessTui(24), {
                        transport: transport,
                        modelId: "faux-1",
                        sessionId: sessionId,
                        persistMode: "local",
                        store: store,
                        sessionsRoot: dir
                    });
                    // Simulate a prior normal turn that was persisted: a user message + an
                    // assistant message in the store, and a matching assistant block in the
                    // transcript so lastAssistantText() returns non-empty.
                    return [
                        4,
                        store.appendMessage({
                            role: "user",
                            content: "first question",
                            timestamp: 1
                        })
                    ];
                case 4:
                    _state.sent();
                    return [
                        4,
                        store.appendMessage({
                            role: "assistant",
                            content: [
                                {
                                    type: "text",
                                    text: "Answer one."
                                }
                            ],
                            timestamp: 2
                        })
                    ];
                case 5:
                    _state.sent();
                    app.transcript.replayAssistant("Answer one.");
                    // Drive a /btw side-channel turn through the controller.
                    return [
                        4,
                        app.controller.btw("side question")
                    ];
                case 6:
                    _state.sent();
                    return [
                        4,
                        transport.close()
                    ];
                case 7:
                    _state.sent();
                    return [
                        4,
                        app.controller.consume()
                    ];
                case 8:
                    _state.sent();
                    return [
                        4,
                        store.readEntries()
                    ];
                case 9:
                    entries = _state.sent();
                    messages = entries.filter(function(e) {
                        return e.type === "message";
                    });
                    assistantCount = messages.filter(function(e) {
                        return e.message.role === "assistant";
                    }).length;
                    assert.equal(assistantCount, 1, "btw turn_end must NOT re-persist the prior assistant block");
                    // The btw block must exist in the transcript (the side answer streamed in).
                    kinds = app.transcript.blockKinds();
                    assert.ok(kinds.includes("btw"), "the btw block rendered");
                    assert.ok(!kinds.includes("user"), "the side question never rendered as a user turn");
                    return [
                        3,
                        12
                    ];
                case 10:
                    return [
                        4,
                        rm(dir, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 11:
                    _state.sent();
                    return [
                        7
                    ];
                case 12:
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 6. /undo surface — wired to onUndo (scope §1.6) ───────────────────────
function buildControllerWithUndo(onUndo) {
    return _async_to_generator(function() {
        var sessionId, transport, dir, store, app;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    sessionId = "01UNDOTEST000009";
                    transport = fauxTransport(sessionId);
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "ok-undo-"))
                    ];
                case 1:
                    dir = _state.sent();
                    store = new SessionStore({
                        root: dir,
                        sessionId: sessionId
                    });
                    return [
                        4,
                        store.ensure()
                    ];
                case 2:
                    _state.sent();
                    app = buildTuiApp(headlessTui(24), {
                        transport: transport,
                        modelId: "faux-1",
                        sessionId: sessionId,
                        persistMode: "local",
                        store: store,
                        sessionsRoot: dir,
                        onUndo: onUndo
                    });
                    return [
                        2,
                        {
                            app: app,
                            dir: dir
                        }
                    ];
            }
        });
    })();
}
test("undo: restores and renders the snapshot sha as a system notice", function() {
    return _async_to_generator(function() {
        var _ref, app, dir, frame;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        buildControllerWithUndo(function() {
                            return _async_to_generator(function() {
                                return _ts_generator(this, function(_state) {
                                    return [
                                        2,
                                        "abc123def4567890"
                                    ];
                                });
                            })();
                        })
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, dir = _ref.dir;
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        4,
                        6
                    ]);
                    return [
                        4,
                        app.controller.undo()
                    ];
                case 3:
                    _state.sent();
                    frame = app.transcript.render(80).map(stripAnsi).join("\n");
                    assert.ok(frame.includes("restored to snapshot abc123def4"), "the restored sha (truncated) renders");
                    return [
                        3,
                        6
                    ];
                case 4:
                    return [
                        4,
                        rm(dir, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 5:
                    _state.sent();
                    return [
                        7
                    ];
                case 6:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("undo: reports unavailable when the gate is not wired", function() {
    return _async_to_generator(function() {
        var _ref, app, dir, frame;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        buildControllerWithUndo(undefined)
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, dir = _ref.dir;
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        4,
                        6
                    ]);
                    return [
                        4,
                        app.controller.undo()
                    ];
                case 3:
                    _state.sent();
                    frame = app.transcript.render(80).map(stripAnsi).join("\n");
                    assert.ok(frame.includes("unavailable"), "/undo reports unavailable without onUndo");
                    return [
                        3,
                        6
                    ];
                case 4:
                    return [
                        4,
                        rm(dir, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 5:
                    _state.sent();
                    return [
                        7
                    ];
                case 6:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("undo: surfaces errors from onUndo (e.g. nothing to undo)", function() {
    return _async_to_generator(function() {
        var _ref, app, dir, frame;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        buildControllerWithUndo(function() {
                            return _async_to_generator(function() {
                                return _ts_generator(this, function(_state) {
                                    throw new Error("nothing to undo");
                                });
                            })();
                        })
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, dir = _ref.dir;
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        4,
                        6
                    ]);
                    return [
                        4,
                        app.controller.undo()
                    ];
                case 3:
                    _state.sent();
                    frame = app.transcript.render(80).map(stripAnsi).join("\n");
                    assert.ok(frame.includes("nothing to undo"), "the onUndo error message renders");
                    return [
                        3,
                        6
                    ];
                case 4:
                    return [
                        4,
                        rm(dir, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 5:
                    _state.sent();
                    return [
                        7
                    ];
                case 6:
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 7. Per-agent identity (scope §1.2) — stable colour + pill ──────────────
test("identity: roleColour is stable + distinct across roles", function() {
    var a = roleColour("architect");
    var b = roleColour("builder");
    assert.equal(roleColour("architect"), a, "same role ⇒ same colour (stable)");
    assert.notEqual(a, b, "different roles differ in colour");
});
test("identity: pill is a bracketed uppercased label; long roles truncate", function() {
    var pill = stripAnsi(rolePill("openkai"));
    assert.ok(/^\[.*\]$/.test(pill), "pill is bracketed");
    assert.ok(pill.includes("OPENKAI"), "pill label is uppercased");
    assert.ok(roleLabel("a-very-long-role-name").length <= 10, "label truncates to ≤10");
});
