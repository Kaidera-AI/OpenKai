//# hash=9e9d20b0a612ee426ac3e356e63f44c5
//# sourceMappingURL=app.js.map

function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
}
function _async_iterator(iterable) {
    var method, async, sync, retry = 2;
    for("undefined" != typeof Symbol && (async = Symbol.asyncIterator, sync = Symbol.iterator); retry--;){
        if (async && null != (method = iterable[async])) return method.call(iterable);
        if (sync && null != (method = iterable[sync])) return new AsyncFromSyncIterator(method.call(iterable));
        async = "@@asyncIterator", sync = "@@iterator";
    }
    throw new TypeError("Object is not async iterable");
}
function AsyncFromSyncIterator(s) {
    function AsyncFromSyncIteratorContinuation(r) {
        if (Object(r) !== r) return Promise.reject(new TypeError(r + " is not an object."));
        var done = r.done;
        return Promise.resolve(r.value).then(function(value) {
            return {
                value: value,
                done: done
            };
        });
    }
    return AsyncFromSyncIterator = function(s) {
        this.s = s, this.n = s.next;
    }, AsyncFromSyncIterator.prototype = {
        s: null,
        n: null,
        next: function() {
            return AsyncFromSyncIteratorContinuation(this.n.apply(this.s, arguments));
        },
        return: function(value) {
            var ret = this.s.return;
            return void 0 === ret ? Promise.resolve({
                value: value,
                done: !0
            }) : AsyncFromSyncIteratorContinuation(ret.apply(this.s, arguments));
        },
        throw: function(value) {
            var thr = this.s.return;
            return void 0 === thr ? Promise.reject(value) : AsyncFromSyncIteratorContinuation(thr.apply(this.s, arguments));
        }
    }, new AsyncFromSyncIterator(s);
}
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
function _instanceof(left, right) {
    "@swc/helpers - instanceof";
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else return left instanceof right;
}
function _iterable_to_array(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) {
        return Array.from(iter);
    }
}
function _non_iterable_spread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
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
function _to_consumable_array(arr) {
    return _array_without_holes(arr) || _iterable_to_array(arr) || _unsupported_iterable_to_array(arr) || _non_iterable_spread();
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
function _type_of(obj) {
    "@swc/helpers - typeof";
    return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj;
}
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
/**
 * TUI app + controller (scope §4 `app.ts`).
 *
 * Builds the layout root — `VStack([ScrollView(transcript), composer.editor,
 * status])` — and the {@link TuiController} that wires the P2
 * {@link SessionTransport} event stream to the transcript + status chrome.
 * The same transport drives the loop; the TUI is the second renderer
 * (scope §1: "same transport, second renderer — do not fork the loop").
 *
 * P4b (scope §1) wires six TUI-surface features into the controller:
 *  - attention notifications (§1.1) — turn_end / permission_request light the
 *    amber chrome state + fire a focus-gated bell/OSC via {@link AttentionNotifier}.
 *  - per-agent identity (§1.2) — the assistant header is a coloured pill.
 *  - leader-key command palette (§1.3) — {@link CommandPalette} overlay.
 *  - prompt stash + frecency history (§1.4) — {@link PromptStash} +
 *    {@link FrecencyHistory}, ranked by the pure {@link rankFrecency}.
 *  - `/btw` side channel (§1.5) — answer renders as a system-marked block.
 *  - `/undo` surface (§1.6) — over `transport.undoLastMutation()`.
 */ import { ScrollView, VStack } from "@earendil-works/pi-tui";
import { listSessions } from "@openkai/core";
import { Transcript } from "./transcript.js";
import { Composer } from "./composer.js";
import { StatusLine, defaultStatusState } from "./status.js";
import { parseSlashCommand, helpText, buildPaletteItems } from "./commands.js";
import { PermissionOverlay } from "./permission.js";
import { CommandPalette } from "./palette.js";
import { PromptStash } from "./stash.js";
import { splashLines } from "./brand.js";
import { CLI_VERSION } from "../version.js";
/** Build the TUI layout + controller against a `TUI`. */ export function buildTuiApp(tui, options) {
    var _options_agentName;
    var agentName = (_options_agentName = options.agentName) !== null && _options_agentName !== void 0 ? _options_agentName : "openkai";
    var transcript = new Transcript(agentName);
    if (options.replayMessages) {
        var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
        try {
            for(var _iterator = options.replayMessages[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                var msg = _step.value;
                if (!("role" in msg)) continue;
                var role = msg.role;
                var text = messageText(msg);
                if (role === "user") transcript.addUserMessage(text);
                else if (role === "assistant") transcript.replayAssistant(text);
            }
        } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
        } finally{
            try {
                if (!_iteratorNormalCompletion && _iterator.return != null) {
                    _iterator.return();
                }
            } finally{
                if (_didIteratorError) {
                    throw _iteratorError;
                }
            }
        }
    } else {
        // Brand moment: full splash exactly once, compact mark ever after
        // (droid bar; state is user-global, ~/.openkai/state.json).
        transcript.addNotice(splashLines(CLI_VERSION));
    }
    var statusState = defaultStatusState(options.modelId, options.sessionId, options.persistMode);
    statusState.agentName = agentName;
    var status = new StatusLine(statusState);
    var controller = new TuiController(tui, options, transcript, status);
    var composer = new Composer(tui, {
        onSubmit: function onSubmit(text) {
            var command = parseSlashCommand(text);
            if (command) {
                void controller.dispatchCommand(command.name, command.argument);
                return;
            }
            void controller.submit(text);
        }
    });
    controller.attachComposer(composer);
    var scroll = new ScrollView(transcript, {
        follow: "end",
        primary: true,
        scrollbar: "auto"
    });
    var root = new VStack([
        {
            component: scroll,
            grow: 1
        },
        {
            component: composer.editor,
            basis: "auto",
            shrink: 0
        },
        {
            component: status,
            basis: 1,
            shrink: 0,
            minSize: 1
        }
    ], {
        gap: 0,
        align: "stretch"
    });
    return {
        root: root,
        transcript: transcript,
        composer: composer,
        status: status,
        controller: controller
    };
}
/** Extract text from an AgentMessage for replay display. */ function messageText(msg) {
    if (!("content" in msg)) return "";
    var content = msg.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return content.filter(function(p) {
            return (typeof p === "undefined" ? "undefined" : _type_of(p)) === "object" && p !== null && "type" in p && p.type === "text";
        }).map(function(p) {
            return p.text;
        }).join("");
    }
    return "";
}
/** Controller — bridges the transport event stream to the transcript + chrome. */ export var TuiController = /*#__PURE__*/ function() {
    "use strict";
    function TuiController(tui, options, transcript, status) {
        _class_call_check(this, TuiController);
        var _options_stash;
        _define_property(this, "tui", void 0);
        _define_property(this, "transport", void 0);
        _define_property(this, "store", void 0);
        _define_property(this, "checkpoint", void 0);
        _define_property(this, "transcript", void 0);
        _define_property(this, "status", void 0);
        _define_property(this, "modelId", void 0);
        _define_property(this, "sessionId", void 0);
        _define_property(this, "sessionsRoot", void 0);
        _define_property(this, "onExit", void 0);
        _define_property(this, "notifier", void 0);
        _define_property(this, "stash", void 0);
        _define_property(this, "history", void 0);
        _define_property(this, "onUndo", void 0);
        _define_property(this, "composer", void 0);
        _define_property(this, "busy", false);
        _define_property(this, "done", false);
        /** True while the current turn is a `/btw` side channel (scope §1.5) — persistTurn skips it so the ephemeral exchange never re-persists the prior assistant block. */ _define_property(this, "btwTurn", false);
        this.tui = tui;
        this.transport = options.transport;
        this.store = options.store;
        this.checkpoint = options.checkpoint;
        this.transcript = transcript;
        this.status = status;
        this.modelId = options.modelId;
        this.sessionId = options.sessionId;
        this.sessionsRoot = options.sessionsRoot;
        this.onExit = options.onExit;
        this.notifier = options.notifier;
        this.stash = (_options_stash = options.stash) !== null && _options_stash !== void 0 ? _options_stash : new PromptStash();
        this.history = options.history;
        this.onUndo = options.onUndo;
    }
    _create_class(TuiController, [
        {
            /** Attach the composer (set after construction so the controller can build it). */ key: "attachComposer",
            value: function attachComposer(composer) {
                this.composer = composer;
            }
        },
        {
            key: "dispatchCommand",
            value: /** Execute a slash command (scope §4). Output is a local notice — never sent to the model. */ function dispatchCommand(name, argument) {
                return _async_to_generator(function() {
                    var _this, ids, _this_onExit, _this1, _this_onExit1, _this2, _this_onExit2, _this3;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                _this = this;
                                switch(name){
                                    case "help":
                                        return [
                                            3,
                                            1
                                        ];
                                    case "model":
                                        return [
                                            3,
                                            2
                                        ];
                                    case "sessions":
                                        return [
                                            3,
                                            3
                                        ];
                                    case "new":
                                        return [
                                            3,
                                            5
                                        ];
                                    case "resume":
                                        return [
                                            3,
                                            6
                                        ];
                                    case "btw":
                                        return [
                                            3,
                                            7
                                        ];
                                    case "undo":
                                        return [
                                            3,
                                            9
                                        ];
                                    case "quit":
                                        return [
                                            3,
                                            11
                                        ];
                                }
                                return [
                                    3,
                                    12
                                ];
                            case 1:
                                this.transcript.addNotice(helpText());
                                return [
                                    3,
                                    13
                                ];
                            case 2:
                                this.transcript.addNotice(argument.length > 0 ? "model: ".concat(this.modelId, " — changing the model mid-session is P4b; relaunch with --model ").concat(argument) : "model: ".concat(this.modelId));
                                return [
                                    3,
                                    13
                                ];
                            case 3:
                                return [
                                    4,
                                    listSessions(this.sessionsRoot)
                                ];
                            case 4:
                                ids = _state.sent();
                                this.transcript.addNotice(ids.length === 0 ? "sessions: none yet" : [
                                    "sessions:"
                                ].concat(_to_consumable_array(ids.map(function(id) {
                                    return "  ".concat(id).concat(id === _this.sessionId ? "  (current)" : "");
                                }))));
                                return [
                                    3,
                                    13
                                ];
                            case 5:
                                this.transcript.addNotice("starting a fresh session…");
                                (_this_onExit = (_this1 = this).onExit) === null || _this_onExit === void 0 ? void 0 : _this_onExit.call(_this1, {
                                    kind: "restart"
                                });
                                return [
                                    3,
                                    13
                                ];
                            case 6:
                                if (argument.length === 0) {
                                    this.transcript.addNotice("resume: needs a session id — /resume <id> (see /sessions)");
                                    return [
                                        3,
                                        13
                                    ];
                                }
                                this.transcript.addNotice("resuming ".concat(argument, "…"));
                                (_this_onExit1 = (_this2 = this).onExit) === null || _this_onExit1 === void 0 ? void 0 : _this_onExit1.call(_this2, {
                                    kind: "restart",
                                    sessionId: argument
                                });
                                return [
                                    3,
                                    13
                                ];
                            case 7:
                                if (argument.length === 0) {
                                    this.transcript.addNotice("btw: needs a side question — /btw <text>");
                                    return [
                                        3,
                                        13
                                    ];
                                }
                                return [
                                    4,
                                    this.btw(argument)
                                ];
                            case 8:
                                _state.sent();
                                return [
                                    3,
                                    13
                                ];
                            case 9:
                                return [
                                    4,
                                    this.undo()
                                ];
                            case 10:
                                _state.sent();
                                return [
                                    3,
                                    13
                                ];
                            case 11:
                                (_this_onExit2 = (_this3 = this).onExit) === null || _this_onExit2 === void 0 ? void 0 : _this_onExit2.call(_this3, {
                                    kind: "quit"
                                });
                                return [
                                    3,
                                    13
                                ];
                            case 12:
                                this.transcript.addNotice("unknown command: /".concat(name, " — try /help"));
                                return [
                                    3,
                                    13
                                ];
                            case 13:
                                this.tui.requestRender();
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            key: "submit",
            value: /** Submit a user prompt: persist + display + fire the transport turn. */ function submit(text) {
                return _async_to_generator(function() {
                    var userMsg;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                userMsg = {
                                    role: "user",
                                    content: text,
                                    timestamp: Date.now()
                                };
                                return [
                                    4,
                                    this.store.appendMessage(userMsg)
                                ];
                            case 1:
                                _state.sent();
                                this.transcript.addUserMessage(text);
                                this.recordPrompt(text); // frecency history (scope §1.4) — best-effort
                                this.btwTurn = false; // this is a normal user turn, not a /btw side channel
                                this.setBusy(true);
                                return [
                                    4,
                                    this.transport.prompt(text)
                                ];
                            case 2:
                                _state.sent();
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            key: "btw",
            value: /**
   * `/btw` side channel (scope §1.5): the question is sent to the model but is
   * NOT rendered as a user turn and NOT persisted — the answer streams into a
   * system-marked `btw` block. The exchange is ephemeral (live agent context).
   */ function btw(question) {
                return _async_to_generator(function() {
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                if (this.busy) {
                                    this.transcript.addNotice("btw: a turn is already running — wait for it to settle");
                                    this.tui.requestRender();
                                    return [
                                        2
                                    ];
                                }
                                this.transcript.beginBtwTurn(question);
                                this.btwTurn = true; // mark the turn ephemeral — turn_end must NOT persist (scope §1.5)
                                this.setBusy(true);
                                this.tui.requestRender();
                                return [
                                    4,
                                    this.transport.prompt(question)
                                ];
                            case 1:
                                _state.sent();
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            key: "undo",
            value: /** `/undo` surface (scope §1.6): restore the last gated mutation. */ function undo() {
                return _async_to_generator(function() {
                    var sha, error;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                if (!this.onUndo) {
                                    this.transcript.addNotice("undo: unavailable (permission gate not enabled)");
                                    this.tui.requestRender();
                                    return [
                                        2
                                    ];
                                }
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
                                    this.onUndo()
                                ];
                            case 2:
                                sha = _state.sent();
                                this.transcript.addNotice("undo: restored to snapshot ".concat(sha.slice(0, 10)));
                                return [
                                    3,
                                    4
                                ];
                            case 3:
                                error = _state.sent();
                                this.transcript.addNotice("undo: ".concat(_instanceof(error, Error) ? error.message : String(error)));
                                return [
                                    3,
                                    4
                                ];
                            case 4:
                                this.tui.requestRender();
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            /** Open the leader-key command palette (scope §1.3). */ key: "openPalette",
            value: function openPalette() {
                var _this = this;
                var actions = this.paletteActions();
                var items = buildPaletteItems(actions);
                var palette = new CommandPalette({
                    items: items,
                    onSelect: function onSelect(item) {
                        _this.tui.hideOverlay();
                        _this.refocusComposer();
                        var action = item.action;
                        if (action) action();
                    },
                    onCancel: function onCancel() {
                        _this.tui.hideOverlay();
                        _this.refocusComposer();
                    }
                });
                this.tui.showOverlay(palette, {
                    anchor: "center",
                    width: "50%",
                    maxHeight: "60%"
                });
            }
        },
        {
            key: "paletteActions",
            value: /** The palette action table — each value maps to a controller method. */ function paletteActions() {
                var _this = this;
                return {
                    help: function help() {
                        return void _this.dispatchCommand("help", "");
                    },
                    model: function model() {
                        return void _this.dispatchCommand("model", "");
                    },
                    sessions: function sessions() {
                        return void _this.dispatchCommand("sessions", "");
                    },
                    resume: function resume() {
                        var _this_composer;
                        return (_this_composer = _this.composer) === null || _this_composer === void 0 ? void 0 : _this_composer.prefill("/resume ");
                    },
                    new: function _new() {
                        return void _this.dispatchCommand("new", "");
                    },
                    btw: function btw() {
                        var _this_composer;
                        return (_this_composer = _this.composer) === null || _this_composer === void 0 ? void 0 : _this_composer.prefill("/btw ");
                    },
                    undo: function undo() {
                        return void _this.undo();
                    },
                    quit: function quit() {
                        return void _this.dispatchCommand("quit", "");
                    },
                    "toggle-thinking": function() {
                        return _this.toggleThinking();
                    },
                    palette: function palette() {
                        return undefined;
                    },
                    stash: function stash() {
                        return _this.stashOrPop();
                    }
                };
            }
        },
        {
            /** Stash / pop the prompt draft (scope §1.4). */ key: "stashOrPop",
            value: function stashOrPop() {
                if (!this.composer) return;
                if (this.composer.text.trim().length > 0) {
                    this.stash.push(this.composer.text);
                    this.composer.clear();
                    this.flash("stashed (".concat(this.stash.size, ")"));
                    return;
                }
                var popped = this.stash.pop();
                if (popped === undefined) {
                    this.flash("stash empty");
                    return;
                }
                this.composer.clear();
                this.composer.insert(popped);
                this.flash("popped");
            }
        },
        {
            key: "flash",
            value: /**
   * Best-effort transient flash — `flash` lives on {@link TuiAltScreen}, not the
   * `TUI` base, so duck-type it (the headless test stub has no flash; no-ops).
   */ function flash(message) {
                var _this_tui_flash, _this_tui;
                (_this_tui_flash = (_this_tui = this.tui).flash) === null || _this_tui_flash === void 0 ? void 0 : _this_tui_flash.call(_this_tui, message);
            }
        },
        {
            key: "refocusComposer",
            value: /** Restore focus to the composer (after an overlay closes). */ function refocusComposer() {
                if (this.composer) this.tui.setFocus(this.composer.editor);
                this.tui.requestRender();
            }
        },
        {
            key: "seedHistory",
            value: /**
   * Seed the composer's prompt history with frecency-ranked prompts (scope
   * §1.4) so up-arrow recalls the most-frecent first (history[0] = top).
   */ function seedHistory() {
                return _async_to_generator(function() {
                    var now, ranked, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, entry;
                    return _ts_generator(this, function(_state) {
                        if (!this.history || !this.composer) return [
                            2
                        ];
                        now = Date.now();
                        ranked = this.history.ranked(now);
                        _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                        try {
                            // pi-tui's editor.addToHistory unshifts (prepends) and navigateHistory
                            // reads history[0] first. To recall the most-frecent prompt first on
                            // up-arrow, seed in reverse (worst-first) so the best entry is the LAST
                            // unshifted and lands at history[0] (scope §1.4: "history recall ranks by
                            // frecency").
                            for(_iterator = _to_consumable_array(ranked).reverse()[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                                entry = _step.value;
                                this.composer.editor.addToHistory(entry.text);
                            }
                        } catch (err) {
                            _didIteratorError = true;
                            _iteratorError = err;
                        } finally{
                            try {
                                if (!_iteratorNormalCompletion && _iterator.return != null) {
                                    _iterator.return();
                                }
                            } finally{
                                if (_didIteratorError) {
                                    throw _iteratorError;
                                }
                            }
                        }
                        return [
                            2
                        ];
                    });
                }).call(this);
            }
        },
        {
            key: "recordPrompt",
            value: /** Record a submitted prompt to the frecency store (best-effort persist). */ function recordPrompt(text) {
                if (!this.history) return;
                this.history.record(text, Date.now());
                void this.history.save().catch(function() {
                    return undefined;
                });
            }
        },
        {
            key: "consume",
            value: /** Consume the transport event stream to completion (drives the render). */ function consume() {
                return _async_to_generator(function() {
                    var _iteratorAbruptCompletion, _didIteratorError, _iteratorError, _iterator, _step, _value, event, err;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                _iteratorAbruptCompletion = false, _didIteratorError = false;
                                _state.label = 1;
                            case 1:
                                _state.trys.push([
                                    1,
                                    6,
                                    7,
                                    12
                                ]);
                                _iterator = _async_iterator(this.transport.events());
                                _state.label = 2;
                            case 2:
                                return [
                                    4,
                                    _iterator.next()
                                ];
                            case 3:
                                if (!(_iteratorAbruptCompletion = !(_step = _state.sent()).done)) return [
                                    3,
                                    5
                                ];
                                _value = _step.value;
                                event = _value;
                                this.applyEvent(event);
                                this.tui.requestRender();
                                _state.label = 4;
                            case 4:
                                _iteratorAbruptCompletion = false;
                                return [
                                    3,
                                    2
                                ];
                            case 5:
                                return [
                                    3,
                                    12
                                ];
                            case 6:
                                err = _state.sent();
                                _didIteratorError = true;
                                _iteratorError = err;
                                return [
                                    3,
                                    12
                                ];
                            case 7:
                                _state.trys.push([
                                    7,
                                    ,
                                    10,
                                    11
                                ]);
                                if (!(_iteratorAbruptCompletion && _iterator.return != null)) return [
                                    3,
                                    9
                                ];
                                return [
                                    4,
                                    _iterator.return()
                                ];
                            case 8:
                                _state.sent();
                                _state.label = 9;
                            case 9:
                                return [
                                    3,
                                    11
                                ];
                            case 10:
                                if (_didIteratorError) {
                                    throw _iteratorError;
                                }
                                return [
                                    7
                                ];
                            case 11:
                                return [
                                    7
                                ];
                            case 12:
                                this.setBusy(false);
                                this.done = true;
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            /** Apply one event to the transcript + chrome (pure, testable). */ key: "applyEvent",
            value: function applyEvent(event) {
                switch(event.kind){
                    case "connected":
                        this.setBusy(true);
                        this.transcript.applyEvent(event);
                        break;
                    case "delta":
                        this.transcript.applyEvent(event);
                        break;
                    case "tool_call":
                    case "tool_result":
                        this.transcript.applyEvent(event);
                        break;
                    case "usage":
                        this.updateUsage(event.usage);
                        break;
                    case "turn_end":
                        this.transcript.applyEvent(event);
                        this.setBusy(false);
                        if (!this.btwTurn) void this.persistTurn(); // /btw turns are ephemeral — never re-persist (scope §1.5)
                        this.btwTurn = false;
                        // Attention (scope §1.1): a turn settled — if unfocused, bell/OSC + chrome.
                        this.signalAttention("Turn complete");
                        break;
                    case "permission_request":
                        // P4b: a gated tool is awaiting approval. Show the overlay; the
                        // spinner reflects "waiting on you" (scope §5). The overlay's
                        // onDecision calls transport.respond + hides the overlay. The event
                        // pump keeps draining (consume loop is concurrent — scope §9): the
                        // tool's execute() is blocked awaiting the matching respond() promise,
                        // and the operator's input path (a separate event-loop task) resolves
                        // it, so there is no shared turn and no deadlock.
                        this.showPermission(event);
                        this.signalAttention("Permission required: ".concat(event.toolName));
                        break;
                    case "session_end":
                        this.transcript.applyEvent(event);
                        this.setBusy(false);
                        break;
                    case "error":
                        this.transcript.applyEvent(event);
                        this.setBusy(false);
                        break;
                    default:
                        break;
                }
            }
        },
        {
            /** Toggle thinking density (Ctrl+O). */ key: "toggleThinking",
            value: function toggleThinking() {
                return this.transcript.toggleThinking();
            }
        },
        {
            key: "shutdown",
            value: /** Tear down: abort + flush store + checkpoint + close transport. */ function shutdown() {
                return _async_to_generator(function() {
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                this.transport.abort();
                                if (!this.checkpoint) return [
                                    3,
                                    2
                                ];
                                return [
                                    4,
                                    this.checkpoint.flushNow()
                                ];
                            case 1:
                                _state.sent();
                                _state.label = 2;
                            case 2:
                                return [
                                    4,
                                    this.transport.close()
                                ];
                            case 3:
                                _state.sent();
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        },
        {
            key: "isDone",
            get: function get() {
                return this.done;
            }
        },
        {
            key: "signalAttention",
            value: // ── Attention (scope §1.1) ──────────────────────────────────────────────
            /** Light the amber chrome + fire a focus-gated bell/OSC (scope §1.1). */ function signalAttention(title) {
                if (this.notifier) this.notifier.notify(title);
                var unfocused = this.notifier ? !this.notifier.isFocused : false;
                this.setAttention(unfocused);
            }
        },
        {
            /** Clear the chrome attention state (called on operator input, scope §1.1). */ key: "clearAttention",
            value: function clearAttention() {
                this.setAttention(false);
            }
        },
        {
            /** Mark the terminal focused (from DEC 1004 focus-in/out, scope §1.1). */ key: "setFocused",
            value: function setFocused(focused) {
                var _this_notifier;
                (_this_notifier = this.notifier) === null || _this_notifier === void 0 ? void 0 : _this_notifier.setFocused(focused);
                if (focused) this.setAttention(false);
            }
        },
        {
            key: "setAttention",
            value: function setAttention(on) {
                var state = this.status.currentState;
                if (state.attention === on) return;
                this.status.update(_object_spread_props(_object_spread({}, state), {
                    attention: on
                }));
            }
        },
        {
            key: "setBusy",
            value: function setBusy(busy) {
                this.busy = busy;
                var state = this.status.currentState;
                this.status.update(_object_spread_props(_object_spread({}, state), {
                    busy: busy
                }));
            }
        },
        {
            key: "setAwaitingApproval",
            value: function setAwaitingApproval(awaiting) {
                var state = this.status.currentState;
                this.status.update(_object_spread_props(_object_spread({}, state), {
                    awaitingApproval: awaiting
                }));
            }
        },
        {
            key: "showPermission",
            value: /** Show the permission overlay for a `permission_request` event (P4b §5). */ function showPermission(event) {
                var _this = this;
                this.setAwaitingApproval(true);
                var overlay = new PermissionOverlay({
                    toolName: event.toolName,
                    rule: event.rule,
                    preview: event.preview,
                    onDecision: function onDecision(decision) {
                        try {
                            _this.transport.respond(event.requestId, decision);
                        } catch (unused) {
                        // Transport without a gate — already refused at emit time; ignore.
                        }
                        _this.tui.hideOverlay();
                        _this.setAwaitingApproval(false);
                        _this.setBusy(true);
                        _this.tui.requestRender();
                    }
                });
                this.tui.showOverlay(overlay, {
                    anchor: "center",
                    width: "60%"
                });
            }
        },
        {
            key: "updateUsage",
            value: function updateUsage(usage) {
                var state = this.status.currentState;
                this.status.update(_object_spread_props(_object_spread({}, state), {
                    usage: usage
                }));
            }
        },
        {
            key: "persistTurn",
            value: /** Persist the settled assistant text at turn settlement. */ function persistTurn() {
                return _async_to_generator(function() {
                    var last, assistantMsg, entries;
                    return _ts_generator(this, function(_state) {
                        switch(_state.label){
                            case 0:
                                last = this.transcript.lastAssistantText();
                                if (last.length === 0) return [
                                    2
                                ];
                                assistantMsg = {
                                    role: "assistant",
                                    content: [
                                        {
                                            type: "text",
                                            text: last
                                        }
                                    ],
                                    timestamp: Date.now()
                                };
                                return [
                                    4,
                                    this.store.appendMessage(assistantMsg)
                                ];
                            case 1:
                                _state.sent();
                                if (!this.checkpoint) return [
                                    3,
                                    3
                                ];
                                return [
                                    4,
                                    this.store.readEntries()
                                ];
                            case 2:
                                entries = _state.sent();
                                this.checkpoint.record(entries);
                                _state.label = 3;
                            case 3:
                                return [
                                    2
                                ];
                        }
                    });
                }).call(this);
            }
        }
    ]);
    return TuiController;
}();
