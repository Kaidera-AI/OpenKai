//# hash=6990a9432098ac7928fe510fb4bd461e
//# sourceMappingURL=index.js.map

#!/usr/bin/env node
function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_with_holes(arr) {
    if (Array.isArray(arr)) return arr;
}
function _assert_this_initialized(self) {
    if (self === void 0) throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
    return self;
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
function _call_super(_this, derived, args) {
    derived = _get_prototype_of(derived);
    return _possible_constructor_return(_this, _is_native_reflect_construct() ? Reflect.construct(derived, args || [], _get_prototype_of(_this).constructor) : derived.apply(_this, args));
}
function _class_call_check(instance, Constructor) {
    if (!(instance instanceof Constructor)) throw new TypeError("Cannot call a class as a function");
}
function _construct(Parent, args, Class) {
    if (_is_native_reflect_construct()) _construct = Reflect.construct;
    else {
        _construct = function construct(Parent, args, Class) {
            var a = [
                null
            ];
            a.push.apply(a, args);
            var Constructor = Function.bind.apply(Parent, a);
            var instance = new Constructor();
            if (Class) _set_prototype_of(instance, Class.prototype);
            return instance;
        };
    }
    return _construct.apply(null, arguments);
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
function _get_prototype_of(o) {
    _get_prototype_of = Object.setPrototypeOf ? Object.getPrototypeOf : function getPrototypeOf(o) {
        return o.__proto__ || Object.getPrototypeOf(o);
    };
    return _get_prototype_of(o);
}
function _inherits(subClass, superClass) {
    if (typeof superClass !== "function" && superClass !== null) {
        throw new TypeError("Super expression must either be null or a function");
    }
    subClass.prototype = Object.create(superClass && superClass.prototype, {
        constructor: {
            value: subClass,
            writable: true,
            configurable: true
        }
    });
    if (superClass) _set_prototype_of(subClass, superClass);
}
function _instanceof(left, right) {
    "@swc/helpers - instanceof";
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else return left instanceof right;
}
function _is_native_function(fn) {
    return Function.toString.call(fn).indexOf("[native code]") !== -1;
}
function _is_native_reflect_construct() {
    try {
        var result = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}));
    } catch (_) {}
    return (_is_native_reflect_construct = function() {
        return !!result;
    })();
}
function _iterable_to_array(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) {
        return Array.from(iter);
    }
}
function _non_iterable_rest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
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
function _possible_constructor_return(self, call) {
    if (call && (_type_of(call) === "object" || typeof call === "function")) return call;
    return _assert_this_initialized(self);
}
function _set_prototype_of(o, p) {
    _set_prototype_of = Object.setPrototypeOf || function setPrototypeOf(o, p) {
        o.__proto__ = p;
        return o;
    };
    return _set_prototype_of(o, p);
}
function _to_array(arr) {
    return _array_with_holes(arr) || _iterable_to_array(arr) || _unsupported_iterable_to_array(arr) || _non_iterable_rest();
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
function _wrap_native_super(Class) {
    var _cache = typeof Map === "function" ? new Map() : undefined;
    _wrap_native_super = function(Class) {
        if (Class === null || !_is_native_function(Class)) return Class;
        if (typeof Class !== "function") throw new TypeError("Super expression must either be null or a function");
        if (typeof _cache !== "undefined") {
            if (_cache.has(Class)) return _cache.get(Class);
            _cache.set(Class, Wrapper);
        }
        function Wrapper() {
            return _construct(Class, arguments, _get_prototype_of(this).constructor);
        }
        Wrapper.prototype = Object.create(Class.prototype, {
            constructor: {
                value: Wrapper,
                enumerable: false,
                writable: true,
                configurable: true
            }
        });
        return _set_prototype_of(Wrapper, Class);
    };
    return _wrap_native_super(Class);
}
/**
 * openkai — operator CLI for the OpenKai harness.
 *
 * P1: `openkai events --print` streams the project's live Cortex team_events.
 * P2: `openkai chat --prompt …` runs the single-lane agent loop (OpenRouter),
 *      persisting the session JSONL v3 tree under `.openkai/sessions/` and
 *      checkpointing to Cortex (`POST /sessions/ingest` + `POST /log`).
 *      `openkai sessions` lists the local session tree.
 */ import { CortexClient } from "@openkai/core";
import { DEFAULT_MODEL_ID } from "@openkai/core";
import { runChat } from "./chat.js";
import { loadDotEnv } from "./env.js";
import { runFuse } from "./fuse.js";
import { runFusionAdvise, runFusionReport } from "./fusion.js";
import { runInfo } from "./info.js";
import { runTui } from "./tui/runtime.js";
import { runSessions } from "./sessions.js";
import { runUndo } from "./undo.js";
import { CLI_VERSION } from "./version.js";
// .env from the current directory loads before any command resolves config;
// real environment variables always win over file values.
loadDotEnv();
import { runUpgrade } from "./upgrade.js";
var USAGE = "openkai — OpenKai operator CLI\n\nUsage:\n  openkai chat --prompt <text> [options]\n  openkai sessions [--show <id>] [options]\n  openkai events --print [options]\n\nCommands:\n  openkai                Launch the TUI shell (same as openkai tui).\n\n  tui [options]          Launch the pi-tui alt-screen TUI shell (P4).\n\n  chat --prompt <text>   Run a single-prompt agent turn over OpenRouter and\n                         stream the reply to stdout. Persists the session\n                         JSONL v3 tree under .openkai/sessions/ and\n                         checkpoints it to Cortex.\n\n  sessions [--show <id>] List local persisted sessions (.openkai/sessions/),\n                         or show the full entry tree for one session id.\n\n  fuse --prompt <text>   Run one task through the fusion core (P3): architect\n                         + builder as separate fresh sessions in parallel,\n                         then an attributed synthesis. --gate wraps the run in\n                         gate-first validation (FU-3).\n\n  fusion report [--last n]  Per-model-pair A/B stats from the fusion runs log\n                         (.openkai/fusion/runs.jsonl).\n\n  fusion advise          Evaluate the FU-4 invocation policy for a task shape:\n                         --priority low|medium|high|urgent\n                         --class architecture|ambiguous|high-blast-radius|routine\n                         --files <n>  (expected blast radius)\n\n  undo [--history]       Restore the work tree to the previous shadow-git\n                         snapshot (taken before every gated mutation);\n                         --history lists snapshots newest-first.\n\n  info                   Self-check: version, run mode (standalone-local /\n                         KOS-managed), Cortex reachability, model catalogue,\n                         local state counts. Always exits 0.\n\n  events --print         Stream live Cortex team events (GET /events SSE) to\n                         stdout, one TSV row per event:\n                         id <TAB> type <TAB> agent <TAB> summary\n\nOptions:\n  --prompt <text>        (chat) The user prompt for the turn.\n  --provider <id>        Provider: openrouter (default), anthropic, openai,\n                         google, deepseek, kimi-coding, qwen-token-plan, xai,\n                         mistral, groq, cerebras, together, fireworks, nvidia,\n                         minimax, zai, vercel-ai-gateway. Keys live in .env.\n  --model <id>           Model id within the provider's catalogue\n                         (default: $OPENKAI_MODEL or ".concat(DEFAULT_MODEL_ID, ").\n  --system-prompt <text> (chat) Override the system prompt.\n  --show <id>            (sessions) Show full entries for one session id.\n  --session <id>        (tui) Resume a session by id.\n  --architect-model <id> (fuse) Architect role model (default: $OPENKAI_MODEL).\n  --builder-model <id>  (fuse) Builder role model (default: same as architect).\n  --judge-model <id>    (fuse) Synthesis/gate-validator model.\n  --gate                (fuse) Enable gate-first validation (FU-3).\n  --max-rounds <n>      (fuse) Gate repair cap, 1-10 (default 3).\n  --model <id>           (tui) OpenRouter model id (default: $OPENKAI_MODEL).\n  --last-id <id>         (events) Resume after a team_events id.\n  --count <n>            (events) Events per server read, 1-200 (default 50).\n  --ping <seconds>       (events) Server keep-alive cadence, 1-60 (default 15).\n  --project <key>        Cortex project (default: $CORTEX_PROJECT or openkai).\n  --api <url>            Cortex API base URL\n                         (default: $CORTEX_API_URL or http://localhost:8501).\n  --agent <name>         Agent name for Cortex writes / X-Agent-Name.\n  --quiet                (chat) Suppress stderr diagnostics (deltas still stream).\n  --keepalive            (events) Print ': ping' keep-alive ticks.\n  --verbose              (events) Print connect/retry diagnostics to stderr.\n  -h, --help             Show this help.\n\nEnvironment:\n  OPENROUTER_API_KEY     Required for `chat` — OpenRouter API key.\n  OPENKAI_MODEL          Default chat model (overrides the built-in default).\n  CORTEX_PROJECT         Cortex project scope (default: openkai).\n  CORTEX_API_URL         Cortex API base URL.\n  OPENKAI_CHANNEL        Override upgrade channel: standalone | npm.\n  OPENKAI_AUTO_UPDATE_ENABLED  Kill-switch: \"false\" disables standalone\n                         self-upgrade entirely (rollback still works).\n  OPENKAI_MANIFEST_URL   Release manifest URL (default:\n                         https://openkai.dev/releases/latest.json).\n  OPENKAI_RELEASE_PUBLIC_KEY  Base64 DER SPKI Ed25519 key; when set, manifest\n                         signatures are verified before any swap.\n");
var fail = function fail(message) {
    process.stderr.write("ERROR: ".concat(message, "\n\n").concat(USAGE));
    return 2;
};
var UsageError = /*#__PURE__*/ function(Error1) {
    "use strict";
    _inherits(UsageError, Error1);
    function UsageError() {
        _class_call_check(this, UsageError);
        var _this;
        _this = _call_super(this, UsageError, arguments), _define_property(_this, "name", "UsageError");
        return _this;
    }
    return UsageError;
}(_wrap_native_super(Error));
var parseBoundedInt = function parseBoundedInt(flag, raw, min, max) {
    var value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
        return "".concat(flag, " must be an integer between ").concat(min, " and ").concat(max, ' (got "').concat(raw, '")');
    }
    return value;
};
var renderEvent = function renderEvent(entry) {
    return "".concat(entry.id, "	").concat(entry.fields.type, "	").concat(entry.fields.agent, "	").concat(entry.fields.summary.replace(/\n/g, " "));
};
function runEvents(options) {
    return _async_to_generator(function() {
        var _ref, _options_project, project, client, abort, _iteratorAbruptCompletion, _didIteratorError, _iteratorError, _iterator, _step, _value, item, err, error;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    project = (_ref = (_options_project = options.project) !== null && _options_project !== void 0 ? _options_project : process.env.CORTEX_PROJECT) !== null && _ref !== void 0 ? _ref : "openkai";
                    client = new CortexClient({
                        baseUrl: options.api,
                        project: project,
                        agent: options.agent
                    });
                    abort = new AbortController();
                    process.on("SIGINT", function() {
                        return abort.abort();
                    });
                    process.on("SIGTERM", function() {
                        return abort.abort();
                    });
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        14,
                        ,
                        15
                    ]);
                    _iteratorAbruptCompletion = false, _didIteratorError = false;
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        7,
                        8,
                        13
                    ]);
                    _iterator = _async_iterator(client.streamEvents({
                        lastId: options.lastId,
                        count: options.count,
                        pingSeconds: options.pingSeconds,
                        signal: abort.signal
                    }));
                    _state.label = 3;
                case 3:
                    return [
                        4,
                        _iterator.next()
                    ];
                case 4:
                    if (!(_iteratorAbruptCompletion = !(_step = _state.sent()).done)) return [
                        3,
                        6
                    ];
                    _value = _step.value;
                    item = _value;
                    switch(item.kind){
                        case "connected":
                            if (options.verbose) {
                                process.stderr.write("connected (cursor=".concat(item.cursor || "head", ")\n"));
                            }
                            break;
                        case "event":
                            process.stdout.write("".concat(renderEvent(item.entry), "\n"));
                            break;
                        case "ping":
                            if (options.keepalive) {
                                process.stdout.write(": ".concat(item.comment, "\n"));
                            }
                            break;
                        case "stream-error":
                            process.stderr.write("stream-error: ".concat(item.message, "\n"));
                            break;
                        case "retrying":
                            process.stderr.write("reconnecting in ".concat(item.delayMs, "ms (attempt ").concat(item.attempt, "): ").concat(item.reason, "\n"));
                            break;
                    }
                    _state.label = 5;
                case 5:
                    _iteratorAbruptCompletion = false;
                    return [
                        3,
                        3
                    ];
                case 6:
                    return [
                        3,
                        13
                    ];
                case 7:
                    err = _state.sent();
                    _didIteratorError = true;
                    _iteratorError = err;
                    return [
                        3,
                        13
                    ];
                case 8:
                    _state.trys.push([
                        8,
                        ,
                        11,
                        12
                    ]);
                    if (!(_iteratorAbruptCompletion && _iterator.return != null)) return [
                        3,
                        10
                    ];
                    return [
                        4,
                        _iterator.return()
                    ];
                case 9:
                    _state.sent();
                    _state.label = 10;
                case 10:
                    return [
                        3,
                        12
                    ];
                case 11:
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                    return [
                        7
                    ];
                case 12:
                    return [
                        7
                    ];
                case 13:
                    return [
                        2,
                        0
                    ];
                case 14:
                    error = _state.sent();
                    if (abort.signal.aborted) return [
                        2,
                        0
                    ];
                    process.stderr.write("ERROR: ".concat(_instanceof(error, Error) ? error.message : String(error), "\n"));
                    return [
                        2,
                        1
                    ];
                case 15:
                    return [
                        2
                    ];
            }
        });
    })();
}
function main(argv) {
    return _async_to_generator(function() {
        var _argv, command, rest, flags, positional, _loop, index, _ret, getString, getBool, prompt, options, result, options1, _getString, prompt1, options2, roundsRaw, parsed, sub, lastRaw, last, parsed1, breadthRaw, filesBreadth, parsed2, options3, result1, options4, countRaw, parsed3, pingRaw, parsed4;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _argv = _to_array(argv), command = _argv[0], rest = _argv.slice(1);
                    // Bare `openkai` (no command) launches the TUI (scope §4.1).
                    if (command === undefined) {
                        return [
                            2,
                            runTui(buildTuiOptions(rest))
                        ];
                    }
                    if (command === "--help" || command === "-h" || command === "help") {
                        process.stdout.write(USAGE);
                        return [
                            2,
                            0
                        ];
                    }
                    if (command === "--version" || command === "-v" || command === "version") {
                        process.stdout.write("openkai ".concat(CLI_VERSION, "\n"));
                        return [
                            2,
                            0
                        ];
                    }
                    // ── Shared flag parser helpers ─────────────────────────────────────────
                    flags = {};
                    positional = [];
                    try {
                        _loop = function(index) {
                            var flag = rest[index];
                            var value = function value() {
                                var raw = rest[index += 1];
                                if (raw === undefined) {
                                    throw new UsageError("".concat(flag, " requires a value"));
                                }
                                return raw;
                            };
                            switch(flag){
                                case "--help":
                                case "-h":
                                    process.stdout.write(USAGE);
                                    return {
                                        v: 0
                                    };
                                default:
                                    if (flag === null || flag === void 0 ? void 0 : flag.startsWith("--")) {
                                        var _rest_;
                                        if (index + 1 < rest.length && !((_rest_ = rest[index + 1]) === null || _rest_ === void 0 ? void 0 : _rest_.startsWith("--"))) {
                                            flags[flag] = value();
                                        } else {
                                            flags[flag] = true;
                                        }
                                    } else {
                                        positional.push(flag);
                                    }
                            }
                        };
                        for(index = 0; index < rest.length; index += 1){
                            _ret = _loop(index);
                            if (_type_of(_ret) === "object") return [
                                2,
                                _ret.v
                            ];
                        }
                    } catch (error) {
                        if (_instanceof(error, UsageError)) return [
                            2,
                            fail(error.message)
                        ];
                        throw error;
                    }
                    getString = function getString(name) {
                        return typeof flags[name] === "string" ? flags[name] : undefined;
                    };
                    getBool = function getBool(name) {
                        return flags[name] === true;
                    };
                    // ── tui (P4) ────────────────────────────────────────────────────────────
                    if (command === "tui") {
                        return [
                            2,
                            runTui(buildTuiOptions(rest, flags))
                        ];
                    }
                    if (!(command === "chat")) return [
                        3,
                        2
                    ];
                    prompt = getString("--prompt");
                    if (!prompt) {
                        return [
                            2,
                            fail("chat requires --prompt <text>.")
                        ];
                    }
                    options = {
                        prompt: prompt,
                        model: getString("--model"),
                        provider: getString("--provider"),
                        systemPrompt: getString("--system-prompt"),
                        project: getString("--project"),
                        api: getString("--api"),
                        agent: getString("--agent"),
                        quiet: getBool("--quiet")
                    };
                    return [
                        4,
                        runChat(options)
                    ];
                case 1:
                    result = _state.sent();
                    if (result.exitCode === 0 && !options.quiet) {
                        process.stderr.write("\n[openkai] session ".concat(result.sessionId, " done\n"));
                    }
                    return [
                        2,
                        result.exitCode
                    ];
                case 2:
                    // ── sessions ──────────────────────────────────────────────────────────────
                    if (command === "sessions") {
                        options1 = {
                            show: getString("--show")
                        };
                        return [
                            2,
                            runSessions(options1)
                        ];
                    }
                    // ── fuse (P3) ────────────────────────────────────────────────────────────
                    if (command === "fuse") {
                        ;
                        prompt1 = getString("--prompt");
                        if (!prompt1) {
                            return [
                                2,
                                fail("fuse requires --prompt <text>.")
                            ];
                        }
                        options2 = {
                            prompt: prompt1,
                            architectModel: getString("--architect-model"),
                            builderModel: getString("--builder-model"),
                            judgeModel: getString("--judge-model"),
                            provider: getString("--provider"),
                            gate: getBool("--gate"),
                            project: (_getString = getString("--project")) !== null && _getString !== void 0 ? _getString : process.env.CORTEX_PROJECT,
                            api: getString("--api"),
                            agent: getString("--agent"),
                            quiet: getBool("--quiet")
                        };
                        roundsRaw = getString("--max-rounds");
                        if (roundsRaw) {
                            parsed = parseBoundedInt("--max-rounds", roundsRaw, 1, 10);
                            if (typeof parsed === "string") return [
                                2,
                                fail(parsed)
                            ];
                            options2.maxRounds = parsed;
                        }
                        return [
                            2,
                            runFuse(options2)
                        ];
                    }
                    // ── fusion report / advise (P3b) ─────────────────────────────────────────
                    if (command === "fusion") {
                        sub = positional[0];
                        if (sub === "report") {
                            lastRaw = getString("--last");
                            ;
                            if (lastRaw) {
                                parsed1 = parseBoundedInt("--last", lastRaw, 1, 10000);
                                if (typeof parsed1 === "string") return [
                                    2,
                                    fail(parsed1)
                                ];
                                last = parsed1;
                            }
                            return [
                                2,
                                runFusionReport({
                                    last: last
                                })
                            ];
                        }
                        if (sub === "advise") {
                            breadthRaw = getString("--files");
                            ;
                            if (breadthRaw) {
                                parsed2 = parseBoundedInt("--files", breadthRaw, 0, 100000);
                                if (typeof parsed2 === "string") return [
                                    2,
                                    fail(parsed2)
                                ];
                                filesBreadth = parsed2;
                            }
                            return [
                                2,
                                runFusionAdvise({
                                    priority: getString("--priority"),
                                    taskClass: getString("--class"),
                                    filesBreadth: filesBreadth
                                })
                            ];
                        }
                        return [
                            2,
                            fail("fusion requires a subcommand: report | advise.")
                        ];
                    }
                    // ── undo (Inc 05) ────────────────────────────────────────────────────────
                    if (command === "undo") {
                        return [
                            2,
                            runUndo({
                                history: getBool("--history")
                            })
                        ];
                    }
                    // ── info (Inc 08) ────────────────────────────────────────────────────────
                    if (command === "info") {
                        return [
                            2,
                            runInfo({
                                project: getString("--project"),
                                api: getString("--api")
                            })
                        ];
                    }
                    if (!(command === "upgrade")) return [
                        3,
                        4
                    ];
                    options3 = {
                        check: getBool("--check"),
                        rollback: getBool("--rollback"),
                        version: getString("--version"),
                        manifestUrl: getString("--manifest-url")
                    };
                    return [
                        4,
                        runUpgrade(options3)
                    ];
                case 3:
                    result1 = _state.sent();
                    if (result1.exitCode === 0) {
                        process.stdout.write("".concat(result1.message, "\n"));
                    } else {
                        process.stderr.write("".concat(result1.message, "\n"));
                    }
                    return [
                        2,
                        result1.exitCode
                    ];
                case 4:
                    // ── events (P1, unchanged) ─────────────────────────────────────────────────
                    if (command === "events") {
                        if (!getBool("--print")) {
                            return [
                                2,
                                fail("events requires a mode — pass --print.")
                            ];
                        }
                        options4 = {
                            lastId: getString("--last-id"),
                            count: undefined,
                            pingSeconds: undefined,
                            project: getString("--project"),
                            api: getString("--api"),
                            agent: getString("--agent"),
                            keepalive: getBool("--keepalive"),
                            verbose: getBool("--verbose")
                        };
                        countRaw = getString("--count");
                        if (countRaw) {
                            parsed3 = parseBoundedInt("--count", countRaw, 1, 200);
                            if (typeof parsed3 === "string") return [
                                2,
                                fail(parsed3)
                            ];
                            options4.count = parsed3;
                        }
                        pingRaw = getString("--ping");
                        if (pingRaw) {
                            parsed4 = parseBoundedInt("--ping", pingRaw, 1, 60);
                            if (typeof parsed4 === "string") return [
                                2,
                                fail(parsed4)
                            ];
                            options4.pingSeconds = parsed4;
                        }
                        return [
                            2,
                            runEvents(options4)
                        ];
                    }
                    return [
                        2,
                        fail('unknown command "'.concat(command, '".'))
                    ];
            }
        });
    })();
}
/** Build RunTuiOptions from parsed argv (supports both bare-launch and `tui` subcommand). */ function buildTuiOptions(rest, preFlags) {
    var flags = _object_spread({}, preFlags);
    for(var i = 0; i < rest.length; i += 1){
        var _rest_;
        var flag = rest[i];
        if (!(flag === null || flag === void 0 ? void 0 : flag.startsWith("--"))) continue;
        if (i + 1 < rest.length && !((_rest_ = rest[i + 1]) === null || _rest_ === void 0 ? void 0 : _rest_.startsWith("--"))) {
            flags[flag] = rest[i += 1];
        } else {
            flags[flag] = true;
        }
    }
    var getString = function getString(name) {
        return typeof flags[name] === "string" ? flags[name] : undefined;
    };
    var getBool = function getBool(name) {
        return flags[name] === true;
    };
    return {
        model: getString("--model"),
        provider: getString("--provider"),
        session: getString("--session"),
        systemPrompt: getString("--system-prompt"),
        project: getString("--project"),
        api: getString("--api"),
        agent: getString("--agent"),
        quiet: getBool("--quiet")
    };
}
// A pipe closing early (e.g. `| head`) is a clean exit, not a crash.
process.stdout.on("error", function(error) {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
});
process.exitCode = await main(process.argv.slice(2));
