//# hash=6fdc9033d35b2ba2b37cb4b097732a9b
//# sourceMappingURL=tui.test.js.map

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
 */ import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { createModels, uuidv7 } from "@earendil-works/pi-ai";
import { fauxProvider, fauxAssistantMessage, fauxText, fauxToolCall } from "@earendil-works/pi-ai/providers/faux";
import { Type } from "typebox";
import { InProcessTransport, SessionStore, CortexClient, CortexCheckpoint, listSessions, readSessionMessages } from "@openkai/core";
import { buildTuiApp } from "../dist/tui/app.js";
import { resolveRunMode } from "../dist/tui/runtime.js";
import { OVERLAY_FOOTER, renderOverlayFooter } from "../dist/tui/theme.js";
// ── Test fixtures ────────────────────────────────────────────────────────────
/** A trivial `echo` tool that returns its `msg` argument — no filesystem. */ var EchoParams = Type.Object({
    msg: Type.String()
});
var echoTool = {
    name: "echo",
    label: "Echo",
    description: "Echo the msg argument back as a tool result.",
    parameters: EchoParams,
    execute: function execute(_id, params) {
        return _async_to_generator(function() {
            var content;
            return _ts_generator(this, function(_state) {
                content = [
                    {
                        type: "text",
                        text: params.msg
                    }
                ];
                return [
                    2,
                    {
                        content: content,
                        details: {
                            msg: params.msg
                        }
                    }
                ];
            });
        })();
    }
};
/** A minimal headless TUI stub: only the fields the layout/render path touches. */ function headlessTui() {
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
/** Build a faux-backed transport + TUI app wired for an offline scripted turn. */ function buildFauxApp(opts) {
    return _async_to_generator(function() {
        var _opts_persistMode, faux, models, transport, sessionsRoot, store, app;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    faux = fauxProvider({});
                    faux.setResponses([
                        fauxAssistantMessage([
                            fauxText(opts.scriptedText),
                            fauxToolCall("echo", {
                                msg: "pong"
                            })
                        ]),
                        fauxAssistantMessage([
                            fauxText("Done.")
                        ])
                    ]);
                    models = createModels();
                    models.setProvider(faux.provider);
                    transport = new InProcessTransport({
                        sessionId: opts.sessionId,
                        modelId: "faux-1",
                        models: models,
                        provider: "faux",
                        tools: [
                            echoTool
                        ],
                        cwd: process.cwd()
                    });
                    // Tests persist to a tmp root — never the repo's own .openkai/sessions.
                    sessionsRoot = "/tmp/ok-tui-".concat(opts.sessionId);
                    store = new SessionStore({
                        root: sessionsRoot,
                        sessionId: opts.sessionId
                    });
                    return [
                        4,
                        store.ensure()
                    ];
                case 1:
                    _state.sent();
                    app = buildTuiApp(headlessTui(24), {
                        transport: transport,
                        modelId: "faux-1",
                        sessionId: opts.sessionId,
                        persistMode: (_opts_persistMode = opts.persistMode) !== null && _opts_persistMode !== void 0 ? _opts_persistMode : "local",
                        store: store,
                        sessionsRoot: sessionsRoot,
                        onExit: opts.onExit
                    });
                    return [
                        2,
                        {
                            app: app,
                            transport: transport,
                            store: store,
                            sessionsRoot: sessionsRoot
                        }
                    ];
            }
        });
    })();
}
/** Render the layout root to a frame (joined lines), stripping ANSI for assertions. */ function renderFrame(app) {
    var width = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : 80;
    return app.root.render(width).map(function(line) {
        return stripAnsi(line);
    }).join("\n");
}
/** Strip ANSI escape sequences for plain-text assertions. */ function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}
// ── 1. Golden-frame: streamed text + tool card + chrome ─────────────────────
test("golden-frame: faux turn renders streamed text, a tool card, and chrome updates", function() {
    return _async_to_generator(function() {
        var _ref, app, transport, frame;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        buildFauxApp({
                            scriptedText: "Hello, OpenKai!",
                            sessionId: "01TESTGOLDEN000001"
                        })
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, transport = _ref.transport;
                    // One submit = one turn. The tool call continues *inside* that turn, so both
                    // scripted faux responses are consumed by this single prompt — a second
                    // `transport.prompt` here would silently fire an extra turn.
                    return [
                        4,
                        app.controller.submit("ping")
                    ];
                case 2:
                    _state.sent();
                    return [
                        4,
                        transport.close()
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        app.controller.consume()
                    ];
                case 4:
                    _state.sent();
                    frame = renderFrame(app, 80);
                    // Streamed assistant text present (golden cell).
                    assert.ok(frame.includes("Hello, OpenKai!"), "assistant streamed text must appear in the frame");
                    // Tool card present — the muted-left-border `tool` label + the echo name.
                    assert.ok(/tool\s+echo/.test(frame), "a tool card with the echo tool must render");
                    // Tool result settled — `ok` status appears after the tool executes.
                    assert.ok(/ok/.test(frame), "tool result `ok` status must appear after settlement");
                    // Chrome line present with model + session + persist-mode (always visible, scope §3.4).
                    assert.ok(frame.includes("faux-1"), "chrome must show the model id");
                    assert.ok(frame.includes("01TESTGO"), "chrome must show the session id prefix");
                    assert.ok(frame.includes("p:local"), "chrome must show the persist-mode chip (p:<mode>)");
                    // Continuation turn text ("Done.") appears too (second faux response).
                    assert.ok(frame.includes("Done."), "continuation assistant text must render");
                    // Emit the acceptance-evidence snapshot from THIS run, so the committed
                    // artifact can never drift from what the code actually renders.
                    return [
                        4,
                        writeFile(// Compiled to dist-test/, so `..` lands on packages/cli/.
                        new URL("../test/evidence/golden-frame.txt", import.meta.url), [
                            "# P4 TUI golden-frame evidence (faux provider, headless render, 80 cols)",
                            "# Regenerated by `npm test -w @openkai/cli` — do not hand-edit.",
                            "# Block kinds: ".concat(app.transcript.blockKinds().join(" -> ")),
                            "# Chrome usage: ".concat(JSON.stringify(app.status.currentState.usage)),
                            "",
                            frame,
                            ""
                        ].join("\n"))
                    ];
                case 5:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 2. Event-mapping: block ordering follows the transport taxonomy ──────────
test("event-mapping: transcript block kinds follow connected→text→tool→settle→turn_end", function() {
    return _async_to_generator(function() {
        var _ref, app, transport, kinds, firstAssistant, firstTool;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        buildFauxApp({
                            scriptedText: "Streaming reply.",
                            sessionId: "01TESTEVENT0000002"
                        })
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, transport = _ref.transport;
                    return [
                        4,
                        app.controller.submit("go")
                    ];
                case 2:
                    _state.sent();
                    return [
                        4,
                        transport.close()
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        app.controller.consume()
                    ];
                case 4:
                    _state.sent();
                    kinds = app.transcript.blockKinds();
                    // user prompt → thinking + assistant (connected) → ... → tool → assistant(continuation)
                    assert.ok(kinds.includes("user"), "user block present");
                    assert.ok(kinds.includes("assistant"), "assistant block present");
                    assert.ok(kinds.includes("tool"), "tool block present");
                    assert.ok(kinds.includes("thinking"), "thinking block present (collapsed by default)");
                    // The tool card must appear AFTER the first assistant block (streamed text first).
                    firstAssistant = kinds.indexOf("assistant");
                    firstTool = kinds.indexOf("tool");
                    assert.ok(firstTool > firstAssistant, "tool card must follow the assistant block that emitted it");
                    // Chrome usage updated: after the turn, status.usage is non-null.
                    assert.ok(app.status.currentState.usage !== null, "usage must update the chrome at turn settlement");
                    return [
                        4,
                        transport.close()
                    ];
                case 5:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 3. Thinking density: hidden by default, revealed by toggle (Ctrl+O) ────
test("thinking density: collapsed by default, toggle reveals", function() {
    return _async_to_generator(function() {
        var _ref, app, transport, before, revealed, revealedFrame, hidden;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        buildFauxApp({
                            scriptedText: "thinking test",
                            sessionId: "01TESTTHINK000003"
                        })
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, transport = _ref.transport;
                    return [
                        4,
                        app.controller.submit("q")
                    ];
                case 2:
                    _state.sent();
                    return [
                        4,
                        transport.close()
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        app.controller.consume()
                    ];
                case 4:
                    _state.sent();
                    before = app.transcript.blockKinds();
                    assert.ok(before.includes("thinking"), "thinking block exists");
                    // The frame must NOT contain a revealed "thinking" header while collapsed
                    // (only the dim `⤷ thinking…` preview is shown — which still contains the word).
                    // Toggle reveals full reasoning.
                    revealed = app.controller.toggleThinking();
                    assert.equal(revealed, true, "toggle returns the new (revealed) state");
                    revealedFrame = renderFrame(app, 80);
                    // After reveal, the thinking block renders its buffered text — assert a
                    // thinking marker line is present (the word "thinking" appears).
                    assert.ok(revealedFrame.toLowerCase().includes("thinking"), "revealed thinking section renders");
                    // Toggle back to hidden.
                    hidden = app.controller.toggleThinking();
                    assert.equal(hidden, false, "toggle back to hidden");
                    return [
                        4,
                        transport.close()
                    ];
                case 5:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 3b. Composer wiring: the path a human actually takes ────────────────────
/**
 * Regression: the composer must submit *through the controller*, not straight
 * to `transport.prompt`. Wiring it to the transport streams a reply for a
 * prompt that never appears in the transcript and is never written to the
 * session JSONL — so a resumed session replays assistant turns with no user
 * turns. Driving this through `editor.onSubmit` is the point: it is exactly
 * what pressing Enter fires, so the test cannot pass while the seam is wrong.
 */ test("composer wiring: Enter renders AND persists the user message", function() {
    return _async_to_generator(function() {
        var _ref, app, transport, store, consumeP, frame, conversationBlocks, roles;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        buildFauxApp({
                            scriptedText: "Reply.",
                            sessionId: "01TESTCOMPOSER0004"
                        })
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, transport = _ref.transport, store = _ref.store;
                    consumeP = app.controller.consume();
                    app.composer.editor.onSubmit("typed by a human");
                    return [
                        4,
                        new Promise(function(resolve) {
                            return setTimeout(resolve, 400);
                        })
                    ];
                case 2:
                    _state.sent();
                    return [
                        4,
                        transport.close()
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        consumeP
                    ];
                case 4:
                    _state.sent();
                    frame = renderFrame(app, 80);
                    assert.ok(frame.includes("typed by a human"), "the submitted prompt must render in the transcript");
                    // The first CONVERSATION block is the user turn; brand/splash notices are
                    // app chrome and may precede it.
                    conversationBlocks = app.transcript.blockKinds().filter(function(k) {
                        return k !== "notice";
                    });
                    assert.equal(conversationBlocks[0], "user", "the turn must open with a user block");
                    return [
                        4,
                        readSessionMessages(store.filePath)
                    ];
                case 5:
                    roles = _state.sent().map(function(m) {
                        return m.role;
                    });
                    assert.ok(roles.includes("user"), "the user message must be persisted (got ".concat(JSON.stringify(roles), ")"));
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 3c. Slash commands: dispatched locally, never sent to the model ─────────
test("slash commands: /help renders a notice and does not prompt the model", function() {
    return _async_to_generator(function() {
        var _ref, app, transport, kinds;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        buildFauxApp({
                            scriptedText: "unused",
                            sessionId: "01TESTSLASH000005"
                        })
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, transport = _ref.transport;
                    app.composer.editor.onSubmit("/help");
                    return [
                        4,
                        new Promise(function(resolve) {
                            return setTimeout(resolve, 50);
                        })
                    ];
                case 2:
                    _state.sent();
                    kinds = app.transcript.blockKinds();
                    assert.ok(kinds.includes("notice"), "/help must render a notice block");
                    assert.ok(!kinds.includes("user"), "/help must not be submitted to the model as a user turn");
                    assert.ok(renderFrame(app, 80).includes("/model"), "the help notice lists the command set");
                    return [
                        4,
                        transport.close()
                    ];
                case 3:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
test("slash commands: /quit and /resume signal the runtime; unknown reports", function() {
    return _async_to_generator(function() {
        var seen, _ref, app, transport;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    seen = [];
                    return [
                        4,
                        buildFauxApp({
                            scriptedText: "unused",
                            sessionId: "01TESTSLASH000006",
                            onExit: function onExit(request) {
                                return seen.push(request);
                            }
                        })
                    ];
                case 1:
                    _ref = _state.sent(), app = _ref.app, transport = _ref.transport;
                    return [
                        4,
                        app.controller.dispatchCommand("quit", "")
                    ];
                case 2:
                    _state.sent();
                    assert.deepEqual(seen[0], {
                        kind: "quit"
                    }, "/quit asks the runtime to exit");
                    return [
                        4,
                        app.controller.dispatchCommand("resume", "01ABC")
                    ];
                case 3:
                    _state.sent();
                    assert.deepEqual(seen[1], {
                        kind: "restart",
                        sessionId: "01ABC"
                    }, "/resume asks for a session switch");
                    return [
                        4,
                        app.controller.dispatchCommand("new", "")
                    ];
                case 4:
                    _state.sent();
                    assert.deepEqual(seen[2], {
                        kind: "restart"
                    }, "/new asks for a fresh session");
                    return [
                        4,
                        app.controller.dispatchCommand("bogus", "")
                    ];
                case 5:
                    _state.sent();
                    assert.ok(renderFrame(app, 80).includes("unknown command"), "an unknown command reports rather than silently prompting the model");
                    return [
                        4,
                        transport.close()
                    ];
                case 6:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 4. Theme/tokens: the footer grammar is the single interaction string ────
test("theme: overlay footer is the canonical interaction grammar", function() {
    assert.equal(OVERLAY_FOOTER, "↑/↓ Navigate · Enter Select · ESC Cancel");
    assert.ok(renderOverlayFooter().length > 0, "footer renders non-empty");
});
// ── 5. Mode matrix (A1) ──────────────────────────────────────────────────────
test("mode matrix: CORTEX_PROJECT unset ⇒ local, zero Cortex calls, no crash", function() {
    return _async_to_generator(function() {
        var saved, mode;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    saved = process.env.CORTEX_PROJECT;
                    delete process.env.CORTEX_PROJECT;
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        ,
                        3,
                        4
                    ]);
                    return [
                        4,
                        resolveRunMode({})
                    ];
                case 2:
                    mode = _state.sent();
                    assert.equal(mode.mode, "local", "unset CORTEX_PROJECT ⇒ local mode");
                    assert.equal(mode.persistMode, "local", "chrome persist label is 'local'");
                    assert.equal(mode.cortexReachable, false, "Cortex reported unreachable (not probed)");
                    assert.equal(mode.cortex, undefined, "no CortexClient constructed in local mode ⇒ zero calls");
                    return [
                        3,
                        4
                    ];
                case 3:
                    if (saved !== undefined) process.env.CORTEX_PROJECT = saved;
                    return [
                        7
                    ];
                case 4:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("mode matrix: CORTEX_PROJECT set but unreachable ⇒ local (no crash)", function() {
    return _async_to_generator(function() {
        var saved, mode;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    saved = process.env.CORTEX_PROJECT;
                    process.env.CORTEX_PROJECT = "openkai";
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        ,
                        3,
                        4
                    ]);
                    return [
                        4,
                        resolveRunMode({
                            api: "http://127.0.0.1:9"
                        })
                    ];
                case 2:
                    mode = _state.sent();
                    assert.equal(mode.mode, "local", "unreachable Cortex ⇒ local fallback");
                    assert.equal(mode.cortexReachable, false, "health probe failed ⇒ unreachable");
                    assert.equal(mode.persistMode, "local", "falls back to local persist label");
                    return [
                        3,
                        4
                    ];
                case 3:
                    if (saved === undefined) delete process.env.CORTEX_PROJECT;
                    else process.env.CORTEX_PROJECT = saved;
                    return [
                        7
                    ];
                case 4:
                    return [
                        2
                    ];
            }
        });
    })();
});
test("mode matrix: managed mode ingests the session id into /sessions/ingested-ids", function() {
    return _async_to_generator(function() {
        var healthOk, probe, unused, sessionId, tmpRoot, store, cortex, checkpoint, entries, result, ingested;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    // Requires a live cortex-api:8501 (the local infra). Skipped if unreachable.
                    healthOk = false;
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        3,
                        ,
                        4
                    ]);
                    probe = new CortexClient({
                        project: "openkai"
                    });
                    return [
                        4,
                        probe.health()
                    ];
                case 2:
                    _state.sent();
                    healthOk = true;
                    return [
                        3,
                        4
                    ];
                case 3:
                    unused = _state.sent();
                    healthOk = false;
                    return [
                        3,
                        4
                    ];
                case 4:
                    if (!healthOk) {
                        console.log("  [skip] cortex-api not reachable — managed-mode ingestion test skipped");
                        return [
                            2
                        ];
                    }
                    sessionId = uuidv7();
                    tmpRoot = "/tmp/ok-tui-matrix-".concat(sessionId);
                    store = new SessionStore({
                        root: tmpRoot,
                        sessionId: sessionId
                    });
                    return [
                        4,
                        store.ensure()
                    ];
                case 5:
                    _state.sent();
                    cortex = new CortexClient({
                        project: "openkai"
                    });
                    // Append a user + assistant message locally, then checkpoint to Cortex.
                    return [
                        4,
                        store.appendMessage({
                            role: "user",
                            content: "matrix probe",
                            timestamp: Date.now()
                        })
                    ];
                case 6:
                    _state.sent();
                    return [
                        4,
                        store.appendMessage({
                            role: "assistant",
                            content: [
                                {
                                    type: "text",
                                    text: "matrix reply"
                                }
                            ],
                            timestamp: Date.now()
                        })
                    ];
                case 7:
                    _state.sent();
                    checkpoint = new CortexCheckpoint({
                        client: cortex,
                        agent: "openkai",
                        sessionId: sessionId,
                        sourcePath: store.filePath,
                        provider: "faux",
                        modelId: "faux-1",
                        cwd: process.cwd(),
                        task: "matrix probe"
                    });
                    return [
                        4,
                        store.readEntries()
                    ];
                case 8:
                    entries = _state.sent();
                    checkpoint.record(entries);
                    return [
                        4,
                        checkpoint.flushNow()
                    ];
                case 9:
                    result = _state.sent();
                    assert.ok(result, "checkpoint flush returned an ingest result");
                    return [
                        4,
                        cortex.getIngestedIds()
                    ];
                case 10:
                    ingested = _state.sent();
                    assert.ok(ingested.ids.includes(sessionId), "session ".concat(sessionId, " must appear in /sessions/ingested-ids in managed mode"));
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── 6. Session store helpers ───────────────────────────────────────────────
test("persist: listSessions + readSessionMessages round-trip", function() {
    return _async_to_generator(function() {
        var tmpRoot, id, store, listed, msgs;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    tmpRoot = "/tmp/ok-tui-list-".concat(Math.random().toString(36).slice(2));
                    id = "01TESTLIST" + Math.random().toString(36).slice(2, 6);
                    store = new SessionStore({
                        root: tmpRoot,
                        sessionId: id
                    });
                    return [
                        4,
                        store.ensure()
                    ];
                case 1:
                    _state.sent();
                    return [
                        4,
                        store.appendMessage({
                            role: "user",
                            content: "hello list",
                            timestamp: Date.now()
                        })
                    ];
                case 2:
                    _state.sent();
                    return [
                        4,
                        listSessions(tmpRoot)
                    ];
                case 3:
                    listed = _state.sent();
                    assert.ok(listed.includes(id), "listSessions returns the created session id");
                    return [
                        4,
                        readSessionMessages(store.filePath)
                    ];
                case 4:
                    msgs = _state.sent();
                    assert.equal(msgs.length, 1, "readSessionMessages returns the appended message");
                    return [
                        2
                    ];
            }
        });
    })();
});
