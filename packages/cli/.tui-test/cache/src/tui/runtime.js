//# hash=c1246492fa712e9fa14a6ca262fc67eb
//# sourceMappingURL=runtime.js.map

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
function _instanceof(left, right) {
    "@swc/helpers - instanceof";
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else return left instanceof right;
}
function _object_spread(target) {
    for(var i = 1; i < arguments.length; i++){
        var source = arguments[i] != null ? arguments[i] : {};
        var ownKeys = Object.keys(source);
        if (typeof Object.getOwnPropertySymbols === "function") {
            ownKeys = ownKeys.concat(Object.getOwnPropertySymbols(source).filter(function(sym) {
                return Object.getOwnPropertyDescriptor(source, sym).enumerable;
            }));
        }
        ownKeys.forEach(function(key) {
            _define_property(target, key, source[key]);
        });
    }
    return target;
}
function ownKeys(object, enumerableOnly) {
    var keys = Object.keys(object);
    if (Object.getOwnPropertySymbols) {
        var symbols = Object.getOwnPropertySymbols(object);
        if (enumerableOnly) {
            symbols = symbols.filter(function(sym) {
                return Object.getOwnPropertyDescriptor(object, sym).enumerable;
            });
        }
        keys.push.apply(keys, symbols);
    }
    return keys;
}
function _object_spread_props(target, source) {
    source = source != null ? source : {};
    if (Object.getOwnPropertyDescriptors) Object.defineProperties(target, Object.getOwnPropertyDescriptors(source));
    else {
        ownKeys(Object(source)).forEach(function(key) {
            Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
        });
    }
    return target;
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
 * TUI runtime — the real terminal entry point (scope §4 + A1).
 *
 * {@link runTui} builds a `ProcessTerminal` + `TuiAltScreen`, installs the
 * keymap, sets the layout root, focuses the composer, wires the input listener
 * for the leader keys (Ctrl+K palette, Ctrl+S stash, scope §1.3/§1.4),
 * focus-aware attention (scope §1.1), Ctrl+O density, double-Esc clear,
 * Ctrl+C quit-with-confirm, runs the event loop, and tears down cleanly.
 * {@link resolveRunMode} decides `local` vs `managed` from `CORTEX_PROJECT` +
 * a Cortex health probe (A1: unreachable ⇒ local, no crash).
 *
 * P4b wiring (scope §1):
 *  - DEC 1004 focus reporting → {@link AttentionNotifier} (quiet when focused).
 *  - Frecency history persisted under `.openkai/history.json` (scope §1.4),
 *    seeded into the composer at startup so up-arrow recalls by frecency.
 *  - `/undo` wired to `transport.undoLastMutation()` via the `onUndo` callback.
 */ import path from "node:path";
import { ProcessTerminal, TuiAltScreen } from "@earendil-works/pi-tui";
import { CortexClient, CortexCheckpoint, DEFAULT_CORTEX_API_URL, InProcessTransport, MissingApiKeyError, SessionStore, readSessionMessages } from "@openkai/core";
import { buildTuiApp } from "./app.js";
import { installKeymap, isToggleThinking, isQuit, isOpenPalette, isStash, DoubleEscDetector } from "./keymap.js";
import { AttentionNotifier, FOCUS_REPORT_ENABLE, FOCUS_REPORT_DISABLE, isFocusIn, isFocusOut } from "./attention.js";
import { FrecencyHistory } from "./stash.js";
import { providerKeyStatus, resolveProvider } from "../providers.js";
/**
 * Resolve the run mode (A1). `CORTEX_PROJECT` unset or Cortex unreachable ⇒
 * `local` (no checkpoints, chrome shows `local`, no crash). Set + reachable ⇒
 * `managed` (checkpoints on, chrome shows the project key).
 */ export function resolveRunMode(options) {
    return _async_to_generator(function() {
        var _ref, _options_project, _ref1, _options_api, project, baseUrl, cortexProject, cortex, unused;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    project = (_ref = (_options_project = options.project) !== null && _options_project !== void 0 ? _options_project : process.env.CORTEX_PROJECT) !== null && _ref !== void 0 ? _ref : "openkai";
                    baseUrl = (_ref1 = (_options_api = options.api) !== null && _options_api !== void 0 ? _options_api : process.env.CORTEX_API_URL) !== null && _ref1 !== void 0 ? _ref1 : DEFAULT_CORTEX_API_URL;
                    cortexProject = process.env.CORTEX_PROJECT;
                    if (!cortexProject) {
                        return [
                            2,
                            {
                                mode: "local",
                                project: project,
                                persistMode: "local",
                                cortexReachable: false
                            }
                        ];
                    }
                    cortex = new CortexClient({
                        baseUrl: baseUrl,
                        project: project,
                        agent: options.agent
                    });
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        3,
                        ,
                        4
                    ]);
                    return [
                        4,
                        cortex.health()
                    ];
                case 2:
                    _state.sent();
                    return [
                        2,
                        {
                            mode: "managed",
                            project: project,
                            persistMode: project,
                            cortex: cortex,
                            cortexReachable: true
                        }
                    ];
                case 3:
                    unused = _state.sent();
                    return [
                        2,
                        {
                            mode: "local",
                            project: project,
                            persistMode: "local",
                            cortexReachable: false
                        }
                    ];
                case 4:
                    return [
                        2
                    ];
            }
        });
    })();
}
/**
 * Run the TUI against the real terminal. Loops over {@link runSession} so
 * `/new` and `/resume <id>` rebuild against a different session id.
 */ export function runTui(options) {
    return _async_to_generator(function() {
        var session, _ref, code, next;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    session = options.session;
                    _state.label = 1;
                case 1:
                    return [
                        4,
                        runSession(_object_spread_props(_object_spread({}, options), {
                            session: session
                        }))
                    ];
                case 2:
                    _ref = _state.sent(), code = _ref.code, next = _ref.next;
                    if (next.kind === "quit") return [
                        2,
                        code
                    ];
                    session = next.sessionId;
                    _state.label = 3;
                case 3:
                    return [
                        3,
                        1
                    ];
                case 4:
                    return [
                        2
                    ];
            }
        });
    })();
}
/** Run one session to its exit request. */ function runSession(options) {
    return _async_to_generator(function() {
        var _ref, _options_model, _ref1, _options_agent, _options_sessionsRoot, provider, modelId, keyStatus, _keyStatus_needsKey, agent, cwd, sessionsRoot, runMode, store, replayMessages, error, replay, checkpoint, transport, terminal, tui, manager, notifier, history, signalExit, exitRequested, exitSignalled, requestExit, app, root, composer, controller, escDetector, lastQuitConfirmAt, consumePromise, next;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    provider = resolveProvider(options.provider);
                    modelId = (_ref = (_options_model = options.model) !== null && _options_model !== void 0 ? _options_model : process.env.OPENKAI_MODEL) !== null && _ref !== void 0 ? _ref : provider === "openrouter" ? "nvidia/nemotron-3-nano-30b-a3b:free" : undefined;
                    if (!modelId) {
                        process.stderr.write('ERROR: no default model for provider "'.concat(provider, '" — pass --model <id> (or set OPENKAI_MODEL).\n'));
                        return [
                            2,
                            {
                                code: 2,
                                next: {
                                    kind: "quit"
                                }
                            }
                        ];
                    }
                    keyStatus = providerKeyStatus(provider);
                    if (!keyStatus.configured) {
                        ;
                        process.stderr.write("".concat(provider, " credentials not found: set ").concat((_keyStatus_needsKey = keyStatus.needsKey) !== null && _keyStatus_needsKey !== void 0 ? _keyStatus_needsKey : "the provider credentials", " or export them in your environment.\n"));
                        return [
                            2,
                            {
                                code: 1,
                                next: {
                                    kind: "quit"
                                }
                            }
                        ];
                    }
                    agent = (_ref1 = (_options_agent = options.agent) !== null && _options_agent !== void 0 ? _options_agent : process.env.OPENKAI_AGENT) !== null && _ref1 !== void 0 ? _ref1 : "openkai";
                    cwd = process.cwd();
                    sessionsRoot = (_options_sessionsRoot = options.sessionsRoot) !== null && _options_sessionsRoot !== void 0 ? _options_sessionsRoot : path.join(cwd, ".openkai", "sessions");
                    return [
                        4,
                        resolveRunMode(options)
                    ];
                case 1:
                    runMode = _state.sent();
                    store = new SessionStore({
                        root: sessionsRoot,
                        sessionId: options.session
                    });
                    return [
                        4,
                        store.ensure()
                    ];
                case 2:
                    _state.sent();
                    replayMessages = [];
                    if (!options.session) return [
                        3,
                        6
                    ];
                    _state.label = 3;
                case 3:
                    _state.trys.push([
                        3,
                        5,
                        ,
                        6
                    ]);
                    return [
                        4,
                        readSessionMessages(store.filePath)
                    ];
                case 4:
                    replayMessages = _state.sent();
                    return [
                        3,
                        6
                    ];
                case 5:
                    error = _state.sent();
                    if (!options.quiet) process.stderr.write("[openkai] resume failed: ".concat(_instanceof(error, Error) ? error.message : String(error), "\n"));
                    return [
                        2,
                        {
                            code: 1,
                            next: {
                                kind: "quit"
                            }
                        }
                    ];
                case 6:
                    // An empty replay list is not a replay — fresh sessions get the brand mark.
                    replay = replayMessages.length > 0 ? replayMessages : undefined;
                    if (runMode.mode === "managed" && runMode.cortex) {
                        checkpoint = new CortexCheckpoint({
                            client: runMode.cortex,
                            agent: agent,
                            sessionId: store.sessionId,
                            sourcePath: path.resolve(store.filePath),
                            provider: provider,
                            modelId: modelId,
                            cwd: cwd,
                            task: "openkai tui"
                        });
                    }
                    try {
                        transport = new InProcessTransport({
                            sessionId: store.sessionId,
                            modelId: modelId,
                            provider: provider,
                            systemPrompt: options.systemPrompt,
                            cwd: cwd,
                            initialMessages: replayMessages,
                            // Enable the permission gate so the TUI exposes write_file / edit_file /
                            // bash behind an approval overlay (scope §4), and so `/undo` (§1.6) has a
                            // shadow repo to restore. `openkai chat` leaves this unset (no approval
                            // channel in print mode).
                            enablePermissions: true
                        });
                    } catch (error) {
                        if (_instanceof(error, MissingApiKeyError)) {
                            process.stderr.write("".concat(error.message, "\n"));
                            return [
                                2,
                                {
                                    code: 1,
                                    next: {
                                        kind: "quit"
                                    }
                                }
                            ];
                        }
                        throw error;
                    }
                    terminal = new ProcessTerminal();
                    tui = new TuiAltScreen(terminal, true);
                    manager = installKeymap();
                    // P4b: focus-aware attention notifier (scope §1.1). DEC 1004 focus reporting
                    // is enabled below so the notifier knows focus state.
                    notifier = new AttentionNotifier(terminal);
                    // P4b: frecency history persisted under .openkai/history.json (scope §1.4).
                    history = new FrecencyHistory(path.join(cwd, ".openkai", "history.json"));
                    return [
                        4,
                        history.load()
                    ];
                case 7:
                    _state.sent();
                    exitRequested = new Promise(function(resolve) {
                        signalExit = resolve;
                    });
                    exitSignalled = false;
                    requestExit = function requestExit(request) {
                        if (exitSignalled) return;
                        exitSignalled = true;
                        signalExit(request);
                    };
                    app = buildTuiApp(tui, {
                        transport: transport,
                        modelId: modelId,
                        sessionId: store.sessionId,
                        persistMode: runMode.persistMode,
                        store: store,
                        checkpoint: checkpoint,
                        replayMessages: replay,
                        sessionsRoot: sessionsRoot,
                        agentName: agent,
                        notifier: notifier,
                        history: history,
                        // `/undo` (scope §1.6): trust boundary is InProcessTransport (§2);
                        // undoLastMutation() throws cleanly when the gate is off / nothing to undo.
                        onUndo: function onUndo() {
                            return transport.undoLastMutation();
                        },
                        onExit: requestExit
                    });
                    root = app.root, composer = app.composer, controller = app.controller;
                    // Seed the composer's up-arrow recall with frecency-ranked prompts (§1.4).
                    return [
                        4,
                        controller.seedHistory()
                    ];
                case 8:
                    _state.sent();
                    tui.setLayoutRoot(root);
                    tui.setFocus(composer.editor);
                    // ── Input listener: focus, palette, stash, density, clear, quit-confirm ──
                    escDetector = new DoubleEscDetector();
                    lastQuitConfirmAt = 0;
                    tui.addInputListener(function(data) {
                        // DEC 1004 focus reporting (scope §1.1) — handle first so the OSC sequences
                        // never reach the editor.
                        if (isFocusIn(data)) {
                            notifier.setFocused(true);
                            controller.setFocused(true);
                            return {
                                consume: true
                            };
                        }
                        if (isFocusOut(data)) {
                            notifier.setFocused(false);
                            controller.setFocused(false);
                            return {
                                consume: true
                            };
                        }
                        // When an overlay (palette / permission) is open, it owns the input.
                        if (tui.hasOverlay()) return undefined;
                        // Any operator input clears the attention state (scope §1.1 — quiet once
                        // the operator is back at the wheel).
                        controller.clearAttention();
                        if (isOpenPalette(data, manager)) {
                            controller.openPalette();
                            return {
                                consume: true
                            };
                        }
                        if (isStash(data, manager)) {
                            controller.stashOrPop();
                            return {
                                consume: true
                            };
                        }
                        if (isToggleThinking(data, manager)) {
                            var revealed = controller.toggleThinking();
                            tui.flash(revealed ? "thinking: shown" : "thinking: hidden");
                            return {
                                consume: true
                            };
                        }
                        if (escDetector.feed(data)) {
                            composer.clear();
                            tui.flash("draft cleared");
                            return {
                                consume: true
                            };
                        }
                        if (isQuit(data, manager)) {
                            var now = Date.now();
                            if (lastQuitConfirmAt > 0 && now - lastQuitConfirmAt <= 700) {
                                requestExit({
                                    kind: "quit"
                                });
                                return {
                                    consume: true
                                };
                            }
                            lastQuitConfirmAt = now;
                            tui.flash("Press Ctrl+C again to quit");
                            return {
                                consume: true
                            };
                        }
                        return undefined;
                    });
                    // ── Start the terminal + event loop ────────────────────────────────────
                    terminal.write(FOCUS_REPORT_ENABLE); // enable DEC 1004 focus reporting
                    tui.start();
                    if (!options.quiet) {
                        process.stderr.write("[openkai] tui ready \xb7 mode=".concat(runMode.mode, " \xb7 model=").concat(modelId, " \xb7 session=").concat(store.sessionId.slice(0, 8), "\n"));
                        if (runMode.mode === "local") {
                            process.stderr.write("[openkai] local mode — Cortex unreachable or unset; persisting locally only.\n");
                        }
                    }
                    consumePromise = controller.consume();
                    return [
                        4,
                        Promise.race([
                            exitRequested,
                            consumePromise.then(function() {
                                return {
                                    kind: "quit"
                                };
                            }).catch(function() {
                                return {
                                    kind: "quit"
                                };
                            })
                        ])
                    ];
                case 9:
                    next = _state.sent();
                    return [
                        4,
                        controller.shutdown()
                    ];
                case 10:
                    _state.sent();
                    return [
                        4,
                        consumePromise.catch(function() {
                            return undefined;
                        })
                    ];
                case 11:
                    _state.sent();
                    tui.stop();
                    terminal.write(FOCUS_REPORT_DISABLE); // leave the terminal clean
                    return [
                        4,
                        terminal.drainInput()
                    ];
                case 12:
                    _state.sent();
                    return [
                        2,
                        {
                            code: 0,
                            next: next
                        }
                    ];
            }
        });
    })();
}
