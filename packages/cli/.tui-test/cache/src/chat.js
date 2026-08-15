//# hash=b1e965f980881c393318c74ee17b2471
//# sourceMappingURL=chat.js.map

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
function _instanceof(left, right) {
    "@swc/helpers - instanceof";
    if (right != null && typeof Symbol !== "undefined" && right[Symbol.hasInstance]) {
        return !!right[Symbol.hasInstance](left);
    } else return left instanceof right;
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
 * `openkai chat` — single-prompt print-mode chat (D-P2-6, scope §4).
 *
 * Wires the {@link InProcessTransport} (Agent over OpenRouter) to the local
 * {@link SessionStore} (JSONL v3 tree) and {@link CortexCheckpoint}
 * (debounced `POST /sessions/ingest` + `POST /log` lifecycle). Text deltas
 * stream to stdout; tool calls and usage are logged to stderr; the settled
 * transcript is persisted and checkpointed at turn settlement.
 *
 * Fail-fast contract: if `OPENROUTER_API_KEY` is missing the command exits 1
 * with a named error before any network or file I/O.
 */ import path from "node:path";
import { CortexClient, InProcessTransport, MissingApiKeyError, DEFAULT_MODEL_ID, SessionStore, CortexCheckpoint } from "@openkai/core";
import { providerKeyStatus, resolveProvider } from "./providers.js";
var AGENT_NAME_DEFAULT = "openkai";
/** Run a single-prompt chat turn. */ export function runChat(options) {
    return _async_to_generator(function() {
        var _ref, _options_model, _ref1, _options_project, _ref2, _options_agent, provider, modelId, project, agent, cwd, keyStatus, _keyStatus_needsKey, store, log, cortex, checkpoint, transport, userMsg, promptPromise, assistantText, abort, _iteratorAbruptCompletion, _didIteratorError, _iteratorError, _iterator, _step, _value, event, _, summary, assistantMsg, entries, err, error, ingestResult;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    provider = resolveProvider(options.provider);
                    modelId = (_ref = (_options_model = options.model) !== null && _options_model !== void 0 ? _options_model : process.env.OPENKAI_MODEL) !== null && _ref !== void 0 ? _ref : provider === "openrouter" ? DEFAULT_MODEL_ID : undefined;
                    if (!modelId) {
                        process.stderr.write('ERROR: no default model for provider "'.concat(provider, '" — pass --model <id> (or set OPENKAI_MODEL).\n'));
                        return [
                            2,
                            {
                                exitCode: 2,
                                sessionId: "",
                                modelId: ""
                            }
                        ];
                    }
                    project = (_ref1 = (_options_project = options.project) !== null && _options_project !== void 0 ? _options_project : process.env.CORTEX_PROJECT) !== null && _ref1 !== void 0 ? _ref1 : "openkai";
                    agent = (_ref2 = (_options_agent = options.agent) !== null && _options_agent !== void 0 ? _options_agent : process.env.OPENKAI_AGENT) !== null && _ref2 !== void 0 ? _ref2 : AGENT_NAME_DEFAULT;
                    cwd = process.cwd();
                    // ── 1. Fail fast on missing provider credentials (named error, exit 1) ──
                    keyStatus = providerKeyStatus(provider);
                    if (!keyStatus.configured) {
                        ;
                        process.stderr.write("".concat(provider, " credentials not found: set ").concat((_keyStatus_needsKey = keyStatus.needsKey) !== null && _keyStatus_needsKey !== void 0 ? _keyStatus_needsKey : "the provider credentials", " or export them in your environment.\n"));
                        return [
                            2,
                            {
                                exitCode: 1,
                                sessionId: "",
                                modelId: modelId
                            }
                        ];
                    }
                    // ── 2. Local session store (JSONL v3 tree under .openkai/sessions/) ─────
                    store = new SessionStore();
                    return [
                        4,
                        store.ensure()
                    ];
                case 1:
                    _state.sent();
                    log = function log(msg) {
                        if (!options.quiet) process.stderr.write("[openkai] ".concat(msg, "\n"));
                    };
                    // ── 3. Cortex checkpoint + lifecycle events ────────────────────────────
                    cortex = new CortexClient({
                        baseUrl: options.api,
                        project: project,
                        agent: agent
                    });
                    checkpoint = new CortexCheckpoint({
                        client: cortex,
                        agent: agent,
                        sessionId: store.sessionId,
                        sourcePath: path.resolve(store.filePath),
                        provider: provider,
                        modelId: modelId,
                        cwd: cwd,
                        task: options.prompt.slice(0, 200)
                    });
                    try {
                        transport = new InProcessTransport({
                            sessionId: store.sessionId,
                            modelId: modelId,
                            provider: provider,
                            systemPrompt: options.systemPrompt,
                            cwd: cwd
                        });
                    } catch (error) {
                        if (_instanceof(error, MissingApiKeyError)) {
                            process.stderr.write("".concat(error.message, "\n"));
                            return [
                                2,
                                {
                                    exitCode: 1,
                                    sessionId: store.sessionId,
                                    modelId: modelId
                                }
                            ];
                        }
                        throw error;
                    }
                    // ── 5. Emit the `started` lifecycle event ──────────────────────────────
                    return [
                        4,
                        checkpoint.logLifecycle("started", "openkai chat started (model=".concat(modelId, ", session=").concat(store.sessionId.slice(0, 8), ")"))
                    ];
                case 2:
                    _state.sent();
                    log("session ".concat(store.sessionId, " | model ").concat(modelId));
                    // ── 6. Persist the user prompt, then fire the agent turn ──────────────
                    userMsg = {
                        role: "user",
                        content: options.prompt,
                        timestamp: Date.now()
                    };
                    return [
                        4,
                        store.appendMessage(userMsg)
                    ];
                case 3:
                    _state.sent();
                    // Start the agent turn (fire-and-track — events flow via subscribe).
                    promptPromise = transport.prompt(options.prompt);
                    // ── 7. Consume the event stream concurrently with the agent run ────────
                    assistantText = "";
                    abort = new AbortController();
                    process.on("SIGINT", function() {
                        return abort.abort();
                    });
                    process.on("SIGTERM", function() {
                        return abort.abort();
                    });
                    _state.label = 4;
                case 4:
                    _state.trys.push([
                        4,
                        27,
                        ,
                        28
                    ]);
                    _iteratorAbruptCompletion = false, _didIteratorError = false;
                    _state.label = 5;
                case 5:
                    _state.trys.push([
                        5,
                        20,
                        21,
                        26
                    ]);
                    _iterator = _async_iterator(transport.events());
                    _state.label = 6;
                case 6:
                    return [
                        4,
                        _iterator.next()
                    ];
                case 7:
                    if (!(_iteratorAbruptCompletion = !(_step = _state.sent()).done)) return [
                        3,
                        19
                    ];
                    _value = _step.value;
                    event = _value;
                    _ = event.kind;
                    switch(_){
                        case "delta":
                            return [
                                3,
                                8
                            ];
                        case "tool_call":
                            return [
                                3,
                                9
                            ];
                        case "tool_result":
                            return [
                                3,
                                10
                            ];
                        case "turn_end":
                            return [
                                3,
                                11
                            ];
                        case "session_end":
                            return [
                                3,
                                15
                            ];
                        case "error":
                            return [
                                3,
                                16
                            ];
                    }
                    return [
                        3,
                        17
                    ];
                case 8:
                    if (event.field === "text") {
                        assistantText += event.delta;
                        process.stdout.write(event.delta);
                    }
                    return [
                        3,
                        18
                    ];
                case 9:
                    log("tool_call: ".concat(event.toolName));
                    return [
                        3,
                        18
                    ];
                case 10:
                    {
                        summary = typeof event.result === "string" ? event.result.slice(0, 120) : JSON.stringify(event.result).slice(0, 120);
                        log("tool_result: ".concat(event.toolName, " → ").concat(event.isError ? "error" : "ok", " ").concat(summary));
                        return [
                            3,
                            18
                        ];
                    }
                    _state.label = 11;
                case 11:
                    if (!(assistantText.length > 0)) return [
                        3,
                        13
                    ];
                    assistantMsg = {
                        role: "assistant",
                        content: [
                            {
                                type: "text",
                                text: assistantText
                            }
                        ],
                        timestamp: Date.now()
                    };
                    return [
                        4,
                        store.appendMessage(assistantMsg)
                    ];
                case 12:
                    _state.sent();
                    assistantText = "";
                    _state.label = 13;
                case 13:
                    return [
                        4,
                        store.readEntries()
                    ];
                case 14:
                    entries = _state.sent();
                    checkpoint.record(entries);
                    return [
                        3,
                        18
                    ];
                case 15:
                    return [
                        3,
                        18
                    ];
                case 16:
                    log("error: ".concat(event.message));
                    return [
                        3,
                        18
                    ];
                case 17:
                    return [
                        3,
                        18
                    ];
                case 18:
                    _iteratorAbruptCompletion = false;
                    return [
                        3,
                        6
                    ];
                case 19:
                    return [
                        3,
                        26
                    ];
                case 20:
                    err = _state.sent();
                    _didIteratorError = true;
                    _iteratorError = err;
                    return [
                        3,
                        26
                    ];
                case 21:
                    _state.trys.push([
                        21,
                        ,
                        24,
                        25
                    ]);
                    if (!(_iteratorAbruptCompletion && _iterator.return != null)) return [
                        3,
                        23
                    ];
                    return [
                        4,
                        _iterator.return()
                    ];
                case 22:
                    _state.sent();
                    _state.label = 23;
                case 23:
                    return [
                        3,
                        25
                    ];
                case 24:
                    if (_didIteratorError) {
                        throw _iteratorError;
                    }
                    return [
                        7
                    ];
                case 25:
                    return [
                        7
                    ];
                case 26:
                    return [
                        3,
                        28
                    ];
                case 27:
                    error = _state.sent();
                    log("run failed: ".concat(_instanceof(error, Error) ? error.message : String(error)));
                    return [
                        3,
                        28
                    ];
                case 28:
                    // Ensure the prompt promise settled (it should have resolved by now).
                    return [
                        4,
                        promptPromise.catch(function() {
                            return undefined;
                        })
                    ];
                case 29:
                    _state.sent();
                    return [
                        4,
                        checkpoint.flushNow()
                    ];
                case 30:
                    ingestResult = _state.sent();
                    return [
                        4,
                        checkpoint.logLifecycle("stopped", "openkai chat stopped (session=".concat(store.sessionId.slice(0, 8), ")"))
                    ];
                case 31:
                    _state.sent();
                    return [
                        4,
                        transport.close()
                    ];
                case 32:
                    _state.sent();
                    if (ingestResult) {
                        log("ingested: ".concat(JSON.stringify(ingestResult)));
                    }
                    return [
                        2,
                        {
                            exitCode: 0,
                            sessionId: store.sessionId,
                            modelId: modelId,
                            ingestResult: ingestResult !== null && ingestResult !== void 0 ? ingestResult : undefined
                        }
                    ];
            }
        });
    })();
}
