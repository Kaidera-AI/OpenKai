//# hash=5772d80847f86fb5955f604565404de2
//# sourceMappingURL=fusion.js.map

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
 * openkai fusion report / fusion advise — the FU-5 readout and the FU-4
 * policy surface.
 */ import { defaultFusionLogPath, readFusionRuns, shouldFuse, summariseFusionRuns } from "@openkai/core";
var fmtMs = function fmtMs(ms) {
    return ms >= 1000 ? "".concat((ms / 1000).toFixed(1), "s") : "".concat(ms, "ms");
};
/** `openkai fusion report` — per-model-pair A/B stats from the runs log. */ export function runFusionReport(options) {
    return _async_to_generator(function() {
        var logPath, all, records, stats, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, s, gate, latest;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    logPath = defaultFusionLogPath();
                    return [
                        4,
                        readFusionRuns(logPath)
                    ];
                case 1:
                    all = _state.sent();
                    if (all.length === 0) {
                        process.stdout.write("no fusion runs recorded (".concat(logPath, ")\n"));
                        return [
                            2,
                            0
                        ];
                    }
                    records = options.last ? all.slice(-options.last) : all;
                    stats = summariseFusionRuns(records);
                    process.stdout.write("fusion report — ".concat(records.length, " run(s) from ").concat(logPath, "\n\n"));
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        for(_iterator = stats[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            s = _step.value;
                            gate = s.gatePassRate === undefined ? "gate: n/a" : "gate pass: ".concat(Math.round(s.gatePassRate * 100), "%");
                            process.stdout.write("".concat(s.pair, "\n  runs ").concat(s.runs, " \xb7 ").concat(gate, " \xb7 avg wall ").concat(fmtMs(s.avgWallMs), " \xb7 ") + "avg role latency ".concat(fmtMs(s.avgRoleLatencyMs), " \xb7 ").concat(s.totalTokens, " tokens\n"));
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
                    latest = records[records.length - 1];
                    if (latest) {
                        process.stdout.write("\nlatest run ".concat(latest.runId, " (").concat(latest.ts, ")\n  task: ").concat(latest.task.slice(0, 120), "\n  gate: ").concat(latest.gate.outcome, "\n"));
                    }
                    return [
                        2,
                        0
                    ];
            }
        });
    })();
}
var PRIORITIES = [
    "low",
    "medium",
    "high",
    "urgent"
];
var CLASSES = [
    "architecture",
    "ambiguous",
    "high-blast-radius",
    "routine"
];
/** `openkai fusion advise` — evaluate the FU-4 policy for a task shape. */ export function runFusionAdvise(options) {
    if (options.priority && !PRIORITIES.includes(options.priority)) {
        process.stderr.write("ERROR: --priority must be one of ".concat(PRIORITIES.join("|"), "\n"));
        return 2;
    }
    if (options.taskClass && !CLASSES.includes(options.taskClass)) {
        process.stderr.write("ERROR: --class must be one of ".concat(CLASSES.join("|"), "\n"));
        return 2;
    }
    var input = {
        priority: options.priority,
        taskClass: options.taskClass,
        filesBreadth: options.filesBreadth
    };
    var decision = shouldFuse(input);
    process.stdout.write("".concat(decision.fuse ? "FUSE" : "SINGLE-MODEL", " — ").concat(decision.reason, "\n"));
    return 0;
}
