//# hash=c9fb25f7055cec15a53f44f27699f61f
//# sourceMappingURL=tui.e2e.test.js.map

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
 * E2E smoke — drives the REAL compiled CLI in a pty (Factory/MIT tui-test).
 * Complements the headless component tests: this proves the shipped binary
 * boots the alt-screen TUI and the palette opens, end to end.
 *
 * Runs separately from `npm test` (`npm run test:e2e`) — pty tests are for
 * dev machines, not the CI gate.
 */ import { test, expect } from "@microsoft/tui-test";
import path from "node:path";
// tui-test transpiles+caches this file under .tui-test/cache/, so anchor the
// CLI path to the runner's cwd (packages/cli), never to this file's location.
var cli = path.resolve(process.cwd(), "dist/index.js");
// A dummy key: the TUI boots and renders without any network call (the
// transport resolves the model from the offline bundled catalogue; the
// first request only happens on submit, which this test never does).
test.use({
    program: {
        file: "node",
        args: [
            cli,
            "tui"
        ]
    },
    env: {
        OPENROUTER_API_KEY: "e2e-dummy-key"
    }
});
test("TUI boots: brand mark + composer + status chrome render", function(param) {
    var terminal = param.terminal;
    return _async_to_generator(function() {
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    // Fresh HOME shows the block-logo splash ("by Kaidera · <version>"); a
                    // seen-splash HOME shows the compact mark ("OpenKai <v> · by Kaidera —").
                    return [
                        4,
                        expect(terminal.getByText(/Kaidera/g, {
                            strict: false
                        })).toBeVisible({
                            timeout: 15000
                        })
                    ];
                case 1:
                    _state.sent();
                    return [
                        4,
                        expect(terminal.getByText(/idle|local/g, {
                            strict: false
                        })).toBeVisible()
                    ];
                case 2:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
test("Ctrl+K opens the command palette with the canonical footer", function(param) {
    var terminal = param.terminal;
    return _async_to_generator(function() {
        return _ts_generator(this, function(_state) {
            switch(_state.label){
                case 0:
                    return [
                        4,
                        expect(terminal.getByText(/Kaidera/g, {
                            strict: false
                        })).toBeVisible({
                            timeout: 15000
                        })
                    ];
                case 1:
                    _state.sent();
                    terminal.write("\x0B"); // Ctrl+K
                    return [
                        4,
                        expect(terminal.getByText(/Navigate/g, {
                            strict: false
                        })).toBeVisible({
                            timeout: 5000
                        })
                    ];
                case 2:
                    _state.sent();
                    return [
                        2
                    ];
            }
        });
    })();
});
