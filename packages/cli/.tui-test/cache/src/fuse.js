//# hash=bcd538d6de734ff8c7a54e92d87246b1
//# sourceMappingURL=fuse.js.map

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
 * openkai fuse — run one task through the fusion core (E016 FU-1/FU-2, FU-3
 * with --gate) and print the attributed synthesis. Print-mode only; the TUI
 * panel view is Inc 06.
 */ import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { CortexClient, DEFAULT_MODEL_ID, exportFusionRunArtifact, fuse, recordFusionRun, defaultFusionLogPath } from "@openkai/core";
import { providerKeyStatus, resolveProvider } from "./providers.js";
var MAX_ROLE_PREVIEW = 1200;
var preview = function preview(text) {
    return text.length > MAX_ROLE_PREVIEW ? "".concat(text.slice(0, MAX_ROLE_PREVIEW), "\n…[").concat(text.length - MAX_ROLE_PREVIEW, " chars elided — full text in the run record]") : text;
};
var renderRole = function renderRole(output) {
    return "\n── [".concat(output.role.toUpperCase(), "] ").concat(output.modelId, " (").concat(output.latencyMs, "ms") + "".concat(output.usage ? ", ".concat(output.usage.totalTokens, " tokens") : "", ") ──\n").concat(preview(output.text));
};
var renderSynthesis = function renderSynthesis(s) {
    var lines = [
        "\n══ SYNTHESIS (".concat(s.modelId, ") ══")
    ];
    if (s.consensus.length) {
        lines.push("Consensus:");
        var _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
        try {
            for(var _iterator = s.consensus[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                var item = _step.value;
                lines.push("  • ".concat(item));
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
    }
    if (s.divergences.length) {
        lines.push("Divergences (kept, attributed):");
        var _iteratorNormalCompletion1 = true, _didIteratorError1 = false, _iteratorError1 = undefined;
        try {
            for(var _iterator1 = s.divergences[Symbol.iterator](), _step1; !(_iteratorNormalCompletion1 = (_step1 = _iterator1.next()).done); _iteratorNormalCompletion1 = true){
                var d = _step1.value;
                lines.push("  • ".concat(d.topic, " → kept: ").concat(d.kept));
                lines.push("      [ARCHITECT] ".concat(d.architect));
                lines.push("      [BUILDER]   ".concat(d.builder));
            }
        } catch (err) {
            _didIteratorError1 = true;
            _iteratorError1 = err;
        } finally{
            try {
                if (!_iteratorNormalCompletion1 && _iterator1.return != null) {
                    _iterator1.return();
                }
            } finally{
                if (_didIteratorError1) {
                    throw _iteratorError1;
                }
            }
        }
    }
    if (s.discarded.length) {
        lines.push("Discarded:");
        var _iteratorNormalCompletion2 = true, _didIteratorError2 = false, _iteratorError2 = undefined;
        try {
            for(var _iterator2 = s.discarded[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true){
                var d1 = _step2.value;
                lines.push("  • [".concat(d1.by.toUpperCase(), "] ").concat(d1.item, " — ").concat(d1.reason));
            }
        } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
        } finally{
            try {
                if (!_iteratorNormalCompletion2 && _iterator2.return != null) {
                    _iterator2.return();
                }
            } finally{
                if (_didIteratorError2) {
                    throw _iteratorError2;
                }
            }
        }
    }
    if (s.blindSpots.length) {
        lines.push("Blind spots:");
        var _iteratorNormalCompletion3 = true, _didIteratorError3 = false, _iteratorError3 = undefined;
        try {
            for(var _iterator3 = s.blindSpots[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true){
                var b = _step3.value;
                lines.push("  • ".concat(b));
            }
        } catch (err) {
            _didIteratorError3 = true;
            _iteratorError3 = err;
        } finally{
            try {
                if (!_iteratorNormalCompletion3 && _iterator3.return != null) {
                    _iterator3.return();
                }
            } finally{
                if (_didIteratorError3) {
                    throw _iteratorError3;
                }
            }
        }
    }
    if (!s.consensus.length && !s.divergences.length && !s.discarded.length && !s.blindSpots.length) {
        lines.push("  (empty synthesis)");
    }
    return lines.join("\n");
};
export function runFuse(options) {
    return _async_to_generator(function() {
        var _process_env_OPENKAI_MODEL, _options_architectModel, _options_builderModel, _ref, _options_judgeModel, provider, keyStatus, _keyStatus_needsKey, models, defaultId, resolve, architect, builder, judge, logPath, result, _options_agent, client, exported, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, output, verdict, error;
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    provider = resolveProvider(options.provider);
                    keyStatus = providerKeyStatus(provider);
                    if (!keyStatus.configured) {
                        ;
                        process.stderr.write("".concat(provider, " credentials not found: set ").concat((_keyStatus_needsKey = keyStatus.needsKey) !== null && _keyStatus_needsKey !== void 0 ? _keyStatus_needsKey : "the provider credentials", " or export them in your environment.\n"));
                        return [
                            2,
                            1
                        ];
                    }
                    models = builtinModels();
                    defaultId = (_process_env_OPENKAI_MODEL = process.env.OPENKAI_MODEL) !== null && _process_env_OPENKAI_MODEL !== void 0 ? _process_env_OPENKAI_MODEL : provider === "openrouter" ? DEFAULT_MODEL_ID : undefined;
                    resolve = function resolve(id, label) {
                        if (!id) {
                            process.stderr.write('ERROR: no default model for provider "'.concat(provider, '" — pass --').concat(label, "-model <id> (or set OPENKAI_MODEL).\n"));
                            return undefined;
                        }
                        var model = models.getModel(provider, id);
                        if (!model) {
                            process.stderr.write("ERROR: ".concat(label, ' model "').concat(id, '" not found under provider "').concat(provider, '".\n'));
                            return undefined;
                        }
                        return model;
                    };
                    architect = resolve((_options_architectModel = options.architectModel) !== null && _options_architectModel !== void 0 ? _options_architectModel : defaultId, "architect");
                    builder = resolve((_options_builderModel = options.builderModel) !== null && _options_builderModel !== void 0 ? _options_builderModel : defaultId, "builder");
                    judge = resolve((_ref = (_options_judgeModel = options.judgeModel) !== null && _options_judgeModel !== void 0 ? _options_judgeModel : options.architectModel) !== null && _ref !== void 0 ? _ref : defaultId, "judge");
                    if (!architect || !builder || !judge) return [
                        2,
                        2
                    ];
                    logPath = defaultFusionLogPath();
                    if (!options.quiet) {
                        process.stderr.write("[openkai] fuse: architect=".concat(architect.id, " builder=").concat(builder.id, " judge=").concat(judge.id, " gate=").concat(options.gate ? "on" : "off", "\n"));
                    }
                    _state.label = 1;
                case 1:
                    _state.trys.push([
                        1,
                        6,
                        ,
                        7
                    ]);
                    return [
                        4,
                        fuse(function(model, context, opts) {
                            return models.streamSimple(model, context, opts);
                        }, {
                            task: options.prompt,
                            architectModel: architect,
                            builderModel: builder,
                            judgeModel: judge,
                            gate: options.gate,
                            maxRounds: options.maxRounds
                        })
                    ];
                case 2:
                    result = _state.sent();
                    return [
                        4,
                        recordFusionRun(result.record, logPath)
                    ];
                case 3:
                    _state.sent();
                    if (!options.project) return [
                        3,
                        5
                    ];
                    client = new CortexClient({
                        baseUrl: options.api,
                        project: options.project,
                        agent: options.agent
                    });
                    return [
                        4,
                        exportFusionRunArtifact(client, result.record, (_options_agent = options.agent) !== null && _options_agent !== void 0 ? _options_agent : "openkai")
                    ];
                case 4:
                    exported = _state.sent();
                    if (exported && !options.quiet) {
                        process.stderr.write("[openkai] run artifact exported to Cortex (".concat(options.project, ")\n"));
                    }
                    _state.label = 5;
                case 5:
                    _iteratorNormalCompletion = true, _didIteratorError = false, _iteratorError = undefined;
                    try {
                        for(_iterator = result.outputs[Symbol.iterator](); !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true){
                            output = _step.value;
                            process.stdout.write("".concat(renderRole(output), "\n"));
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
                    process.stdout.write("".concat(renderSynthesis(result.synthesis), "\n"));
                    if (options.gate) {
                        verdict = result.gate.outcome === "pass" ? "PASS after ".concat(result.gate.rounds, " evaluation round(s)") : result.gate.outcome === "weak-gate" ? "WEAK GATE — baseline was green before work; gate proves nothing" : "HALT — gate still failing after the retry cap (escalate to triage)";
                        process.stdout.write("\n══ GATE: ".concat(verdict, " ══\n"));
                    }
                    if (!options.quiet) {
                        process.stderr.write("[openkai] run ".concat(result.runId, " recorded at ").concat(logPath, "\n"));
                    }
                    return [
                        2,
                        options.gate && result.gate.outcome !== "pass" ? 1 : 0
                    ];
                case 6:
                    error = _state.sent();
                    process.stderr.write("ERROR: ".concat(_instanceof(error, Error) ? error.message : String(error), "\n"));
                    return [
                        2,
                        1
                    ];
                case 7:
                    return [
                        2
                    ];
            }
        });
    })();
}
