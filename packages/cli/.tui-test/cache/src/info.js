//# hash=90d5fe2e2ee22561ca851aae61161fe0
//# sourceMappingURL=info.js.map

function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_with_holes(arr) {
    if (Array.isArray(arr)) return arr;
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
function _iterable_to_array_limit(arr, i) {
    var _i = arr == null ? null : typeof Symbol !== "undefined" && arr[Symbol.iterator] || arr["@@iterator"];
    if (_i == null) return;
    var _arr = [];
    var _n = true;
    var _d = false;
    var _s, _e;
    try {
        for(_i = _i.call(arr); !(_n = (_s = _i.next()).done); _n = true){
            _arr.push(_s.value);
            if (i && _arr.length === i) break;
        }
    } catch (err) {
        _d = true;
        _e = err;
    } finally{
        try {
            if (!_n && _i["return"] != null) _i["return"]();
        } finally{
            if (_d) throw _e;
        }
    }
    return _arr;
}
function _non_iterable_rest() {
    throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function _sliced_to_array(arr, i) {
    return _array_with_holes(arr) || _iterable_to_array_limit(arr, i) || _unsupported_iterable_to_array(arr, i) || _non_iterable_rest();
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
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
/**
 * openkai info — self-check (ADR OK-8 / Inc 08): version, run mode, Cortex
 * reachability, model catalogue, local state. Always exits 0; problems are
 * reported in the output, not as exit codes (this is a diagnostic).
 */ import { promises as fs } from "node:fs";
import path from "node:path";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { CortexClient, defaultFusionLogPath, readFusionRuns } from "@openkai/core";
import { BUILD_CHANNEL, KILL_SWITCH_ENV, detectTarget, resolveAutoUpdateEnabled, resolveChannel } from "./upgrade.js";
import { CLI_VERSION } from "./version.js";
import { PROVIDERS, providerKeyStatus, resolveProvider } from "./providers.js";
var countDirs = function countDirs(dir) {
    return _async_to_generator(function() {
        var unused;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        2,
                        ,
                        3
                    ]);
                    return [
                        4,
                        fs.readdir(dir, {
                            withFileTypes: true
                        })
                    ];
                case 1:
                    return [
                        2,
                        _state.sent().filter(function(e) {
                            return e.isDirectory();
                        }).length
                    ];
                case 2:
                    unused = _state.sent();
                    return [
                        2,
                        0
                    ];
                case 3:
                    return [
                        2
                    ];
            }
        });
    })();
};
var readVersion = function readVersion() {
    return _async_to_generator(function() {
        var _pkg_version, pkg, _, unused;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    _state.trys.push([
                        0,
                        2,
                        ,
                        3
                    ]);
                    _ = JSON.parse;
                    return [
                        4,
                        fs.readFile(new URL("../package.json", import.meta.url), "utf-8")
                    ];
                case 1:
                    pkg = _.apply(JSON, [
                        _state.sent()
                    ]);
                    return [
                        2,
                        (_pkg_version = pkg.version) !== null && _pkg_version !== void 0 ? _pkg_version : CLI_VERSION
                    ];
                case 2:
                    unused = _state.sent();
                    // Standalone binary: package.json is not inside bun's virtual fs.
                    return [
                        2,
                        CLI_VERSION
                    ];
                case 3:
                    return [
                        2
                    ];
            }
        });
    })();
};
export function runInfo(options) {
    return _async_to_generator(function() {
        var _options_project, version, project, lines, client, _health_version, _health_event_backend, health, error, catalogue, openrouterCount, activeProvider, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, _step_value, id, info, status, mark, active, detail, sessions, runs, shadow, channel, autoUpdate;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        readVersion()
                    ];
                case 1:
                    version = _state.sent();
                    project = (_options_project = options.project) !== null && _options_project !== void 0 ? _options_project : process.env.CORTEX_PROJECT;
                    lines = [];
                    lines.push("openkai ".concat(version));
                    lines.push("node ".concat(process.version, " \xb7 ").concat(process.platform, "/").concat(process.arch));
                    lines.push("");
                    if (!!project) return [
                        3,
                        2
                    ];
                    lines.push("mode: standalone-local (no CORTEX_PROJECT — local persistence only)");
                    return [
                        3,
                        6
                    ];
                case 2:
                    client = new CortexClient({
                        baseUrl: options.api,
                        project: project
                    });
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
                        client.health()
                    ];
                case 4:
                    health = _state.sent();
                    lines.push("mode: KOS-managed (project ".concat(project, ") — cortex-api ").concat((_health_version = health.version) !== null && _health_version !== void 0 ? _health_version : "?", " healthy, event backend ").concat((_health_event_backend = health.event_backend) !== null && _health_event_backend !== void 0 ? _health_event_backend : "?"));
                    return [
                        3,
                        6
                    ];
                case 5:
                    error = _state.sent();
                    lines.push("mode: degraded — CORTEX_PROJECT=".concat(project, " but API unreachable (").concat(_instanceof(error, Error) ? error.message : String(error), "); local persistence only"));
                    return [
                        3,
                        6
                    ];
                case 6:
                    // Provider catalogue (offline, bundled) + configuration matrix.
                    try {
                        catalogue = builtinModels();
                        openrouterCount = catalogue.getModels("openrouter").length;
                        lines.push("model catalogue: ".concat(openrouterCount, " OpenRouter models bundled"));
                    } catch (unused) {
                        lines.push("model catalogue: unavailable");
                    }
                    lines.push("");
                    lines.push("providers:");
                    activeProvider = resolveProvider();
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        for(_iterator = Object.entries(PROVIDERS)[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            _step_value = _sliced_to_array(_step.value, 2), id = _step_value[0], info = _step_value[1];
                            status = providerKeyStatus(id);
                            mark = status.configured ? "✓" : "·";
                            active = id === activeProvider ? " (active)" : "";
                            detail = status.oauth === true ? "OAuth lane — no env key needed (login flow at first use)" : status.configured ? "via ".concat(status.via) : "set ".concat(status.needsKey);
                            lines.push("  ".concat(mark, " ").concat(id).concat(active, " — ").concat(detail));
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
                        4,
                        countDirs(path.join(process.cwd(), ".openkai", "sessions"))
                    ];
                case 7:
                    sessions = _state.sent();
                    return [
                        4,
                        readFusionRuns(defaultFusionLogPath())
                    ];
                case 8:
                    runs = _state.sent();
                    return [
                        4,
                        fs.stat(path.join(process.cwd(), ".openkai", "shadow.git", "HEAD")).then(function() {
                            return "present";
                        }).catch(function() {
                            return "none";
                        })
                    ];
                case 9:
                    shadow = _state.sent();
                    lines.push("");
                    lines.push("local state (".concat(process.cwd(), "):"));
                    lines.push("  sessions: ".concat(sessions));
                    lines.push("  fusion runs: ".concat(runs.length));
                    lines.push("  shadow-git: ".concat(shadow));
                    // Upgrade channel (ADR OK-8 dual-channel, Inc 08) — offline, no manifest
                    // fetch: channel + kill-switch + current version. `openkai upgrade --check`
                    // is the live availability probe.
                    channel = resolveChannel({
                        buildChannel: BUILD_CHANNEL,
                        envChannel: process.env.OPENKAI_CHANNEL
                    });
                    autoUpdate = resolveAutoUpdateEnabled(process.env[KILL_SWITCH_ENV]);
                    lines.push("");
                    lines.push("upgrade:");
                    if (channel === "npm") {
                        lines.push("  channel: npm (pinned at build time, never self-mutates)");
                    } else {
                        lines.push("  channel: standalone");
                        lines.push("  auto-update: ".concat(autoUpdate ? "enabled" : "disabled (".concat(KILL_SWITCH_ENV, "=false)")));
                        lines.push("  target: ".concat(detectTarget()));
                    }
                    lines.push("  current: ".concat(version));
                    lines.push("  check availability: openkai upgrade --check");
                    process.stdout.write("".concat(lines.join("\n"), "\n"));
                    return [
                        2,
                        0
                    ];
            }
        });
    })();
}
