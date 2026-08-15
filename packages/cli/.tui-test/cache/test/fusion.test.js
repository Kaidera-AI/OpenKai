//# hash=75b04e89ca97a292f5abef7ffc16d57e
//# sourceMappingURL=fusion.test.js.map

function _array_like_to_array(arr, len) {
    if (len == null || len > arr.length) len = arr.length;
    for(var i = 0, arr2 = new Array(len); i < len; i++)arr2[i] = arr[i];
    return arr2;
}
function _array_without_holes(arr) {
    if (Array.isArray(arr)) return _array_like_to_array(arr);
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
function _iterable_to_array(iter) {
    if (typeof Symbol !== "undefined" && iter[Symbol.iterator] != null || iter["@@iterator"] != null) {
        return Array.from(iter);
    }
}
function _non_iterable_spread() {
    throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
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
function _unsupported_iterable_to_array(o, minLen) {
    if (!o) return;
    if (typeof o === "string") return _array_like_to_array(o, minLen);
    var n = Object.prototype.toString.call(o).slice(8, -1);
    if (n === "Object" && o.constructor) n = o.constructor.name;
    if (n === "Map" || n === "Set") return Array.from(n);
    if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _array_like_to_array(o, minLen);
}
/**
 * P3 fusion core tests (scope §4). Deterministic + offline: every model call
 * is a scripted faux-provider response; gate checks are safe shell one-liners
 * (`true`, `false`, `test -f`) run inside a `node:fs.mkdtemp` temp dir.
 */ import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createModels } from "@earendil-works/pi-ai";
import { fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai/providers/faux";
import { AttributionError, FusionBandit, GateHaltError, WeakGateError, fuse, readFusionRuns, recordFusionRun, runGatedFusion, runPanel, runSynthesis, shouldFuse, summariseFusionRuns } from "@openkai/core";
/** A faux provider + model + streamFn, scripted by system-prompt routing. */ function makeRig(route) {
    var faux = fauxProvider({});
    // Each stream call shifts one queued step — queue a bounded run of the
    // same routing factory so every call in the run is served.
    var factory = function factory(context, _options, state) {
        var _context_systemPrompt;
        var text = route((_context_systemPrompt = context.systemPrompt) !== null && _context_systemPrompt !== void 0 ? _context_systemPrompt : "", state.callCount);
        return fauxAssistantMessage([
            fauxText(text)
        ]);
    };
    faux.setResponses(Array.from({
        length: 16
    }, function() {
        return factory;
    }));
    var models = createModels();
    models.setProvider(faux.provider);
    var model = models.getModel("faux", "faux-1");
    assert.ok(model, "faux-1 registered");
    var streamFn = function streamFn(m, ctx, opts) {
        return models.streamSimple(m, ctx, opts);
    };
    return {
        streamFn: streamFn,
        model: model,
        faux: faux
    };
}
var SYNTHESIS_JSON = JSON.stringify({
    consensus: [
        "both agree on the shape"
    ],
    divergences: [
        {
            topic: "error style",
            architect: "structured codes",
            builder: "plain messages",
            kept: "architect"
        }
    ],
    discarded: [
        {
            item: "global mutable state",
            reason: "untestable",
            by: "builder"
        }
    ],
    blindSpots: [
        "no retry budget"
    ]
});
test("panel: architect and builder run as separate sessions, role-attributed", function() {
    return _async_to_generator(function() {
        var rig, outputs, architect, builder;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    rig = makeRig(function(system) {
                        return system.includes("ARCHITECT") ? "architect plan" : "builder deliverable";
                    });
                    return [
                        4,
                        runPanel(rig.streamFn, {
                            task: "design a thing",
                            architectModel: rig.model,
                            builderModel: rig.model
                        })
                    ];
                case 1:
                    outputs = _state.sent();
                    assert.equal(outputs.length, 2);
                    architect = outputs.find(function(o) {
                        return o.role === "architect";
                    });
                    builder = outputs.find(function(o) {
                        return o.role === "builder";
                    });
                    assert.equal(architect === null || architect === void 0 ? void 0 : architect.text, "architect plan");
                    assert.equal(builder === null || builder === void 0 ? void 0 : builder.text, "builder deliverable");
                    assert.ok(architect && builder && architect.latencyMs >= 0 && builder.latencyMs >= 0);
                    return [
                        2
                    ];
            }
        });
    })();
});
test("synthesis: parses the structured merge with attribution intact", function() {
    return _async_to_generator(function() {
        var _synthesis_divergences_, _synthesis_discarded_, rig, synthesis;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    rig = makeRig(function() {
                        return SYNTHESIS_JSON;
                    });
                    return [
                        4,
                        runSynthesis(rig.streamFn, rig.model, "task", [
                            {
                                role: "architect",
                                modelId: "faux-1",
                                text: "A",
                                usage: undefined,
                                latencyMs: 1
                            },
                            {
                                role: "builder",
                                modelId: "faux-1",
                                text: "B",
                                usage: undefined,
                                latencyMs: 1
                            }
                        ])
                    ];
                case 1:
                    synthesis = _state.sent();
                    assert.deepEqual(synthesis.consensus, [
                        "both agree on the shape"
                    ]);
                    assert.equal((_synthesis_divergences_ = synthesis.divergences[0]) === null || _synthesis_divergences_ === void 0 ? void 0 : _synthesis_divergences_.kept, "architect");
                    assert.equal((_synthesis_discarded_ = synthesis.discarded[0]) === null || _synthesis_discarded_ === void 0 ? void 0 : _synthesis_discarded_.by, "builder");
                    assert.deepEqual(synthesis.blindSpots, [
                        "no retry budget"
                    ]);
                    return [
                        2
                    ];
            }
        });
    })();
});
test("synthesis: unattributed divergence throws AttributionError", function() {
    return _async_to_generator(function() {
        var bad, rig;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    bad = JSON.stringify({
                        consensus: [],
                        divergences: [
                            {
                                topic: "x",
                                architect: "",
                                builder: "",
                                kept: "both"
                            }
                        ],
                        discarded: [],
                        blindSpots: []
                    });
                    rig = makeRig(function() {
                        return bad;
                    });
                    return [
                        4,
                        assert.rejects(runSynthesis(rig.streamFn, rig.model, "task", [
                            {
                                role: "architect",
                                modelId: "faux-1",
                                text: "A",
                                usage: undefined,
                                latencyMs: 1
                            },
                            {
                                role: "builder",
                                modelId: "faux-1",
                                text: "B",
                                usage: undefined,
                                latencyMs: 1
                            }
                        ]), function(error) {
                            return _instanceof(error, AttributionError);
                        })
                    ];
                case 1:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
test("gate: all-green baseline throws WeakGateError carrying the baseline run", function() {
    return _async_to_generator(function() {
        var cwd;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-fusion-"))
                    ];
                case 1:
                    cwd = _state.sent();
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
                        assert.rejects(runGatedFusion({
                            checks: [
                                {
                                    name: "trivially green",
                                    command: "true"
                                }
                            ],
                            cwd: cwd,
                            initialWork: "work",
                            repairWork: function repairWork() {
                                return _async_to_generator(function() {
                                    return _ts_generator(this, function(_state) {
                                        return [
                                            2,
                                            "work"
                                        ];
                                    });
                                })();
                            }
                        }), function(error) {
                            var _error_runs_;
                            return _instanceof(error, WeakGateError) && error.runs.length === 1 && ((_error_runs_ = error.runs[0]) === null || _error_runs_ === void 0 ? void 0 : _error_runs_.purpose) === "baseline" && error.runs[0].pass;
                        })
                    ];
                case 3:
                    _state.sent();
                    return [
                        3,
                        6
                    ];
                case 4:
                    return [
                        4,
                        rm(cwd, {
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
test("gate: full repair loop passes once applyWork materialises the work", function() {
    return _async_to_generator(function() {
        var cwd, marker, _runs_, _runs_1, _runs_2, _runs_3, _ref, runs, finalWork;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-fusion-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    marker = path.join(cwd, "marker.txt");
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
                        runGatedFusion({
                            checks: [
                                {
                                    name: "marker exists",
                                    command: 'test -f "'.concat(marker, '"')
                                }
                            ],
                            cwd: cwd,
                            initialWork: "the deliverable",
                            applyWork: function applyWork() {
                                void writeFile(marker, "done");
                            },
                            repairWork: function repairWork() {
                                return _async_to_generator(function() {
                                    return _ts_generator(this, function(_state) {
                                        return [
                                            2,
                                            "repaired"
                                        ];
                                    });
                                })();
                            }
                        })
                    ];
                case 3:
                    _ref = _state.sent(), runs = _ref.runs, finalWork = _ref.finalWork;
                    assert.equal(finalWork, "the deliverable");
                    assert.equal(runs.length, 2);
                    assert.equal((_runs_ = runs[0]) === null || _runs_ === void 0 ? void 0 : _runs_.purpose, "baseline");
                    assert.equal((_runs_1 = runs[0]) === null || _runs_1 === void 0 ? void 0 : _runs_1.pass, false);
                    assert.equal((_runs_2 = runs[1]) === null || _runs_2 === void 0 ? void 0 : _runs_2.purpose, "evaluation");
                    assert.equal((_runs_3 = runs[1]) === null || _runs_3 === void 0 ? void 0 : _runs_3.pass, true);
                    return [
                        3,
                        6
                    ];
                case 4:
                    return [
                        4,
                        rm(cwd, {
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
test("gate: cap reached halts loudly with verbatim failures and full run history", function() {
    return _async_to_generator(function() {
        var cwd, repairs;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-fusion-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        4,
                        6
                    ]);
                    repairs = 0;
                    return [
                        4,
                        assert.rejects(runGatedFusion({
                            checks: [
                                {
                                    name: "never green",
                                    command: "false"
                                }
                            ],
                            cwd: cwd,
                            maxRounds: 2,
                            initialWork: "v1",
                            applyWork: function applyWork() {
                                return undefined;
                            },
                            repairWork: function repairWork(failures) {
                                return _async_to_generator(function() {
                                    return _ts_generator(this, function(_state) {
                                        repairs += 1;
                                        assert.match(failures, /FAIL never green/);
                                        return [
                                            2,
                                            "v".concat(repairs + 1)
                                        ];
                                    });
                                })();
                            }
                        }), function(error) {
                            assert.ok(_instanceof(error, GateHaltError));
                            // 1 baseline + 2 evaluations; repair ran exactly once (rounds - 1).
                            assert.equal(error.runs.length, 3);
                            assert.equal(repairs, 1);
                            assert.match(error.message, /escalating to triage/);
                            return true;
                        })
                    ];
                case 3:
                    _state.sent();
                    return [
                        3,
                        6
                    ];
                case 4:
                    return [
                        4,
                        rm(cwd, {
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
test("fuse (ungated): panel + synthesis + telemetry record in one call", function() {
    return _async_to_generator(function() {
        var rig, result;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    rig = makeRig(function(system) {
                        // Order matters: the synthesis prompt mentions both role names.
                        if (system.includes("SYNTHESISER")) return SYNTHESIS_JSON;
                        if (system.includes("ARCHITECT role")) return "architect position";
                        return "builder position";
                    });
                    return [
                        4,
                        fuse(rig.streamFn, {
                            task: "fused task",
                            architectModel: rig.model,
                            builderModel: rig.model
                        })
                    ];
                case 1:
                    result = _state.sent();
                    assert.equal(result.outputs.length, 2);
                    assert.equal(result.synthesis.divergences.length, 1);
                    assert.equal(result.gate.outcome, "not-run");
                    assert.equal(result.record.task, "fused task");
                    assert.equal(result.record.gated, false);
                    assert.ok(result.runId.length > 0);
                    return [
                        2
                    ];
            }
        });
    })();
});
test("telemetry: record + read round-trips through the runs log", function() {
    return _async_to_generator(function() {
        var cwd, logPath, record, _runs_, runs;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        mkdtemp(path.join(tmpdir(), "openkai-fusion-"))
                    ];
                case 1:
                    cwd = _state.sent();
                    logPath = path.join(cwd, "runs.jsonl");
                    record = {
                        runId: "test-run-1",
                        ts: new Date().toISOString(),
                        task: "t",
                        gated: false,
                        roles: [],
                        synthesis: undefined,
                        gate: {
                            rounds: 0,
                            outcome: "not-run"
                        },
                        wallMs: 1
                    };
                    _state.label = 2;
                case 2:
                    _state.trys.push([
                        2,
                        ,
                        5,
                        7
                    ]);
                    return [
                        4,
                        recordFusionRun(record, logPath)
                    ];
                case 3:
                    _state.sent();
                    return [
                        4,
                        readFusionRuns(logPath)
                    ];
                case 4:
                    runs = _state.sent();
                    assert.equal(runs.length, 1);
                    assert.equal((_runs_ = runs[0]) === null || _runs_ === void 0 ? void 0 : _runs_.runId, "test-run-1");
                    return [
                        3,
                        7
                    ];
                case 5:
                    return [
                        4,
                        rm(cwd, {
                            recursive: true,
                            force: true
                        })
                    ];
                case 6:
                    _state.sent();
                    return [
                        7
                    ];
                case 7:
                    return [
                        2
                    ];
            }
        });
    })();
});
// ── P3b: FU-4 policy + FU-5 aggregation ────────────────────────────────────
test("policy: explicit force wins over every other rule", function() {
    var decision = shouldFuse({
        force: true,
        priority: "low",
        taskClass: "routine"
    });
    assert.equal(decision.fuse, true);
    assert.match(decision.reason, /explicit/);
});
test("policy: urgent priority fuses without any other signal", function() {
    var decision = shouldFuse({
        priority: "urgent"
    });
    assert.equal(decision.fuse, true);
    assert.match(decision.reason, /urgent/);
});
test("policy: high-priority architecture fuses; medium-priority does not", function() {
    assert.equal(shouldFuse({
        priority: "high",
        taskClass: "architecture"
    }).fuse, true);
    assert.equal(shouldFuse({
        priority: "medium",
        taskClass: "architecture"
    }).fuse, false);
});
test("policy: routine work never fuses on class, breadth triggers at threshold", function() {
    assert.equal(shouldFuse({
        priority: "high",
        taskClass: "routine"
    }).fuse, false);
    assert.equal(shouldFuse({
        filesBreadth: 9
    }).fuse, false);
    var at = shouldFuse({
        filesBreadth: 10
    });
    assert.equal(at.fuse, true);
    assert.match(at.reason, /blast radius/);
});
test("policy: bare invocation takes the cheap single-model default", function() {
    var decision = shouldFuse({});
    assert.equal(decision.fuse, false);
    assert.match(decision.reason, /single-model/);
});
test("report: summariseFusionRuns aggregates per pair with gate rate and tokens", function() {
    return _async_to_generator(function() {
        var _ref, role, run, stats, s;
        return _ts_generator(this, function(_state) {
            role = function role(r, modelId, totalTokens) {
                return {
                    role: r,
                    modelId: modelId,
                    text: "",
                    usage: {
                        input: 0,
                        output: 0,
                        cacheRead: 0,
                        cacheWrite: 0,
                        cost: {
                            input: 0,
                            output: 0,
                            cacheRead: 0,
                            cacheWrite: 0,
                            total: 0
                        },
                        totalTokens: totalTokens
                    },
                    latencyMs: 100
                };
            };
            run = function run(runId, outcome) {
                return {
                    runId: runId,
                    ts: new Date().toISOString(),
                    task: "t",
                    gated: true,
                    roles: [
                        role("architect", "m-a", 10),
                        role("builder", "m-b", 20)
                    ],
                    synthesis: {
                        modelId: "m-a",
                        usage: undefined
                    },
                    gate: {
                        rounds: 1,
                        outcome: outcome
                    },
                    wallMs: 1000
                };
            };
            stats = summariseFusionRuns([
                run("r1", "pass"),
                run("r2", "halt")
            ]);
            assert.equal(stats.length, 1);
            s = stats[0];
            assert.equal(s === null || s === void 0 ? void 0 : s.runs, 2);
            assert.equal(s === null || s === void 0 ? void 0 : s.gatePassRate, 0.5);
            assert.equal(s === null || s === void 0 ? void 0 : s.totalTokens, 60);
            assert.equal(s === null || s === void 0 ? void 0 : s.avgWallMs, 1000);
            assert.match((_ref = s === null || s === void 0 ? void 0 : s.pair) !== null && _ref !== void 0 ? _ref : "", /architect:m-a/);
            return [
                2
            ];
        });
    })();
});
// ── Inc 07 partial: Beta-bandit routing (per-complexity priors) ────────────
var banditRun = function banditRun(runId, modelId, outcome) {
    return {
        runId: runId,
        ts: new Date().toISOString(),
        task: "t",
        gated: true,
        roles: [
            {
                role: "architect",
                modelId: modelId,
                text: "",
                usage: undefined,
                latencyMs: 1
            }
        ],
        synthesis: undefined,
        gate: {
            rounds: 1,
            outcome: outcome
        },
        wallMs: 1
    };
};
test("bandit: per-bucket evidence beats a globally-better model in its weak bucket", function() {
    var _ref;
    // model-strong wins high-complexity 8/8; model-weak loses high 1/7 but
    // dominates low 8/8. In the high bucket the bandit must route strong.
    var records = _to_consumable_array(Array.from({
        length: 8
    }, function(_, i) {
        return banditRun("s-high-".concat(i), "model-strong", "pass");
    })).concat(_to_consumable_array(Array.from({
        length: 7
    }, function(_, i) {
        return banditRun("w-high-".concat(i), "model-weak", "halt");
    })), [
        banditRun("w-high-p", "model-weak", "pass")
    ], _to_consumable_array(Array.from({
        length: 8
    }, function(_, i) {
        return banditRun("w-low-".concat(i), "model-weak", "pass");
    })));
    var bandit = new FusionBandit(42);
    bandit.update(records, function(r) {
        return r.runId.includes("high") ? "high" : "low";
    });
    var high = bandit.recommend("high", [
        "model-strong",
        "model-weak"
    ]);
    assert.equal(high === null || high === void 0 ? void 0 : high.modelId, "model-strong");
    assert.match((_ref = high === null || high === void 0 ? void 0 : high.reason) !== null && _ref !== void 0 ? _ref : "", /bucket evidence 8 pass/);
});
test("bandit: failures in one bucket do not suppress a model globally", function() {
    var _ref;
    // model-x fails low constantly but is undefeated in high.
    var records = _to_consumable_array(Array.from({
        length: 6
    }, function(_, i) {
        return banditRun("x-low-".concat(i), "model-x", "halt");
    })).concat(_to_consumable_array(Array.from({
        length: 6
    }, function(_, i) {
        return banditRun("x-high-".concat(i), "model-x", "pass");
    })));
    var bandit = new FusionBandit(7);
    bandit.update(records, function(r) {
        return r.runId.includes("high") ? "high" : "low";
    });
    var high = bandit.recommend("high", [
        "model-x"
    ]);
    assert.match((_ref = high === null || high === void 0 ? void 0 : high.reason) !== null && _ref !== void 0 ? _ref : "", /bucket evidence 6 pass \/ 0 fail/);
});
test("bandit: unseen bucket starts from the global posterior, not zero", function() {
    var _ref;
    var records = Array.from({
        length: 5
    }, function(_, i) {
        return banditRun("m-".concat(i), "model-y", "pass");
    });
    var bandit = new FusionBandit(3);
    bandit.update(records, function() {
        return "low";
    });
    var rec = bandit.recommend("medium", [
        "model-y"
    ]);
    assert.match((_ref = rec === null || rec === void 0 ? void 0 : rec.reason) !== null && _ref !== void 0 ? _ref : "", /global evidence 5 pass.*bucket unseen/);
});
test("bandit: ungated runs carry no verdict and are ignored", function() {
    var _ref;
    var ungated = {
        runId: "u1",
        ts: new Date().toISOString(),
        task: "t",
        gated: false,
        roles: [
            {
                role: "builder",
                modelId: "model-z",
                text: "",
                usage: undefined,
                latencyMs: 1
            }
        ],
        synthesis: undefined,
        gate: {
            rounds: 0,
            outcome: "not-run"
        },
        wallMs: 1
    };
    var bandit = new FusionBandit(1);
    bandit.update([
        ungated
    ], function() {
        return "low";
    });
    var rec = bandit.recommend("low", [
        "model-z"
    ]);
    assert.match((_ref = rec === null || rec === void 0 ? void 0 : rec.reason) !== null && _ref !== void 0 ? _ref : "", /no evidence/);
});
